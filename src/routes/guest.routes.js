import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireGuest } from "../middlewares/auth.middleware.js";
import { issueGuestSession } from "../lib/auth-session.js";
import { normalizePhone } from "../lib/phone.js";
import {
  pricesForContext,
  resolvePricingContext,
} from "../lib/pricing-context.js";

const router = Router();

const redeemSchema = z.object({
  token: z.string().min(8),
  name: z.string().min(1).optional(),
});

const openRegisterSchema = z.object({
  shopId: z.string().min(1),
  name: z.string().min(1).max(120),
  phone: z.string().min(6).max(32),
  address: z.string().min(3).max(500),
  /** When shop offers both, buyer picks wholesale (B2B) vs retail (B2C). */
  channel: z.enum(["b2c", "b2b"]).optional(),
});

/**
 * POST /api/auth/guest/open
 * Shop QR landing — buyer enters name, phone, address (no pre-baked QR phone).
 * Opens guest session; B2B only if shop listing allows and channel=b2b (or shop is b2b-only).
 */
router.post("/open", async (req, res) => {
  try {
    const parsed = openRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 400, "Name, phone, address, and shop are required");
    }

    const shop = await prisma.shop.findFirst({
      where: {
        OR: [{ id: parsed.data.shopId }, { slug: parsed.data.shopId }],
      },
      include: { features: true },
    });
    if (!shop || shop.status !== "approved") {
      return fail(res, 404, "Shop not found or not available");
    }

    const phone = normalizePhone(parsed.data.phone);
    const ctx = await resolvePricingContext(shop.id, null);
    if (!ctx) return fail(res, 404, "Shop not found");
    if (ctx.portfolioOnly) {
      return fail(res, 403, "This shop is browse-only (no ordering)");
    }
    if (!ctx.shopOffersB2c && !ctx.shopOffersB2b) {
      return fail(res, 403, "No sales channel open for this shop");
    }

    let wantB2b = false;
    if (ctx.shopOffersB2b && !ctx.shopOffersB2c) {
      wantB2b = true;
    } else if (ctx.shopOffersB2b && ctx.shopOffersB2c) {
      wantB2b = parsed.data.channel === "b2b";
    }

    await prisma.guestPhoneAccess.upsert({
      where: { shopId_phone: { shopId: shop.id, phone } },
      create: { shopId: shop.id, phone, b2bAllowed: wantB2b },
      update: { b2bAllowed: wantB2b },
    });

    const priced = await resolvePricingContext(shop.id, phone);
    if (!priced) return fail(res, 404, "Shop not found");

    const session = issueGuestSession({
      phone,
      shopId: shop.id,
      b2bAllowed: priced.b2bAllowed,
      b2cEnabled: priced.b2cEnabled,
      b2bEnabled: priced.b2bEnabled,
      listingMode: priced.listingMode,
      portfolioOnly: priced.portfolioOnly,
      canOrder: priced.canOrder,
      name: parsed.data.name.trim(),
    });

    return ok(res, {
      ...session,
      shop: { id: shop.id, name: shop.name, slug: shop.slug },
      address: parsed.data.address.trim(),
      pricing: {
        listingMode: priced.listingMode,
        portfolioOnly: priced.portfolioOnly,
        canOrder: priced.canOrder,
        b2cEnabled: priced.b2cEnabled,
        b2bEnabled: priced.b2bEnabled,
        showBoth: priced.showBoth,
      },
    });
  } catch (err) {
    console.error("guest open register", err);
    return fail(res, 500, "Could not start guest session", "db_error");
  }
});

/**
 * POST /api/auth/guest/qr
 * Redeem merchant-issued QR token → guest JWT (phone baked in, no User row).
 */
