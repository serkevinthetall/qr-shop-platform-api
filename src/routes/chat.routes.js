/**
 * Buyer ↔ merchant shop chat (Marketplace).
 * Threads are unique per shop + buyer phone.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { normalizePhone } from "../lib/phone.js";
import { publishMessageEvent } from "../lib/realtime.js";
import {
  isoOrNull,
  messageIsReadByPeer,
  unreadForBuyer,
} from "../lib/chat-read.js";

const router = Router();

const sendSchema = z.object({
  text: z.string().min(1).max(4000),
  productId: z.string().optional(),
  productName: z.string().optional(),
  productImageUrl: z.string().optional(),
  productPriceLabel: z.string().optional(),
  channel: z.enum(["app", "website"]).optional(),
});

function publicThread(row, { includeMessages = false } = {}) {
  const buyerLastReadAt = isoOrNull(row.buyerLastReadAt);
  const merchantLastReadAt = isoOrNull(row.merchantLastReadAt);
  const out = {
    id: row.id,
    shopId: row.shopId,
    shopName: row.shop?.name ?? null,
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    buyerPhone: row.buyerPhone,
    channel: row.channel === "website" ? "website" : "app",
    lastMessage: row.lastMessage,
    lastAt: row.lastAt,
    createdAt: row.createdAt,
    buyerLastReadAt,
    merchantLastReadAt,
    unread: unreadForBuyer(row),
  };
  if (includeMessages && Array.isArray(row.messages)) {
    out.messages = row.messages.map((m) => publicMessage(m, row.merchantLastReadAt));
  }
  return out;
}

function publicMessage(m, merchantLastReadAt) {
  return {
    id: m.id,
    threadId: m.threadId,
    from: m.from === "merchant" ? "merchant" : "buyer",
    text: m.text,
    productId: m.productId || null,
    productName: m.productName || null,
    productImageUrl: m.productImageUrl || null,
    productPriceLabel: m.productPriceLabel || null,
    createdAt: m.createdAt,
    /** Buyer → merchant: green ticks when merchant has opened past this message. */
    read:
      m.from === "buyer"
        ? messageIsReadByPeer(m.createdAt, merchantLastReadAt)
        : false,
  };
}

async function loadBuyer(req) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, name: true, phone: true, role: true },
  });
  if (!user || user.role !== "buyer") return null;
  if (!user.phone) return null;
  return {
    id: user.id,
    name: user.name || "Buyer",
    phone: normalizePhone(user.phone),
  };
}

async function upsertThread({ shopId, buyer, channel }) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.status !== "approved") {
    return { error: { status: 404, message: "Shop not found" } };
  }

  const existing = await prisma.chatThread.findUnique({
    where: {
      shopId_buyerPhone: { shopId, buyerPhone: buyer.phone },
    },
  });
  if (existing) {
    const updated = await prisma.chatThread.update({
      where: { id: existing.id },
      data: {
        buyerId: buyer.id,
        buyerName: buyer.name,
        buyerHiddenAt: null,
        ...(channel ? { channel } : {}),
      },
      include: { shop: { select: { id: true, name: true } } },
    });
    return { thread: updated, shop };
  }

  const created = await prisma.chatThread.create({
    data: {
      shopId,
      buyerId: buyer.id,
      buyerName: buyer.name,
      buyerPhone: buyer.phone,
      channel: channel === "website" ? "website" : "app",
    },
    include: { shop: { select: { id: true, name: true } } },
  });
  return { thread: created, shop };
}

/** GET /api/chat/threads — buyer inbox */
router.get("/threads", requireAuth, requireRole("buyer"), async (req, res) => {
  try {
    const buyer = await loadBuyer(req);
    if (!buyer) return fail(res, 400, "Buyer phone required");

    const list = await prisma.chatThread.findMany({
      where: {
        buyerHiddenAt: null,
        OR: [{ buyerId: buyer.id }, { buyerPhone: buyer.phone }],
      },
      include: { shop: { select: { id: true, name: true } } },
      orderBy: { lastAt: "desc" },
      take: 100,
    });
    return ok(res, list.map((t) => publicThread(t)));
  } catch (err) {
    console.error("chat threads list", err);
    return fail(res, 500, "Could not load chats", "db_error");
  }
});

