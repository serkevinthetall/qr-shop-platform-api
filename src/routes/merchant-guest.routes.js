import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { normalizePhone } from "../lib/phone.js";
import {
  featuresPayloadForMode,
  normalizeListingMode,
  publicShopChannels,
} from "../lib/shop-channels.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

function shopIdOrFail(req, res) {
  if (!req.user.shopId) {
    fail(res, 403, "No shop on account");
    return null;
  }
  return req.user.shopId;
}

function linkStatus(qr) {
  if (qr.revokedAt) return "revoked";
  if (qr.expiresAt && qr.expiresAt.getTime() < Date.now()) return "expired";
  if (qr.activatedAt) return "active";
  return "pending";
}

function serializeLink(qr, shop) {
  const channel = qr.b2bAllowed ? "b2b" : "b2c";
  const shopKey = shop?.slug || shop?.id || qr.shopId;
  return {
    id: qr.id,
    token: qr.token,
    phone: qr.phone,
    name: qr.name ?? null,
    address: qr.address ?? null,
    label: qr.label ?? null,
    b2bAllowed: qr.b2bAllowed,
    fromEasyCheckout: Boolean(qr.fromEasyCheckout),
    channel,
    channelLabel: qr.b2bAllowed ? "Wholesale" : "Retail",
    status: linkStatus(qr),
    activatedAt: qr.activatedAt,
    revokedAt: qr.revokedAt,
    expiresAt: qr.expiresAt,
    createdAt: qr.createdAt,
    updatedAt: qr.updatedAt,
    /** Marketplace personal link — phone first, then shop */
    redeemPath: `/guest?t=${qr.token}`,
    redeemUrlPath: `/s/${encodeURIComponent(shopKey)}?t=${qr.token}`,
  };
}

const phoneAccessSchema = z.object({
  phone: z.string().min(6),
  b2bAllowed: z.boolean(),
  note: z.string().optional(),
});

const createLinkSchema = z.object({
  phone: z.string().min(6),
  /** true = Wholesale, false = Retail */
  b2bAllowed: z.boolean().optional(),
  channel: z.enum(["b2c", "b2b"]).optional(),
  label: z.string().max(120).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

const patchLinkSchema = z.object({
  b2bAllowed: z.boolean().optional(),
  channel: z.enum(["b2c", "b2b"]).optional(),
  label: z.string().max(120).nullable().optional(),
});

/** GET /api/merchant/guest-phones — legacy whitelist */
router.get("/guest-phones", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const rows = await prisma.guestPhoneAccess.findMany({
    where: { shopId },
    orderBy: { updatedAt: "desc" },
  });
  return ok(res, rows);
});

/** PUT /api/merchant/guest-phones — legacy */
router.put("/guest-phones", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const parsed = phoneAccessSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "phone and b2bAllowed required");

  const phone = normalizePhone(parsed.data.phone);
  const row = await prisma.guestPhoneAccess.upsert({
    where: { shopId_phone: { shopId, phone } },
    create: {
      shopId,
      phone,
      b2bAllowed: parsed.data.b2bAllowed,
      note: parsed.data.note,
    },
    update: {
      b2bAllowed: parsed.data.b2bAllowed,
      note: parsed.data.note,
    },
  });
  return ok(res, row);
});

/**
 * POST /api/merchant/guest-qr — create External user personal link
 */
router.post("/guest-qr", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const parsed = createLinkSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "phone required");

  const phone = normalizePhone(parsed.data.phone);
  let b2bAllowed = Boolean(parsed.data.b2bAllowed);
  if (parsed.data.channel === "b2b") b2bAllowed = true;
  if (parsed.data.channel === "b2c") b2bAllowed = false;

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt =
    parsed.data.expiresInDays != null
      ? new Date(Date.now() + parsed.data.expiresInDays * 86400000)
      : null;

  await prisma.guestPhoneAccess.upsert({
    where: { shopId_phone: { shopId, phone } },
    create: { shopId, phone, b2bAllowed },
    update: { b2bAllowed },
  });

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  const qr = await prisma.guestQr.create({
    data: {
      token,
      shopId,
      phone,
      b2bAllowed,
      label: parsed.data.label,
      expiresAt,
      createdById: req.user.sub,
    },
  });

  return ok(res, serializeLink(qr, shop), { created: true });
});

