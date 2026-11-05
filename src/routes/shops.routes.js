import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import {
  featuresPayloadForMode,
  normalizeListingMode,
  publicShopChannels,
} from "../lib/shop-channels.js";
import {
  enrichZones,
  getShopHomeState,
  parseExpressStates,
  resolveDeliveryOptions,
} from "../lib/delivery-fee.js";
import { ensureExpressZonesColumn } from "../lib/ensure-schema.js";
import { townshipLabel } from "../lib/township.js";
import { sellChannelWhere } from "../lib/merchant-product.js";
import { parseStoreStyle } from "../lib/store-style.js";
import {
  normalizeMediaUrl,
  withNormalizedShopMedia,
} from "../lib/media-url.js";
import { listPlatformPayments } from "../lib/platform-payments.js";

const router = Router();

/** GET /api/shops — public directory (approved + listed) with listing mode */
router.get("/", async (req, res) => {
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "default" },
    });
    if (settings && settings.shopsDirectory === false) {
      return ok(res, []);
    }
    const modeFilter = normalizeListingMode(req.query.listingMode);
    const shops = await prisma.shop.findMany({
      where: {
        status: "approved",
        listed: true,
        ...(modeFilter
          ? { features: { listingMode: modeFilter } }
          : {}),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        nameMy: true,
        tagline: true,
        logoUrl: true,
        township: true,
        location: true,
        features: {
          select: {
            listingMode: true,
            b2cEnabled: true,
            b2bEnabled: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return ok(
      res,
      shops.map((s) => {
        const ch = publicShopChannels(s.features);
        return {
          id: s.id,
          slug: s.slug,
          name: s.name,
          nameMy: s.nameMy,
          tagline: s.tagline,
          logoUrl: normalizeMediaUrl(s.logoUrl, req),
          township: s.township,
          location: s.location,
          listingMode: ch.listingMode,
          portfolioOnly: ch.portfolioOnly,
          canOrder: ch.canOrder,
          channels: {
            b2cEnabled: ch.b2cEnabled,
            b2bEnabled: ch.b2bEnabled,
            showBoth: ch.b2cEnabled && ch.b2bEnabled,
          },
        };
      }),
    );
  } catch (err) {
    console.error("shops list", err);
    return fail(res, 500, "Could not load shops", "db_error");
  }
});

/**
 * GET /api/shops/:id/delivery
 * Public — Marketplace checkout hydrates pickup/delivery + township fees.
 */
router.get("/:id/delivery", async (req, res) => {
  try {
    await ensureExpressZonesColumn();
    const shop = await prisma.shop.findFirst({
      where: {
        OR: [{ id: req.params.id }, { slug: req.params.id }],
        status: "approved",
      },
      include: { delivery: true },
    });
    if (!shop) return fail(res, 404, "Shop not found");

    const delivery = shop.delivery;
    const zones = await enrichZones(delivery?.zonesJson ?? []);
    const expressStates = parseExpressStates(delivery?.expressZonesJson ?? []);
    const homeState = await getShopHomeState(shop.id);
    return ok(res, {
      shopId: shop.id,
      shopName: shop.name,
      deliveryEnabled: Boolean(delivery?.deliveryEnabled),
      pickupEnabled: delivery?.pickupEnabled !== false,
      expressEnabled: Boolean(delivery?.expressEnabled),
      expressFeeKs: Math.max(0, Math.floor(Number(delivery?.expressFeeKs) || 0)),
      homeState,
      zones: zones.filter((z) => z.active !== false),
      expressStates,
      expressZones: [],
    });
  } catch (err) {
    console.error("shop delivery get", err);
    return fail(res, 500, "Could not load delivery", "db_error");
  }
});

/**
 * GET /api/shops/:id/delivery-quote?townshipId=
 * Marketplace checkout — local delivery / Express / pickup options for one township.
 */
router.get("/:id/delivery-quote", async (req, res) => {
  try {
    await ensureExpressZonesColumn();
    const shop = await prisma.shop.findFirst({
      where: {
        OR: [{ id: req.params.id }, { slug: req.params.id }],
        status: "approved",
      },
    });
    if (!shop) return fail(res, 404, "Shop not found");

    const townshipId = String(req.query.townshipId || "").trim();
    if (!townshipId) return fail(res, 400, "townshipId required");

    const township = await prisma.township.findUnique({ where: { id: townshipId } });
    if (!township?.active) {
      return fail(res, 400, "Township is not published");
    }

    const opts = await resolveDeliveryOptions(shop.id, townshipId);
    const feeKs = opts.canDelivery
      ? opts.deliveryFeeKs
      : opts.canExpress
        ? opts.expressFeeKs
        : null;

    return ok(res, {
      shopId: shop.id,
      shopName: shop.name,
      townshipId,
      townshipName: townshipLabel(township),
      postalCode: township.postalCode,
      deliveryEnabled: opts.deliveryEnabled,
      pickupEnabled: opts.pickupEnabled,
      expressEnabled: opts.expressEnabled,
      homeState: opts.homeState,
      buyerState: opts.buyerState,
      sameState: opts.sameState,
      inZone: opts.inZone,
      canDelivery: opts.canDelivery,
      canExpress: opts.canExpress,
      canPickup: opts.canPickup,
      contactShop: opts.contactShop,
      deliveryFeeKs: opts.deliveryFeeKs,
      expressFeeKs: opts.expressFeeKs,
      deliversHere: opts.canDelivery,
      feeKs,
    });
  } catch (err) {
    console.error("delivery quote", err);
    return fail(res, 500, "Could not quote delivery", "db_error");
  }
});

/** GET /api/shops/:id/products — merchant shop website (Store style + published SKUs) */
router.get("/:id/products", async (req, res) => {
  try {
    const shop = await prisma.shop.findFirst({
      where: {
        OR: [{ id: req.params.id }, { slug: req.params.id }],
        status: "approved",
        listed: true,
      },
      include: { features: true },
    });
    if (!shop) return fail(res, 404, "Shop not found");

    if (!shop.websitePublished) {
      return fail(
        res,
        403,
        "This shop has not published their website yet",
        "website_not_published",
      );
    }

    /** Shop website / Shop QR — published inventory with a category. */
    const products = await prisma.product.findMany({
      where: {
        shopId: shop.id,
        ...sellChannelWhere("own"),
        AND: [
          { categoryId: { not: null } },
          { categoryId: { not: "" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    const ch = publicShopChannels(shop.features);
    const storeStyle = parseStoreStyle(shop.storeStyleJson);

    return ok(res, {
      shop: {
        id: shop.id,
        slug: shop.slug,
        name: shop.name,
        nameMy: shop.nameMy,
        tagline: shop.tagline,
        logoUrl: normalizeMediaUrl(shop.logoUrl, req),
        coverUrl: normalizeMediaUrl(shop.coverUrl, req),
        phone: shop.phone,
        phone2: shop.phone2 ?? "",
        email: shop.email,
        location: shop.location,
        township: shop.township,
        aboutText: shop.aboutText ?? "",
        websitePublished: true,
        storeStyle,
        listingMode: ch.listingMode,
        portfolioOnly: ch.portfolioOnly,
        canOrder: ch.canOrder,
        channels: {
          b2cEnabled: ch.b2cEnabled,
          b2bEnabled: ch.b2bEnabled,
          showBoth: ch.b2cEnabled && ch.b2bEnabled,
        },
      },
      products: products.map((p) => ({
        id: p.id,
        productId: p.id,
        name: p.name,
        priceB2cKs: p.priceKs,
        priceB2bKs: p.priceB2bKs ?? null,
        imageUrl: p.imageUrl || "",
        badge: p.badge || null,
        stock: p.stock,
        categoryId: p.categoryId || "",
        canOrder: ch.canOrder && !ch.portfolioOnly, // published SKUs only
      })),
    });
  } catch (err) {
    console.error("shop products", err);
    return fail(res, 500, "Could not load shop products", "db_error");
  }
});

/**
 * GET /api/shops/:id/payments
 * Public — Marketplace checkout: enabled methods + wallet QR URLs.
 */
router.get("/:id/payments", async (req, res) => {
  try {
    const shop = await prisma.shop.findFirst({
      where: {
        OR: [{ id: req.params.id }, { slug: req.params.id }],
      },
      select: { id: true },
    });
    if (!shop) return fail(res, 404, "Shop not found");

    const catalog = await listPlatformPayments({ activeOnly: true });
    const rows = await prisma.shopPaymentMethod.findMany({
      where: { shopId: shop.id },
    });
    const byMethod = new Map(rows.map((r) => [r.method, r]));
    const methods = [];

    for (const meta of catalog) {
      const row = byMethod.get(meta.id);
      const enabled = Boolean(row?.enabled);
      const qrUrl = row?.qrUrl ? normalizeMediaUrl(row.qrUrl, req) : null;
      const needsQr = meta.needsQr !== false;
      if (!enabled) continue;
      if (needsQr && !qrUrl) continue;
      methods.push({
        id: meta.id,
        enabled: true,
        qrUrl,
        label: meta.label,
        shortLabel: meta.shortLabel,
        needsQr,
      });
    }

    if (methods.length === 0) {
      methods.push({
        id: "cod",
        enabled: true,
        qrUrl: null,
        label: "Cash on delivery",
        shortLabel: "COD",
        needsQr: false,
      });
    }

    return ok(res, { shopId: shop.id, methods });
  } catch (err) {
    console.error("shop payments get", err);
    return fail(res, 500, "Could not load payments", "db_error");
  }
});

/** GET /api/shops/:id */
router.get("/:id", async (req, res) => {
  const shop = await prisma.shop.findFirst({
    where: {
      OR: [{ id: req.params.id }, { slug: req.params.id }],
    },
    include: { features: true, delivery: true, payments: true },
  });
  if (!shop) return fail(res, 404, "Shop not found");
  const ch = publicShopChannels(shop.features);
  return ok(res, {
    ...withNormalizedShopMedia(shop, req),
    storeStyle: parseStoreStyle(shop.storeStyleJson),
    websitePublished: Boolean(shop.websitePublished),
    aboutText: shop.aboutText ?? "",
    listingMode: ch.listingMode,
    portfolioOnly: ch.portfolioOnly,
    canOrder: ch.canOrder,
    channels: {
      b2cEnabled: ch.b2cEnabled,
      b2bEnabled: ch.b2bEnabled,
      showBoth: ch.b2cEnabled && ch.b2bEnabled,
    },
  });
});

/** Module flags — Admin only. Merchants may still set listingMode / channels elsewhere. */
const ADMIN_MODULE_KEYS = [
  "barcodeTrackingEnabled",
  "couponCodesEnabled",
  "bogoEnabled",
  "staffEnabled",
  "posEnabled",
  /** deliveryModuleEnabled retired — delivery pricing always available */
  "memberPointsEnabled",
];

/** PATCH /api/shops/:id/features — Admin toggles modules; merchant listingMode only */
router.patch(
  "/:id/features",
  requireAuth,
  requireRole("merchant", "admin"),
  async (req, res) => {
    const shopId = req.params.id;
    if (req.user.role === "merchant" && req.user.shopId !== shopId) {
      return fail(res, 403, "Not your shop");
    }

    const data = {};
    const touchingModules = ADMIN_MODULE_KEYS.some(
      (key) => typeof req.body?.[key] === "boolean",
    );
    if (touchingModules && req.user.role !== "admin") {
      return fail(res, 403, "Only platform admin can change shop modules");
    }
    if (req.user.role === "admin") {
      for (const key of ADMIN_MODULE_KEYS) {
        if (typeof req.body[key] === "boolean") data[key] = req.body[key];
      }
    }

    const mode = normalizeListingMode(req.body.listingMode);
    if (mode) Object.assign(data, featuresPayloadForMode(mode));

    if (Object.keys(data).length === 0) {
      return fail(res, 400, "No feature fields to update");
    }

    const features = await prisma.shopFeatures.upsert({
      where: { shopId },
      create: { shopId, ...data },
      update: data,
    });
    if (features.listingMode === "portfolio") {
      await prisma.product.updateMany({
        where: { shopId },
        data: { sellOnMarketplace: false, sellOnApp: false },
      });
    }
    return ok(res, {
      ...features,
      ...publicShopChannels(features),
    });
  },
);

/** PATCH /api/shops/:id/status — Admin approve / reject / suspend */
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const status = req.body.status;
    if (!["pending", "approved", "rejected", "suspended"].includes(status)) {
      return fail(res, 400, "Invalid status");
    }
    const shop = await prisma.shop.update({
      where: { id: req.params.id },
      data: {
        status,
        reviewNote: req.body.feedback ?? req.body.reviewNote ?? undefined,
      },
    });
    return ok(res, shop);
  },
);

export default router;
