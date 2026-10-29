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

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

const sendSchema = z.object({
  text: z.string().min(1).max(4000),
});

function publicThread(row, { includeMessages = false } = {}) {
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
      where: { shopId },
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
      where: { id: req.params.id, shopId },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 300 },
      },
    });
    if (!thread) return fail(res, 404, "Chat not found");
    return ok(res, publicThread(thread, { includeMessages: true }));
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
    });
    if (!thread) return fail(res, 404, "Chat not found");

    const text = parsed.data.text.trim();
    const msg = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          threadId: thread.id,
          from: "merchant",
          text,
        },
      });
      await tx.chatThread.update({
        where: { id: thread.id },
        data: { lastMessage: text.slice(0, 240), lastAt: new Date() },
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

    return ok(
      res,
      {
        threadId: thread.id,
        message: {
          id: msg.id,
          threadId: msg.threadId,
          from: "merchant",
          text: msg.text,
          productId: null,
          productName: null,
          createdAt: msg.createdAt,
        },
      },
      { created: true },
    );
  } catch (err) {
    console.error("merchant chat send", err);
    return fail(res, 500, "Could not send reply", "db_error");
  }
});

export default router;
