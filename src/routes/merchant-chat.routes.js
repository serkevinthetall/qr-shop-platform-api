/**
 * Merchant inbox for buyer shop chats.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail } from "../lib/merchant-auth.js";
import { publishMessageEvent } from "../lib/realtime.js";
import { notifyBuyerChatReply } from "../lib/buyer-notify.js";
import {
  isoOrNull,
  messageIsReadByPeer,
  unreadForMerchant,
} from "../lib/chat-read.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

const sendSchema = z
  .object({
    text: z.string().max(4000).optional(),
    productId: z.string().optional(),
    productName: z.string().optional(),
    productImageUrl: z.string().optional(),
    productPriceLabel: z.string().optional(),
  })
  .refine(
    (v) =>
      Boolean(String(v.text || "").trim()) ||
      Boolean(String(v.productName || "").trim()) ||
      Boolean(String(v.productId || "").trim()),
    { message: "Message or product required" },
  );

function publicThread(row, { includeMessages = false } = {}) {
  const buyerLastReadAt = isoOrNull(row.buyerLastReadAt);
  const merchantLastReadAt = isoOrNull(row.merchantLastReadAt);
  const out = {
    id: row.id,
    shopId: row.shopId,
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    buyerPhone: row.buyerPhone,
    channel: row.channel === "website" ? "website" : "app",
    lastMessage: row.lastMessage,
    lastAt: row.lastAt,
    createdAt: row.createdAt,
    buyerLastReadAt,
    merchantLastReadAt,
    unreadForMerchant: unreadForMerchant(row),
  };
  if (includeMessages && Array.isArray(row.messages)) {
    out.messages = row.messages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      from: m.from === "merchant" ? "merchant" : "buyer",
      text: m.text,
      productId: m.productId || null,
      productName: m.productName || null,
      productImageUrl: m.productImageUrl || null,
      productPriceLabel: m.productPriceLabel || null,
      createdAt: m.createdAt,
      /** Merchant → buyer: green ticks when buyer has opened past this message. */
      read:
        m.from === "merchant"
          ? messageIsReadByPeer(m.createdAt, row.buyerLastReadAt)
          : false,
    }));
  }
  return out;
}

/** GET /api/merchant/chat/threads */
router.get("/chat/threads", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const list = await prisma.chatThread.findMany({
      where: { shopId, merchantHiddenAt: null },
      orderBy: { lastAt: "desc" },
      take: 200,
    });
    return ok(res, list.map((t) => publicThread(t)));
  } catch (err) {
    console.error("merchant chat threads", err);
    return fail(res, 500, "Could not load messages", "db_error");
  }
});

/** GET /api/merchant/chat/threads/:id */
router.get("/chat/threads/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const thread = await prisma.chatThread.findFirst({
      where: { id: req.params.id, shopId, merchantHiddenAt: null },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 300 },
      },
    });
    if (!thread) return fail(res, 404, "Chat not found");

    const now = new Date();
    const updated = await prisma.chatThread.update({
      where: { id: thread.id },
      data: { merchantLastReadAt: now },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 300 },
      },
    });
    return ok(res, publicThread(updated, { includeMessages: true }));
  } catch (err) {
    console.error("merchant chat get", err);
    return fail(res, 500, "Could not load chat", "db_error");
  }
});

/** POST /api/merchant/chat/threads/:id/messages — merchant reply */
router.post("/chat/threads/:id/messages", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid message");

    const thread = await prisma.chatThread.findFirst({
      where: { id: req.params.id, shopId },
      include: { shop: { select: { name: true } } },
    });
    if (!thread) return fail(res, 404, "Chat not found");

    const text =
      String(parsed.data.text || "").trim() ||
      (parsed.data.productName
        ? `Shared: ${String(parsed.data.productName).trim()}`
        : "");
    const productId = parsed.data.productId?.trim() || null;
    const productName = parsed.data.productName?.trim() || null;
    const productImageUrl = parsed.data.productImageUrl?.trim() || null;
    const productPriceLabel = parsed.data.productPriceLabel?.trim() || null;

    const msg = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          threadId: thread.id,
          from: "merchant",
          text,
          productId,
          productName,
          productImageUrl,
          productPriceLabel,
        },
      });
      const now = new Date();
      await tx.chatThread.update({
        where: { id: thread.id },
        data: {
          lastMessage: text.slice(0, 240),
          lastAt: now,
          merchantLastReadAt: now,
          buyerHiddenAt: null,
          merchantHiddenAt: null,
        },
      });
      return created;
    });

    publishMessageEvent(
      {
        id: msg.id,
        shopId,
        buyerContact: thread.buyerPhone,
        buyerId: thread.buyerId,
        threadId: thread.id,
      },
      "replied",
    );

    if (thread.buyerId) {
      notifyBuyerChatReply({
        buyerId: thread.buyerId,
        shopId,
        threadId: thread.id,
        shopName: thread.shop?.name || null,
        text,
      });
    }

    return ok(
      res,
      {
        threadId: thread.id,
        message: {
          id: msg.id,
          threadId: msg.threadId,
          from: "merchant",
          text: msg.text,
          productId: msg.productId,
          productName: msg.productName,
          productImageUrl: msg.productImageUrl,
          productPriceLabel: msg.productPriceLabel,
          createdAt: msg.createdAt,
          read: messageIsReadByPeer(msg.createdAt, thread.buyerLastReadAt),
        },
      },
      { created: true },
    );
  } catch (err) {
    console.error("merchant chat send", err);
    return fail(res, 500, "Could not send reply", "db_error");
  }
});

/** DELETE /api/merchant/chat/threads/:id — hide conversation from merchant inbox */
router.delete("/chat/threads/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const result = await prisma.chatThread.updateMany({
      where: { id: req.params.id, shopId },
      data: { merchantHiddenAt: new Date() },
    });
    if (result.count === 0) return fail(res, 404, "Chat not found");
    return ok(res, { deleted: true });
  } catch (err) {
    console.error("merchant chat delete", err);
    return fail(res, 500, "Could not delete conversation", "db_error");
  }
});

export default router;