/** GET /api/merchant/guest-qr — External users / Easy checkout list */
router.get("/guest-qr", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  const q = String(req.query.q || "").trim().toLowerCase();
  const rows = await prisma.guestQr.findMany({
    where: { shopId },
    orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  let list = rows.map((r) => serializeLink(r, shop));
  if (q) {
    list = list.filter((r) => {
      const phone = String(r.phone || "").toLowerCase();
      const digits = phone.replace(/\D/g, "");
      const qDigits = q.replace(/\D/g, "");
      const label = String(r.label || "").toLowerCase();
      const token = String(r.token || "").toLowerCase();
      if (phone.includes(q) || label.includes(q) || token.includes(q)) return true;
      if (qDigits && digits.includes(qDigits)) return true;
      if (q.includes(token) || (r.redeemPath && q.includes(r.token))) return true;
      if (q.includes("t=") && q.includes(r.token)) return true;
      return false;
    });
  }
  return ok(res, list);
});

/** PATCH /api/merchant/guest-qr/:id — flip Retail/Wholesale on same link */
router.patch("/guest-qr/:id", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const parsed = patchLinkSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Invalid patch");

  const existing = await prisma.guestQr.findFirst({
    where: { id: req.params.id, shopId },
  });
  if (!existing) return fail(res, 404, "Link not found");
  if (existing.revokedAt) return fail(res, 400, "Link is revoked");

  let b2bAllowed = existing.b2bAllowed;
  if (parsed.data.b2bAllowed !== undefined) b2bAllowed = parsed.data.b2bAllowed;
  if (parsed.data.channel === "b2b") b2bAllowed = true;
  if (parsed.data.channel === "b2c") b2bAllowed = false;

  const data = { b2bAllowed };
  if (parsed.data.label !== undefined) data.label = parsed.data.label;

  const qr = await prisma.guestQr.update({
    where: { id: existing.id },
    data,
  });

  await prisma.guestPhoneAccess.upsert({
    where: { shopId_phone: { shopId, phone: existing.phone } },
    create: { shopId, phone: existing.phone, b2bAllowed },
    update: { b2bAllowed },
  });

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  return ok(res, serializeLink(qr, shop));
});

/** POST /api/merchant/guest-qr/:id/revoke */
router.post("/guest-qr/:id/revoke", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const existing = await prisma.guestQr.findFirst({
    where: { id: req.params.id, shopId },
  });
  if (!existing) return fail(res, 404, "Link not found");
  const qr = await prisma.guestQr.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  return ok(res, serializeLink(qr, shop));
});

/**
 * PATCH /api/merchant/channels
 */
router.patch("/channels", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  if (req.user.role === "staff") {
    return fail(res, 403, "Only the merchant owner can change channels");
  }

  let mode = normalizeListingMode(req.body.listingMode);
  if (!mode) {
    const b2c = req.body.b2cEnabled;
    const b2b = req.body.b2bEnabled;
    if (b2c === false && b2b === false) mode = "portfolio";
    else if (b2c === true && b2b === true) mode = "both";
    else if (b2b === true && b2c === false) mode = "b2b";
    else if (b2c === true && b2b === false) mode = "b2c";
  }
  if (!mode) {
    return fail(
      res,
      400,
      'listingMode required: "b2c" | "b2b" | "both" | "portfolio"',
    );
  }

  const payload = featuresPayloadForMode(mode);
  const features = await prisma.shopFeatures.upsert({
    where: { shopId },
    create: { shopId, ...payload },
    update: payload,
  });

  /** Catalog only → remove from Marketplace + App; keep Shop QR / own page. */
  if (mode === "portfolio") {
    await prisma.product.updateMany({
      where: { shopId },
      data: { sellOnMarketplace: false, sellOnApp: false },
    });
  }

  return ok(res, publicShopChannels(features));
});

router.get("/channels", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const features = await prisma.shopFeatures.findUnique({ where: { shopId } });
  return ok(res, publicShopChannels(features));
});

export default router;