router.post("/qr", async (req, res) => {
  try {
    const parsed = redeemSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "QR token required");

    const qr = await prisma.guestQr.findUnique({
      where: { token: parsed.data.token },
      include: { shop: { include: { features: true } } },
    });
    if (!qr || qr.revokedAt) {
      return fail(res, 404, "QR code is invalid or revoked", "qr_invalid");
    }
    if (qr.expiresAt && qr.expiresAt.getTime() < Date.now()) {
      return fail(res, 410, "QR code has expired", "qr_expired");
    }
    if (qr.shop.status !== "approved") {
      return fail(res, 400, "Shop is not available");
    }

    const phone = normalizePhone(qr.phone);
    // Keep access row in sync with QR snapshot
    await prisma.guestPhoneAccess.upsert({
      where: { shopId_phone: { shopId: qr.shopId, phone } },
      create: {
        shopId: qr.shopId,
        phone,
        b2bAllowed: qr.b2bAllowed,
      },
      update: { b2bAllowed: qr.b2bAllowed },
    });

    const ctx = await resolvePricingContext(qr.shopId, phone);
    if (!ctx) return fail(res, 404, "Shop not found");
    if (!ctx.portfolioOnly && !ctx.b2cEnabled && !ctx.b2bEnabled) {
      return fail(res, 403, "No sales channel open for this phone/shop");
    }

    if (ctx.portfolioOnly) {
      // Portfolio shops: still allow browse via QR, but flag no checkout
    }

    const session = issueGuestSession({
      phone,
      shopId: qr.shopId,
      b2bAllowed: ctx.b2bAllowed,
      b2cEnabled: ctx.b2cEnabled,
      b2bEnabled: ctx.b2bEnabled,
      listingMode: ctx.listingMode,
      portfolioOnly: ctx.portfolioOnly,
      canOrder: ctx.canOrder,
      name: parsed.data.name,
    });

    return ok(res, {
      ...session,
      shop: { id: qr.shop.id, name: qr.shop.name, slug: qr.shop.slug },
      pricing: {
        listingMode: ctx.listingMode,
        portfolioOnly: ctx.portfolioOnly,
        canOrder: ctx.canOrder,
        b2cEnabled: ctx.b2cEnabled,
        b2bEnabled: ctx.b2bEnabled,
        showBoth: ctx.showBoth,
      },
    });
  } catch (err) {
    console.error("guest qr redeem", err);
    return fail(res, 500, "Could not redeem QR", "db_error");
  }
});

/** GET /api/auth/guest/me — guest session + pricing flags */
router.get("/me", requireGuest, async (req, res) => {
  try {
    const ctx = await resolvePricingContext(req.guest.shopId, req.guest.phone);
    if (!ctx) return fail(res, 404, "Shop not found");
    return ok(res, {
      guest: {
        kind: "guest",
        phone: req.guest.phone,
        shopId: req.guest.shopId,
        name: req.guest.name ?? null,
      },
      pricing: {
        listingMode: ctx.listingMode,
        portfolioOnly: ctx.portfolioOnly,
        canOrder: ctx.canOrder,
        b2cEnabled: ctx.b2cEnabled,
        b2bEnabled: ctx.b2bEnabled,
        showBoth: ctx.showBoth,
      },
    });
  } catch (err) {
    console.error("guest me", err);
    return fail(res, 500, "Could not load guest session", "db_error");
  }
});

/**
 * GET /api/auth/guest/products
 * Products for this shop with only the prices this phone may see.
 */
router.get("/products", requireGuest, async (req, res) => {
  try {
    const ctx = await resolvePricingContext(req.guest.shopId, req.guest.phone);
    if (!ctx) return fail(res, 404, "Shop not found");
    if (!ctx.portfolioOnly && !ctx.b2cEnabled && !ctx.b2bEnabled) {
      return fail(res, 403, "No channel open");
    }

    const products = await prisma.product.findMany({
      where: {
        shopId: req.guest.shopId,
        active: true,
        OR: [
          { sellOnOwnPage: true },
          { sellOnMarketplace: true },
          { sellOnApp: true },
          { showOnWebsite: true },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return ok(res, {
      pricing: {
        listingMode: ctx.listingMode,
        portfolioOnly: ctx.portfolioOnly,
        canOrder: ctx.canOrder,
        b2cEnabled: ctx.b2cEnabled,
        b2bEnabled: ctx.b2bEnabled,
        showBoth: ctx.showBoth,
      },
      products: products.map((p) => ({
        ...pricesForContext(p, ctx),
        imageUrl: p.imageUrl || null,
        stock: p.stock,
      })),
    });
  } catch (err) {
    console.error("guest products", err);
    return fail(res, 500, "Could not load products", "db_error");
  }
});

export default router;
