import { Router } from "express";
import crypto from "node:crypto";
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
import { sellChannelWhere } from "../lib/merchant-product.js";

const router = Router();

const redeemSchema = z.object({
  token: z.string().min(8),
  /** Must match the phone the merchant put on this personal link */
  phone: z.string().min(6).max(32),
  name: z.string().min(1).optional(),
});

const tokenOnlySchema = z.object({
  token: z.string().min(8),
});

const openRegisterSchema = z.object({
  shopId: z.string().min(1),
  name: z.string().min(1).max(120),
  phone: z.string().min(6).max(32),
  address: z.string().min(3).max(500),
  /** Ignored — phone whitelist decides retail vs wholesale (guests cannot self-upgrade). */
  channel: z.enum(["b2c", "b2b"]).optional(),
});

/** Checkout without account — remember on External users (GuestQr), never as Customer. */
const easyCheckoutSchema = z.object({
  shopId: z.string().min(1),
  name: z.string().min(1).max(120),
  phone: z.string().min(6).max(32),
  address: z.string().min(3).max(500),
  /** Optional personal / remembered link token from Shop QR session */
  token: z.string().min(8).optional(),
});

/**
 * POST /api/auth/guest/open
 * Shop QR landing — buyer enters name, phone, address.
 * Retail vs wholesale is decided by GuestPhoneAccess.b2bAllowed (or shop wholesale-only).
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

    /**
     * Phone decides retail vs wholesale — merchant whitelist (GuestPhoneAccess).
     * Guests cannot self-upgrade to B2B. New phones default to retail.
     * Shop wholesale-only still forces B2B for every phone.
     */
    const existing = await prisma.guestPhoneAccess.findUnique({
      where: { shopId_phone: { shopId: shop.id, phone } },
    });
    let b2bAllowed = Boolean(existing?.b2bAllowed);
    if (ctx.shopOffersB2b && !ctx.shopOffersB2c) {
      b2bAllowed = true;
    }
    await prisma.guestPhoneAccess.upsert({
      where: { shopId_phone: { shopId: shop.id, phone } },
      create: { shopId: shop.id, phone, b2bAllowed },
      update: { b2bAllowed },
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
        showBoth: false,
        activeChannel: priced.activeChannel,
        b2bAllowed: priced.b2bAllowed,
      },
    });
  } catch (err) {
    console.error("guest open register", err);
    return fail(res, 500, "Could not start guest session", "db_error");
  }
});

/**
 * POST /api/auth/guest/easy-checkout
 * QR visitor checkout without registering.
 * Saves name / phone / address on External users (GuestQr) for that shop.
 * Does not create a buyer User / Customer account.
 */
