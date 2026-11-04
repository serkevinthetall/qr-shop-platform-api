import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail } from "../lib/merchant-auth.js";
import { publicShopChannels } from "../lib/shop-channels.js";
import { parseStoreStyle, storeStyleToJson } from "../lib/store-style.js";
import { publicMerchantProduct } from "../lib/merchant-product.js";
import {
  normalizeMediaUrl,
  withNormalizedShopMedia,
} from "../lib/media-url.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function dayKey(d) {
  const x = startOfLocalDay(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Mon-start week label Mon…Sun */
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function emptyBucket() {
  return { salesKs: 0, costKs: 0, profitKs: 0, orderCount: 0 };
}

function accumulateOrder(bucket, order) {
  const sales = Math.max(0, Math.floor(Number(order.totalKs) || 0));
  let cost = 0;
  for (const line of order.lines || []) {
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    const unitCost = Math.max(0, Math.floor(Number(line.product?.costKs) || 0));
    cost += qty * unitCost;
  }
  bucket.salesKs += sales;
  bucket.costKs += cost;
  bucket.profitKs += sales - cost;
  bucket.orderCount += 1;
}

/**
 * GET /api/merchant/overview
 * Dashboard: today sales, week/month P&L series, active orders, low stock.
 */
router.get("/overview", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const since = startOfToday();
    const monthStart = addDays(since, -29);

    const [
      shop,
      todayOrders,
      periodOrders,
      activeCount,
      requestCount,
      pickupCount,
      lowStockCandidates,
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
      prisma.order.findMany({
        where: {
          shopId,
          createdAt: { gte: monthStart },
          stage: { not: "cancelled" },
        },
        select: {
          totalKs: true,
          createdAt: true,
          lines: {
            select: {
              qty: true,
              product: { select: { costKs: true } },
            },
          },
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
        where: { shopId, active: true, lowStockAlertEnabled: true },
        orderBy: { stock: "asc" },
        take: 100,
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

    const lowStock = lowStockCandidates
      .filter(
        (p) =>
          p.stock <= Math.max(0, Math.floor(Number(p.lowStockThreshold) || 5)),
      )
      .slice(0, 10);

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

    /** Last 30 local days → dayKey map */
    const byDay = new Map();
    for (let i = 0; i < 30; i += 1) {
      const d = addDays(since, -(29 - i));
      byDay.set(dayKey(d), emptyBucket());
    }
    for (const order of periodOrders) {
      const key = dayKey(order.createdAt);
      const bucket = byDay.get(key);
      if (!bucket) continue;
      accumulateOrder(bucket, order);
    }

    const monthSeries = [];
    for (let i = 0; i < 30; i += 1) {
      const d = addDays(since, -(29 - i));
      const key = dayKey(d);
      const b = byDay.get(key) || emptyBucket();
      monthSeries.push({
        key,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        ...b,
      });
    }

    /** Rolling last 7 days (ending today) for week chart */
    const weekSeries = monthSeries.slice(-7).map((row, i) => {
      const d = addDays(since, -(6 - i));
      return {
        ...row,
        label: WEEKDAY_SHORT[d.getDay()],
      };
    });

    const sumSeries = (rows) =>
      rows.reduce(
        (acc, r) => {
          acc.salesKs += r.salesKs;
          acc.costKs += r.costKs;
          acc.profitKs += r.profitKs;
          acc.orderCount += r.orderCount;
          return acc;
        },
        emptyBucket(),
      );

    const weekTotals = sumSeries(weekSeries);
    const monthTotals = sumSeries(monthSeries);

    const ch = publicShopChannels(shop.features);

    return ok(res, {
      shop: {
        id: shop.id,
        slug: shop.slug,
        name: shop.name,
        status: shop.status,
        listed: shop.listed,
        logoUrl: normalizeMediaUrl(shop.logoUrl, req),
        coverUrl: normalizeMediaUrl(shop.coverUrl, req),
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
      /** Sales · COGS (unit cost × qty) · gross profit */
      finance: {
        week: { ...weekTotals, series: weekSeries },
        month: { ...monthTotals, series: monthSeries },
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
    const storeStyle = parseStoreStyle(shop.storeStyleJson);
    return ok(res, {
      ...withNormalizedShopMedia(shop, req),
      storeStyle,
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
  } catch (err) {
    console.error("merchant shop get", err);
    return fail(res, 500, "Could not load shop", "db_error");
  }
});

/**
 * PATCH /api/merchant/barcode-tracking
 * Shop owner turns barcode tools On/Off (manual entry only — no auto codes).
 */
router.patch("/barcode-tracking", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (req.user.role === "staff") {
      return fail(res, 403, "Shop owner only");
    }
    if (typeof req.body?.barcodeTrackingEnabled !== "boolean") {
      return fail(res, 400, "barcodeTrackingEnabled boolean required");
    }
    const enabled = req.body.barcodeTrackingEnabled;
    const features = await prisma.shopFeatures.upsert({
      where: { shopId },
      create: { shopId, barcodeTrackingEnabled: enabled },
      update: { barcodeTrackingEnabled: enabled },
    });
    return ok(res, {
      barcodeTrackingEnabled: Boolean(features.barcodeTrackingEnabled),
    });
  } catch (err) {
    console.error("merchant barcode-tracking patch", err);
    return fail(res, 500, "Could not update barcode setting", "db_error");
  }
});

/**
 * PATCH /api/merchant/shop
 * Update profile fields (name, phone, tagline, logo, cover, location,
 * websitePublished, storeStyle, aboutText).
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
      "phone2",
      "email",
      "location",
      "township",
      "tagline",
      "logoUrl",
      "coverUrl",
      "listed",
      "aboutText",
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

    if (typeof req.body.websitePublished === "boolean") {
      data.websitePublished = req.body.websitePublished;
    }

    if (req.body.storeStyle != null) {
      data.storeStyleJson = storeStyleToJson(req.body.storeStyle);
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
      ...withNormalizedShopMedia(shop, req),
      storeStyle: parseStoreStyle(shop.storeStyleJson),
      websitePublished: Boolean(shop.websitePublished),
      aboutText: shop.aboutText ?? "",
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
