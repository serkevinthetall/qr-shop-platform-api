/**
 * Admin ↔ Merchant portal messages (not buyer chat).
 * Mounted at /api/admin/portal and /api/merchant/portal
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail } from "../lib/merchant-auth.js";
import { publishMessageEvent } from "../lib/realtime.js";

const createSchema = z.object({
  shopId: z.string().min(1).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(8000),
});

const sendSchema = z.object({
  body: z.string().min(1).max(8000),
});

function publicThread(row, { includeMessages = false } = {}) {
  const out = {
    id: row.id,
    shopId: row.shopId,
    shopName: row.shop?.name || row.shopName || "",
    subject: row.subject || "Message",
    updatedAt: (row.lastAt || row.updatedAt)?.toISOString?.()
      ? (row.lastAt || row.updatedAt).toISOString()
      : row.lastAt || row.updatedAt,
    unreadForAdmin: row.unreadForAdmin || 0,
    unreadForMerchant: row.unreadForMerchant || 0,
    lastMessage: row.lastMessage || null,
  };
  if (includeMessages && Array.isArray(row.messages)) {
    out.messages = row.messages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      from: m.from === "admin" ? "admin" : "merchant",
      body: m.body,
      createdAt:
        typeof m.createdAt === "string" ? m.createdAt : m.createdAt.toISOString(),
    }));
  }
  return out;
}

function publishPortal(thread, messageId, action) {
  publishMessageEvent(
    {
      id: messageId,
      shopId: thread.shopId,
      threadId: thread.id,
      channel: "portal",
    },
    action,
  );
}

/** Admin router — /api/admin/portal/... */
export const adminPortalRouter = Router();
adminPortalRouter.use(requireAuth, requireRole("admin"));

adminPortalRouter.get("/threads", async (_req, res) => {
  try {
    const list = await prisma.portalThread.findMany({
      include: { shop: { select: { name: true } } },
      orderBy: { lastAt: "desc" },
      take: 300,
    });
    return ok(res, list.map((t) => publicThread(t)));
  } catch (err) {
    console.error("admin portal threads", err);
    return fail(res, 500, "Could not load messages", "db_error");
  }
});

adminPortalRouter.get("/threads/:id", async (req, res) => {
  try {
    const thread = await prisma.portalThread.findUnique({
      where: { id: req.params.id },
      include: {
        shop: { select: { name: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 500 },
      },
    });
    if (!thread) return fail(res, 404, "Thread not found");
    return ok(res, publicThread(thread, { includeMessages: true }));
  } catch (err) {
    console.error("admin portal get", err);
    return fail(res, 500, "Could not load thread", "db_error");
  }
});

adminPortalRouter.post("/threads", async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid message");
    const shopId = String(parsed.data.shopId || "").trim();
    if (!shopId) return fail(res, 400, "Shop required");

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, name: true },
    });
    if (!shop) return fail(res, 404, "Shop not found");

    const body = parsed.data.body.trim();
    const subject = (parsed.data.subject || "").trim() || "Message from admin";

    const thread = await prisma.$transaction(async (tx) => {
      const created = await tx.portalThread.create({
        data: {
          shopId: shop.id,
          subject,
          lastMessage: body.slice(0, 240),
          lastAt: new Date(),
          unreadForAdmin: 0,
          unreadForMerchant: 1,
          messages: {
            create: { from: "admin", body },
          },
        },
        include: {
          shop: { select: { name: true } },
          messages: { orderBy: { createdAt: "asc" }, take: 20 },
        },
      });
      return created;
    });

    const firstMsg = thread.messages?.[0];
    publishPortal(thread, firstMsg?.id || thread.id, "created");
    return ok(res, publicThread(thread, { includeMessages: true }), { created: true });
  } catch (err) {
    console.error("admin portal create", err);
    return fail(res, 500, "Could not create message", "db_error");
  }
});

adminPortalRouter.post("/threads/:id/messages", async (req, res) => {
  try {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid message");

    const thread = await prisma.portalThread.findUnique({
      where: { id: req.params.id },
    });
    if (!thread) return fail(res, 404, "Thread not found");

    const body = parsed.data.body.trim();
    const msg = await prisma.$transaction(async (tx) => {
      const created = await tx.portalMessage.create({
        data: { threadId: thread.id, from: "admin", body },
      });
      await tx.portalThread.update({
        where: { id: thread.id },
        data: {
          lastMessage: body.slice(0, 240),
          lastAt: new Date(),
          unreadForMerchant: { increment: 1 },
        },
      });
      return created;
    });

    publishPortal(thread, msg.id, "replied");
    return ok(
      res,
      {
        threadId: thread.id,
        message: {
          id: msg.id,
          threadId: msg.threadId,
          from: "admin",
          body: msg.body,
          createdAt: msg.createdAt.toISOString(),
        },
      },
      { created: true },
    );
  } catch (err) {
    console.error("admin portal send", err);
    return fail(res, 500, "Could not send message", "db_error");
  }
});

