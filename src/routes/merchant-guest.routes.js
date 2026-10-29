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

const phoneAccessSchema = z.object({
  phone: z.string().min(6),
  b2bAllowed: z.boolean(),
  note: z.string().optional(),
});

const createQrSchema = z.object({
  phone: z.string().min(6),
  b2bAllowed: z.boolean().optional(),
  label: z.string().optional(),
  /** Days until expiry; omit = no expiry */
  expiresInDays: z.number().int().positive().max(365).optional(),
});

/** GET /api/merchant/guest-phones — whitelist for B2B visibility */
router.get("/guest-phones", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const rows = await prisma.guestPhoneAccess.findMany({
    where: { shopId },
    orderBy: { updatedAt: "desc" },
  });
  return ok(res, rows);
});

/** PUT /api/merchant/guest-phones — mark phone open / closed for B2B */
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
 * POST /api/merchant/guest-qr
 * Create one-time buyer QR (phone baked in).
 * Client builds deep link / print URL with `token`.
 */
router.post("/guest-qr", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const parsed = createQrSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "phone required");

  const phone = normalizePhone(parsed.data.phone);
  const b2bAllowed = Boolean(parsed.data.b2bAllowed);
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

  return ok(
    res,
    {
      id: qr.id,
      token: qr.token,
      phone: qr.phone,
      b2bAllowed: qr.b2bAllowed,
      expiresAt: qr.expiresAt,
      /** Example redeem path for Marketplace / web */
      redeemPath: `/guest?token=${qr.token}`,
    },
    { created: true },
  );
});

/** GET /api/merchant/guest-qr — list QRs for this shop */
router.get("/guest-qr", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const rows = await prisma.guestQr.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ok(res, rows);
});

/** POST /api/merchant/guest-qr/:id/revoke */
router.post("/guest-qr/:id/revoke", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const existing = await prisma.guestQr.findFirst({
    where: { id: req.params.id, shopId },
  });
  if (!existing) return fail(res, 404, "QR not found");
  const qr = await prisma.guestQr.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return ok(res, qr);
});

/**
 * PATCH /api/merchant/channels
 * Body: { listingMode: "b2c" | "b2b" | "both" | "portfolio" }
 * (also accepts legacy b2cEnabled/b2bEnabled booleans)
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
  return ok(res, publicShopChannels(features));
});

/** GET /api/merchant/channels — current listing mode */
router.get("/channels", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const features = await prisma.shopFeatures.findUnique({ where: { shopId } });
  return ok(res, publicShopChannels(features));
});

export default router;
