import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import {
  featuresPayloadForMode,
  normalizeListingMode,
  publicShopChannels,
} from "../lib/shop-channels.js";
import { getDeliveryFeeForTownship } from "../lib/delivery-fee.js";
import { townshipLabel } from "../lib/township.js";

const router = Router();

/** GET /api/shops — public directory (approved + listed) with listing mode */
router.get("/", async (req, res) => {
  try {
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
          logoUrl: s.logoUrl,
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
 * GET /api/shops/:id/delivery-quote?townshipId=
 * Marketplace checkout — fee for one township (null = not served).
 */
router.get("/:id/delivery-quote", async (req, res) => {
  try {
    const shop = await prisma.shop.findFirst({
      where: {
        OR: [{ id: req.params.id }, { slug: req.params.id }],
        status: "approved",
      },
      include: { delivery: true },
    });
    if (!shop) return fail(res, 404, "Shop not found");

    const townshipId = String(req.query.townshipId || "").trim();
    if (!townshipId) return fail(res, 400, "townshipId required");

    const township = await prisma.township.findUnique({ where: { id: townshipId } });
    if (!township?.active) {
      return fail(res, 400, "Township is not published");
    }

    const delivery = shop.delivery;
    const pickupEnabled = delivery?.pickupEnabled !== false;
    const deliveryEnabled = Boolean(delivery?.deliveryEnabled);
    const feeKs = deliveryEnabled
      ? await getDeliveryFeeForTownship(shop.id, townshipId)
      : null;

    return ok(res, {
      shopId: shop.id,
      shopName: shop.name,
      townshipId,
      townshipName: townshipLabel(township),
      postalCode: township.postalCode,
      deliveryEnabled,
      pickupEnabled,
      deliversHere: feeKs != null,
      feeKs,
    });
  } catch (err) {
    console.error("delivery quote", err);
    return fail(res, 500, "Could not quote delivery", "db_error");
  }
});

/** GET /api/shops/:id/products — public own-page catalog (sellOnOwnPage) */
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

    /**
     * Shop storefront shows every SKU the merchant sells publicly
     * (own page · marketplace · app). Merchant-only (all channels off) stays hidden.
     */
    const products = await prisma.product.findMany({
      where: {
        shopId: shop.id,
        active: true,
        OR: [
          { sellOnOwnPage: true },
          { sellOnMarketplace: true },
          { sellOnApp: true },
          // Legacy rows before channel flags
          { showOnWebsite: true },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    const ch = publicShopChannels(shop.features);

    return ok(res, {
      shop: {
        id: shop.id,
        slug: shop.slug,
        name: shop.name,
        nameMy: shop.nameMy,
        tagline: shop.tagline,
        logoUrl: shop.logoUrl,
        coverUrl: shop.coverUrl,
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
        canOrder: ch.canOrder && !ch.portfolioOnly,
      })),
    });
  } catch (err) {
    console.error("shop products", err);
    return fail(res, 500, "Could not load shop products", "db_error");
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
    ...shop,
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

/** PATCH /api/shops/:id/features — Merchant Modules + listingMode */
router.patch(
  "/:id/features",
  requireAuth,
  requireRole("merchant", "admin"),
  async (req, res) => {
    const shopId = req.params.id;
    if (req.user.role === "merchant" && req.user.shopId !== shopId) {
      return fail(res, 403, "Not your shop");
    }

    const allowed = [
      "purchasesEnabled",
      "barcodeTrackingEnabled",
      "ratingsReviewsEnabled",
      "couponCodesEnabled",
      "bogoEnabled",
      "staffEnabled",
      "posEnabled",
      "deliveryModuleEnabled",
      "memberPointsEnabled",
    ];
    const data = {};
    for (const key of allowed) {
      if (typeof req.body[key] === "boolean") data[key] = req.body[key];
    }

    const mode = normalizeListingMode(req.body.listingMode);
    if (mode) Object.assign(data, featuresPayloadForMode(mode));

    const features = await prisma.shopFeatures.upsert({
      where: { shopId },
      create: { shopId, ...data },
      update: data,
    });
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