router.post("/easy-checkout", async (req, res) => {
  try {
    const parsed = easyCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 400, "Name, phone, address, and shop are required");
    }

    const shop = await prisma.shop.findFirst({
      where: {
        OR: [{ id: parsed.data.shopId }, { slug: parsed.data.shopId }],
        status: "approved",
      },
      include: { features: true },
    });
    if (!shop) return fail(res, 404, "Shop not found or not available");

    const phone = normalizePhone(parsed.data.phone);
    const name = parsed.data.name.trim();
    const address = parsed.data.address.trim();
    const now = new Date();

    let qr = null;
    if (parsed.data.token) {
      qr = await prisma.guestQr.findUnique({
        where: { token: parsed.data.token },
      });
      /** Stale / wrong-shop personal link → fall through to phone easy-checkout (mall /s). */
      const tokenUsable =
        qr &&
        !qr.revokedAt &&
        qr.shopId === shop.id &&
        !(qr.expiresAt && qr.expiresAt.getTime() < Date.now());
      if (!tokenUsable) {
        qr = null;
      } else {
        const expected = normalizePhone(qr.phone);
        if (expected && expected !== phone) {
          return fail(
            res,
            403,
            "Phone number does not match this link",
            "phone_mismatch",
          );
        }
        qr = await prisma.guestQr.update({
          where: { id: qr.id },
          data: {
            phone,
            name,
            address,
            activatedAt: qr.activatedAt ?? now,
          },
        });
      }
    }
    if (!qr) {
      qr = await prisma.guestQr.findFirst({
        where: { shopId: shop.id, phone, revokedAt: null },
        orderBy: { updatedAt: "desc" },
      });
      if (qr) {
        qr = await prisma.guestQr.update({
          where: { id: qr.id },
          data: {
            name,
            address,
            activatedAt: qr.activatedAt ?? now,
            fromEasyCheckout: true,
          },
        });
      } else {
        const token = crypto.randomBytes(24).toString("base64url");
        qr = await prisma.guestQr.create({
          data: {
            token,
            shopId: shop.id,
            phone,
            name,
            address,
            b2bAllowed: false,
            fromEasyCheckout: true,
            activatedAt: now,
            label: "Easy checkout",
          },
        });
      }
    }

    await prisma.guestPhoneAccess.upsert({
      where: { shopId_phone: { shopId: shop.id, phone } },
      create: {
        shopId: shop.id,
        phone,
        b2bAllowed: Boolean(qr.b2bAllowed),
        note: "Easy checkout",
      },
      update: {},
    });

    const priced = await resolvePricingContext(shop.id, phone);
    if (!priced) return fail(res, 404, "Shop not found");
    if (priced.portfolioOnly) {
      return fail(res, 403, "This shop is browse-only (no ordering)");
    }
    if (!priced.shopOffersB2c && !priced.shopOffersB2b) {
      return fail(res, 403, "No sales channel open for this shop");
    }

    const wholesale = Boolean(qr.b2bAllowed);
    const session = issueGuestSession({
      phone,
      shopId: shop.id,
      b2bAllowed: wholesale,
      b2cEnabled: wholesale ? true : priced.b2cEnabled,
      b2bEnabled: wholesale,
      listingMode: wholesale ? "b2b" : priced.listingMode,
      portfolioOnly: priced.portfolioOnly,
      canOrder: priced.canOrder,
      name,
    });

    return ok(res, {
      ...session,
      shop: { id: shop.id, name: shop.name, slug: shop.slug },
      address,
      linkToken: qr.token,
      externalUser: {
        id: qr.id,
        phone,
        name,
        address,
        fromEasyCheckout: true,
      },
      pricing: {
        listingMode: wholesale ? "b2b" : priced.listingMode,
        portfolioOnly: priced.portfolioOnly,
        canOrder: priced.canOrder,
        b2cEnabled: wholesale ? true : priced.b2cEnabled,
        b2bEnabled: wholesale,
        showBoth: false,
        activeChannel: wholesale ? "b2b" : "b2c",
        b2bAllowed: wholesale,
      },
    });
  } catch (err) {
    console.error("guest easy-checkout", err);
    return fail(res, 500, "Could not start Easy checkout", "db_error");
  }
});

/**
 * GET /api/auth/guest/qr-meta?token=
 * Public peek — shop name + channel label (no session). Phone still required to redeem.
 */
router.get("/qr-meta", async (req, res) => {
  try {
    const parsed = tokenOnlySchema.safeParse({ token: req.query.token });
    if (!parsed.success) return fail(res, 400, "token required");
    const qr = await prisma.guestQr.findUnique({
      where: { token: parsed.data.token },
      include: { shop: true },
    });
    if (!qr || qr.revokedAt) {
      return fail(res, 404, "Link is invalid or revoked", "qr_invalid");
    }
    if (qr.expiresAt && qr.expiresAt.getTime() < Date.now()) {
      return fail(res, 410, "Link has expired", "qr_expired");
    }
    if (qr.shop.status !== "approved") {
      return fail(res, 400, "Shop is not available");
    }
    return ok(res, {
      shop: { id: qr.shop.id, name: qr.shop.name, slug: qr.shop.slug },
      channel: qr.b2bAllowed ? "b2b" : "b2c",
      channelLabel: qr.b2bAllowed ? "Wholesale" : "Retail",
      needsPhone: true,
    });
  } catch (err) {
    console.error("guest qr-meta", err);
    return fail(res, 500, "Could not load link", "db_error");
  }
});

/**
 * POST /api/auth/guest/qr
 * Redeem personal link: phone must match merchant-saved phone → guest JWT.
 * Channel comes from the link (Retail/Wholesale), not a buyer picker.
 */