adminPortalRouter.post("/threads/:id/read", async (req, res) => {
  try {
    const thread = await prisma.portalThread.update({
      where: { id: req.params.id },
      data: { unreadForAdmin: 0 },
      include: { shop: { select: { name: true } } },
    });
    return ok(res, publicThread(thread));
  } catch (err) {
    if (err?.code === "P2025") return fail(res, 404, "Thread not found");
    return fail(res, 500, "Could not mark read", "db_error");
  }
});

/** Merchant router — /api/merchant/portal/... */
export const merchantPortalRouter = Router();
merchantPortalRouter.use(requireAuth, requireRole("merchant", "staff"));

merchantPortalRouter.get("/threads", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const list = await prisma.portalThread.findMany({
      where: { shopId },
      include: { shop: { select: { name: true } } },
      orderBy: { lastAt: "desc" },
      take: 200,
    });
    return ok(res, list.map((t) => publicThread(t)));
  } catch (err) {
    console.error("merchant portal threads", err);
    return fail(res, 500, "Could not load messages", "db_error");
  }
});

merchantPortalRouter.get("/threads/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const thread = await prisma.portalThread.findFirst({
      where: { id: req.params.id, shopId },
      include: {
        shop: { select: { name: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 500 },
      },
    });
    if (!thread) return fail(res, 404, "Thread not found");
    return ok(res, publicThread(thread, { includeMessages: true }));
  } catch (err) {
    console.error("merchant portal get", err);
    return fail(res, 500, "Could not load thread", "db_error");
  }
});

merchantPortalRouter.post("/threads", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid message");

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, name: true },
    });
    if (!shop) return fail(res, 404, "Shop not found");

    const body = parsed.data.body.trim();
    const subject = (parsed.data.subject || "").trim() || "Message from shop";

    const thread = await prisma.$transaction(async (tx) => {
      return tx.portalThread.create({
        data: {
          shopId: shop.id,
          subject,
          lastMessage: body.slice(0, 240),
          lastAt: new Date(),
          unreadForAdmin: 1,
          unreadForMerchant: 0,
          messages: {
            create: { from: "merchant", body },
          },
        },
        include: {
          shop: { select: { name: true } },
          messages: { orderBy: { createdAt: "asc" }, take: 20 },
        },
      });
    });

    const firstMsg = thread.messages?.[0];
    publishPortal(thread, firstMsg?.id || thread.id, "created");
    return ok(res, publicThread(thread, { includeMessages: true }), { created: true });
  } catch (err) {
    console.error("merchant portal create", err);
    return fail(res, 500, "Could not create message", "db_error");
  }
});

merchantPortalRouter.post("/threads/:id/messages", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid message");

    const thread = await prisma.portalThread.findFirst({
      where: { id: req.params.id, shopId },
    });
    if (!thread) return fail(res, 404, "Thread not found");

    const body = parsed.data.body.trim();
    const msg = await prisma.$transaction(async (tx) => {
      const created = await tx.portalMessage.create({
        data: { threadId: thread.id, from: "merchant", body },
      });
      await tx.portalThread.update({
        where: { id: thread.id },
        data: {
          lastMessage: body.slice(0, 240),
          lastAt: new Date(),
          unreadForAdmin: { increment: 1 },
        },
      });
      return created;
    });

    publishPortal(thread, msg.id, "replied");
    return ok(
      res,
      {
        threadId: thread.id,
        message: {
          id: msg.id,
          threadId: msg.threadId,
          from: "merchant",
          body: msg.body,
          createdAt: msg.createdAt.toISOString(),
        },
      },
      { created: true },
    );
  } catch (err) {
    console.error("merchant portal send", err);
    return fail(res, 500, "Could not send message", "db_error");
  }
});

merchantPortalRouter.post("/threads/:id/read", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const existing = await prisma.portalThread.findFirst({
      where: { id: req.params.id, shopId },
    });
    if (!existing) return fail(res, 404, "Thread not found");

    const thread = await prisma.portalThread.update({
      where: { id: existing.id },
      data: { unreadForMerchant: 0 },
      include: { shop: { select: { name: true } } },
    });
    return ok(res, publicThread(thread));
  } catch (err) {
    return fail(res, 500, "Could not mark read", "db_error");
  }
});
