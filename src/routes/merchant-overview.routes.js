import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail } from "../lib/merchant-auth.js";
import { publicShopChannels } from "../lib/shop-channels.js";
import { publicMerchantProduct } from "../lib/merchant-product.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * GET /api/merchant/overview
 * Dashboard: today sales, active orders, low stock, shop status.
 */
router.get("/overview", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const since = startOfToday();
    const lowThreshold = Math.max(0, Math.floor(Number(req.query.threshold) || 5));

    const [
      shop,
      todayOrders,
      activeCount,
      requestCount,
      pickupCount,
      lowStock,
      productCount,
      recentOrders,
      viewAgg,
      topViewed,
    ] = await Promise.all([
      prisma.shop.findUnique({
        where: { id: shopId },
        include: { features: true, delivery: true },
      }),
      prisma.order.findMany({
        where: {
          shopId,
          createdAt: { gte: since },
          stage: { not: "cancelled" },
        },
        select: {
          totalKs: true,
          source: true,
          stage: true,
          channel: true,
          clientSurface: true,
        },
      }),
      prisma.order.count({
        where: {
          shopId,
          stage: { in: ["request", "delivery", "pickup", "invoiced"] },
        },
      }),
      prisma.order.count({ where: { shopId, stage: "request" } }),
      prisma.order.count({
        where: { shopId, stage: "pickup", pickupReserved: true },
      }),
      prisma.product.findMany({
        where: { shopId, active: true, stock: { lte: lowThreshold } },
        orderBy: { stock: "asc" },
        take: 10,
      }),
      prisma.product.count({ where: { shopId, active: true } }),
      prisma.order.findMany({
        where: { shopId },
        include: { lines: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.product.aggregate({
        where: { shopId, active: true },
        _sum: {
          viewsWebsite: true,
          viewsApp: true,
          viewsQr: true,
        },
      }),
      prisma.product.findMany({
        where: { shopId, active: true },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          viewsWebsite: true,
          viewsApp: true,
          viewsQr: true,
        },
        take: 200,
      }),
    ]);

    if (!shop) return fail(res, 404, "Shop not found");

    const todaySalesKs = todayOrders.reduce((s, o) => s + (o.totalKs || 0), 0);
    const todayPosKs = todayOrders
      .filter((o) => o.source === "pos")
      .reduce((s, o) => s + (o.totalKs || 0), 0);

    const sumBy = (pred) =>
      todayOrders.filter(pred).reduce((s, o) => s + (o.totalKs || 0), 0);
    const countBy = (pred) => todayOrders.filter(pred).length;

    const surfaceOf = (o) => {
      if (o.clientSurface === "app" || o.clientSurface === "website" || o.clientSurface === "qr" || o.clientSurface === "instore") {
        return o.clientSurface;
      }
      if (o.source === "pos") return "instore";
      if (o.source === "qr_guest") return "qr";
      return "website";
    };

    const ch = publicShopChannels(shop.features);

    return ok(res, {
      shop: {
        id: shop.id,
        slug: shop.slug,
        name: shop.name,
        status: shop.status,
        listed: shop.listed,
        logoUrl: shop.logoUrl,
        coverUrl: shop.coverUrl,
        listingMode: ch.listingMode,
        portfolioOnly: ch.portfolioOnly,
        canOrder: ch.canOrder,
        features: shop.features,
        delivery: shop.delivery
          ? {
              deliveryEnabled: shop.delivery.deliveryEnabled,
              pickupEnabled: shop.delivery.pickupEnabled,
            }
          : null,
      },
      today: {
        orderCount: todayOrders.length,
        salesKs: todaySalesKs,
        posSalesKs: todayPosKs,
        retail: {
          orderCount: countBy((o) => o.channel === "b2c"),
          salesKs: sumBy((o) => o.channel === "b2c"),
        },
        wholesale: {
          orderCount: countBy((o) => o.channel === "b2b"),
          salesKs: sumBy((o) => o.channel === "b2b"),
        },
        bySurface: {
          app: {
            orderCount: countBy((o) => surfaceOf(o) === "app"),
            salesKs: sumBy((o) => surfaceOf(o) === "app"),
          },
          website: {
            orderCount: countBy((o) => surfaceOf(o) === "website"),
            salesKs: sumBy((o) => surfaceOf(o) === "website"),
          },
          qr: {
            orderCount: countBy((o) => surfaceOf(o) === "qr"),
            salesKs: sumBy((o) => surfaceOf(o) === "qr"),
          },
          instore: {
            orderCount: countBy((o) => surfaceOf(o) === "instore"),
            salesKs: sumBy((o) => surfaceOf(o) === "instore"),
          },
        },
      },
      queues: {
        activeOrders: activeCount,
        requests: requestCount,
        pickupReserved: pickupCount,
      },
      catalog: {
        activeProducts: productCount,
        lowStock: lowStock.map(publicMerchantProduct),
      },
      productViews: {
        website: Number(viewAgg._sum.viewsWebsite) || 0,
        app: Number(viewAgg._sum.viewsApp) || 0,
        qr: Number(viewAgg._sum.viewsQr) || 0,
        total:
          (Number(viewAgg._sum.viewsWebsite) || 0) +
          (Number(viewAgg._sum.viewsApp) || 0) +
          (Number(viewAgg._sum.viewsQr) || 0),
        top: topViewed
          .map((p) => ({
            id: p.id,
            name: p.name,
            imageUrl: p.imageUrl || "",
            viewsWebsite: p.viewsWebsite || 0,
            viewsApp: p.viewsApp || 0,
            viewsQr: p.viewsQr || 0,
            viewsTotal:
              (p.viewsWebsite || 0) + (p.viewsApp || 0) + (p.viewsQr || 0),
          }))
          .filter((p) => p.viewsTotal > 0)
          .sort((a, b) => b.viewsTotal - a.viewsTotal),
      },
      recentOrders,
    });
  } catch (err) {
    console.error("merchant overview", err);
    return fail(res, 500, "Could not load overview", "db_error");
  }
});

/**
 * GET /api/merchant/shop
 * Full shop profile + modules for Account / Store style.
 */
router.get("/shop", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        features: true,
        delivery: true,
        payments: true,
      },
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
  } catch (err) {
    console.error("merchant shop get", err);
    return fail(res, 500, "Could not load shop", "db_error");
  }
});

/**
 * PATCH /api/merchant/shop
 * Update profile fields (name, phone, tagline, logo, cover, location).
 */
router.patch("/shop", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (req.user.role === "staff") {
      return fail(res, 403, "Shop owner only");
    }

    const allowed = [
      "name",
      "nameMy",
      "phone",
      "email",
      "location",
      "township",
      "tagline",
      "logoUrl",
      "coverUrl",
      "listed",
    ];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      if (key === "listed") {
        if (typeof req.body.listed === "boolean") data.listed = req.body.listed;
        continue;
      }
      const v = req.body[key];
      data[key] = v == null || v === "" ? null : String(v).trim();
    }

    if (Object.keys(data).length === 0) {
      return fail(res, 400, "Nothing to update");
    }
    if (data.name === null || data.name === "") {
      return fail(res, 400, "Name cannot be empty");
    }

    const shop = await prisma.shop.update({
      where: { id: shopId },
      data,
      include: { features: true },
    });
    const ch = publicShopChannels(shop.features);
    return ok(res, {
      ...shop,
      listingMode: ch.listingMode,
      portfolioOnly: ch.portfolioOnly,
      canOrder: ch.canOrder,
    });
  } catch (err) {
    console.error("merchant shop patch", err);
    return fail(res, 500, "Could not update shop", "db_error");
  }
});

export default router;