router.post("/qr", async (req, res) => {
  try {
    const parsed = redeemSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 400, "Link token and phone number are required");
    }

    const qr = await prisma.guestQr.findUnique({
      where: { token: parsed.data.token },
      include: { shop: { include: { features: true } } },
    });
    if (!qr || qr.revokedAt) {
      return fail(res, 404, "Link is invalid or revoked", "qr_invalid");
    }
    if (qr.expiresAt && qr.expiresAt.getTime() < Date.now()) {
      return fail(res, 410, "Link has expired", "qr_expired");
    }
    if (qr.shop.status !== "approved") {
      return fail(res, 400, "Shop is not available");
    }

    const phone = normalizePhone(parsed.data.phone);
    const expected = normalizePhone(qr.phone);
    if (phone !== expected) {
      return fail(res, 403, "Phone number does not match this link", "phone_mismatch");
    }

    // Sync access so pricing/orders see the link channel
    await prisma.guestPhoneAccess.upsert({
      where: { shopId_phone: { shopId: qr.shopId, phone } },
      create: {
        shopId: qr.shopId,
        phone,
        b2bAllowed: qr.b2bAllowed,
      },
      update: { b2bAllowed: qr.b2bAllowed },
    });

    if (!qr.activatedAt) {
      await prisma.guestQr.update({
        where: { id: qr.id },
        data: { activatedAt: new Date() },
      });
    }

    const ctx = await resolvePricingContext(qr.shopId, phone);
    if (!ctx) return fail(res, 404, "Shop not found");

    // Link channel wins: Retail link → retail only; Wholesale → wholesale (+ retail fallback prices)
    const wholesale = Boolean(qr.b2bAllowed);
    const activeChannel = wholesale ? "b2b" : "b2c";
    const b2cEnabled = !wholesale || Boolean(ctx.shopOffersB2c);
    const b2bEnabled = wholesale;

    if (ctx.portfolioOnly) {
      // browse-only
    } else if (!b2cEnabled && !b2bEnabled) {
      return fail(res, 403, "No sales channel open for this link");
    }

    const session = issueGuestSession({
      phone,
      shopId: qr.shopId,
      b2bAllowed: wholesale,
      b2cEnabled: wholesale ? true : b2cEnabled,
      b2bEnabled,
      listingMode: wholesale ? "b2b" : "b2c",
      portfolioOnly: ctx.portfolioOnly,
      canOrder: ctx.canOrder,
      name: parsed.data.name,
    });

    return ok(res, {
      ...session,
      shop: { id: qr.shop.id, name: qr.shop.name, slug: qr.shop.slug },
      pricing: {
        listingMode: wholesale ? "b2b" : "b2c",
        portfolioOnly: ctx.portfolioOnly,
        canOrder: ctx.canOrder,
        b2cEnabled: wholesale ? true : b2cEnabled,
        b2bEnabled,
        showBoth: false,
        activeChannel,
        b2bAllowed: wholesale,
      },
    });
  } catch (err) {
    console.error("guest qr redeem", err);
    return fail(res, 500, "Could not redeem link", "db_error");
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
        showBoth: false,
        activeChannel: ctx.activeChannel,
        b2bAllowed: ctx.b2bAllowed,
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

    /** Personal / guest storefront uses own-page SKUs only. */
    const products = await prisma.product.findMany({
      where: {
        shopId: req.guest.shopId,
        ...sellChannelWhere("own"),
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
        showBoth: false,
        activeChannel: ctx.activeChannel,
        b2bAllowed: ctx.b2bAllowed,
      },
      products: products.map((p) => {
        const priced = pricesForContext(p, ctx);
        // Always surface both list prices when set so Marketplace cards can show wholesale.
        if (p.priceKs != null && priced.priceB2cKs == null) {
          priced.priceB2cKs = p.priceKs;
        }
        if (p.priceB2bKs != null && priced.priceB2bKs == null) {
          priced.priceB2bKs = p.priceB2bKs;
        }
        let attributes = {};
        if (typeof p.attributesJson === "string") {
          try {
            const o = JSON.parse(p.attributesJson || "{}");
            if (o && typeof o === "object" && !Array.isArray(o)) attributes = o;
          } catch {
            /* ignore */
          }
        }
        return {
          ...priced,
          wholesaleMinQty:
            p.priceB2bKs != null &&
            p.wholesaleMinQty != null &&
            Number(p.wholesaleMinQty) > 0
              ? Math.floor(Number(p.wholesaleMinQty))
              : null,
          imageUrl: p.imageUrl || null,
          stock: Math.max(0, Math.floor(Number(p.stock) || 0)),
          templateId: p.templateId ? String(p.templateId) : undefined,
          attributes,
          canOrder:
            priced.canOrder !== false &&
            Math.max(0, Math.floor(Number(p.stock) || 0)) > 0,
        };
      }),
    });
  } catch (err) {
    console.error("guest products", err);
    return fail(res, 500, "Could not load products", "db_error");
  }
});

export default router;