/** GET /api/chat/with-shop/:shopId — open / create thread for this shop */
router.get(
  "/with-shop/:shopId",
  requireAuth,
  requireRole("buyer"),
  async (req, res) => {
    try {
      const buyer = await loadBuyer(req);
      if (!buyer) return fail(res, 400, "Buyer phone required");

      const channel =
        String(req.headers["x-qr-client"] || "").toLowerCase() === "web"
          ? "website"
          : "app";
      const result = await upsertThread({
        shopId: req.params.shopId,
        buyer,
        channel,
      });
      if (result.error) {
        return fail(res, result.error.status, result.error.message);
      }

      const now = new Date();
      const full = await prisma.chatThread.update({
        where: { id: result.thread.id },
        data: { buyerLastReadAt: now },
        include: {
          shop: { select: { id: true, name: true } },
          messages: { orderBy: { createdAt: "asc" }, take: 200 },
        },
      });
      return ok(res, publicThread(full, { includeMessages: true }));
    } catch (err) {
      console.error("chat with-shop get", err);
      return fail(res, 500, "Could not open chat", "db_error");
    }
  },
);

/** POST /api/chat/with-shop/:shopId/messages — buyer send */
router.post(
  "/with-shop/:shopId/messages",
  requireAuth,
  requireRole("buyer"),
  async (req, res) => {
    try {
      const buyer = await loadBuyer(req);
      if (!buyer) return fail(res, 400, "Buyer phone required");

      const parsed = sendSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, "Invalid message");

      const headerChannel =
        String(req.headers["x-qr-client"] || "").toLowerCase() === "web"
          ? "website"
          : "app";
      const channel = parsed.data.channel || headerChannel;

      const result = await upsertThread({
        shopId: req.params.shopId,
        buyer,
        channel,
      });
      if (result.error) {
        return fail(res, result.error.status, result.error.message);
      }

      const text = parsed.data.text.trim();
      const msg = await prisma.$transaction(async (tx) => {
        const created = await tx.chatMessage.create({
          data: {
            threadId: result.thread.id,
            from: "buyer",
            text,
            productId: parsed.data.productId || null,
            productName: parsed.data.productName?.trim() || null,
            productImageUrl: parsed.data.productImageUrl?.trim() || null,
            productPriceLabel: parsed.data.productPriceLabel?.trim() || null,
          },
        });
        const now = new Date();
        await tx.chatThread.update({
          where: { id: result.thread.id },
          data: {
            lastMessage: text.slice(0, 240),
            lastAt: now,
            buyerLastReadAt: now,
            buyerHiddenAt: null,
            merchantHiddenAt: null,
          },
        });
        return created;
      });

      publishMessageEvent(
        {
          id: msg.id,
          shopId: result.thread.shopId,
          buyerContact: buyer.phone,
          buyerId: buyer.id,
          threadId: result.thread.id,
        },
        "created",
      );

      return ok(
        res,
        {
          threadId: result.thread.id,
          message: publicMessage(msg, result.thread.merchantLastReadAt),
        },
        { created: true },
      );
    } catch (err) {
      console.error("chat buyer send", err);
      return fail(res, 500, "Could not send message", "db_error");
    }
  },
);

/** GET /api/chat/threads/:id — buyer thread detail */
router.get("/threads/:id", requireAuth, requireRole("buyer"), async (req, res) => {
  try {
    const buyer = await loadBuyer(req);
    if (!buyer) return fail(res, 400, "Buyer phone required");

    const thread = await prisma.chatThread.findFirst({
      where: {
        id: req.params.id,
        buyerHiddenAt: null,
        OR: [{ buyerId: buyer.id }, { buyerPhone: buyer.phone }],
      },
      include: {
        shop: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    });
    if (!thread) return fail(res, 404, "Chat not found");

    const now = new Date();
    const updated = await prisma.chatThread.update({
      where: { id: thread.id },
      data: { buyerLastReadAt: now },
      include: {
        shop: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    });
    return ok(res, publicThread(updated, { includeMessages: true }));
  } catch (err) {
    console.error("chat thread get", err);
    return fail(res, 500, "Could not load chat", "db_error");
  }
});

/** DELETE /api/chat/threads/:id — hide conversation from buyer inbox */
router.delete("/threads/:id", requireAuth, requireRole("buyer"), async (req, res) => {
  try {
    const buyer = await loadBuyer(req);
    if (!buyer) return fail(res, 400, "Buyer phone required");

    const result = await prisma.chatThread.updateMany({
      where: {
        id: req.params.id,
        OR: [{ buyerId: buyer.id }, { buyerPhone: buyer.phone }],
      },
      data: { buyerHiddenAt: new Date() },
    });
    if (result.count === 0) return fail(res, 404, "Chat not found");
    return ok(res, { deleted: true });
  } catch (err) {
    console.error("chat thread delete", err);
    return fail(res, 500, "Could not delete conversation", "db_error");
  }
});

export default router;
