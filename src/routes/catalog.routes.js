import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { toMallProduct, parseMallProductId } from "../lib/mall-product.js";
import { defaultCategories, defaultHero } from "../lib/mall-meta.js";
import { ensureCategoriesSeeded } from "../lib/categories.js";
import { listActiveProductBadges } from "../lib/product-badges.js";
import {
  findBuyerProduct,
  findBuyerProducts,
  sellChannelWhere,
} from "../lib/merchant-product.js";

const router = Router();

/** marketplace (web) | app — from query or X-QR-Client header */
function catalogClientChannel(req) {
  const q = String(req.query.channel || "").toLowerCase();
  if (q === "app" || q === "mobile") return "app";
  if (q === "marketplace" || q === "web" || q === "website") return "marketplace";
  const h = String(req.headers["x-qr-client"] || "").toLowerCase();
  if (h === "app" || h === "mobile") return "app";
  if (h === "web" || h === "website" || h === "marketplace") return "marketplace";
  return "marketplace";
}

/**
 * GET /api/catalog/categories — Marketplace category chips
 * Prefers DB Category rows; falls back to data/mall-meta.json
 */
router.get("/categories", async (_req, res) => {
  try {
    await ensureCategoriesSeeded();
    const rows = await prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    if (rows.length) {
      return ok(
        res,
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          nameMy: c.nameMy ?? undefined,
          icon: c.icon ?? undefined,
          imageUrl: c.imageUrl ?? "",
        })),
      );
    }
    return ok(res, defaultCategories());
  } catch (err) {
    console.error("catalog categories", err);
    return ok(res, defaultCategories());
  }
});

/**
 * GET /api/catalog/badges — active product badge labels (Admin-controlled)
 */
router.get("/badges", async (_req, res) => {
  try {
    const rows = await listActiveProductBadges();
    return ok(
      res,
      rows.map((b) => ({
        id: b.id,
        name: b.name,
        nameMy: b.nameMy ?? undefined,
      })),
    );
  } catch (err) {
    console.error("catalog badges", err);
    return ok(res, []);
  }
});

/** GET /api/catalog/hero — Marketplace home hero (DB, else mall-meta.json) */
router.get("/hero", async (_req, res) => {
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "default" },
    });
    if (settings && settings.homePage === false) {
      return ok(res, null);
    }
    const row = await prisma.mallHero.findUnique({ where: { id: "default" } });
    if (row) {
      return ok(res, {
        imageUrl: row.imageUrl || "",
        eyebrow: row.eyebrow || "",
        title: row.title || "",
        subtitle: row.subtitle || "",
        cta: row.cta || "Browse",
        href: row.href || "/products",
      });
    }
    return ok(res, { ...defaultHero(), href: "/products" });
  } catch (err) {
    console.error("catalog hero", err);
    return ok(res, { ...defaultHero(), href: "/products" });
  }
});

/**
 * GET /api/catalog — Marketplace mall grid
 * Query: categoryId, shopId, q, deal, page, limit
 */
router.get("/", async (req, res) => {
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "default" },
    });
    if (settings && settings.marketplace === false) {
      return ok(res, { products: [], total: 0, page: 1, limit: 0 });
    }

    const categoryId = req.query.categoryId
      ? String(req.query.categoryId)
      : null;
    const shopId = req.query.shopId ? String(req.query.shopId) : null;
    const q = String(req.query.q || "").trim();
    const deal = ["1", "true", "yes"].includes(
      String(req.query.deal || "").toLowerCase(),
    );
    const page = Math.max(1, Number(req.query.page) || 1);
    /** Allow larger pages for Marketplace hydrate (was capped at 100). */
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 48));
    const skip = (page - 1) * limit;

    const clientChannel = catalogClientChannel(req);
    const channelFilter = sellChannelWhere(clientChannel);
    const where = {
      AND: [
        { ...channelFilter },
        /** No category → hidden from mall (merchant must assign one). */
        categoryId
          ? { categoryId }
          : {
              AND: [
                { categoryId: { not: null } },
                { categoryId: { not: "" } },
              ],
            },
        {
          shop: {
            status: "approved",
            listed: true,
            /** Catalog only (portfolio) → Shop QR website only, not mall/app. */
            OR: [
              { features: null },
              { features: { listingMode: { not: "portfolio" } } },
            ],
          },
        },
        ...(shopId ? [{ shopId }] : []),
        ...(deal ? [{ badge: { not: null } }] : []),
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { badge: { contains: q, mode: "insensitive" } },
                ],
              },
            ]
          : []),
      ],
    };

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      findBuyerProducts({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const mapped = [];
    for (const p of products) {
      try {
        mapped.push(toMallProduct(p));
      } catch (mapErr) {
        console.error("catalog map product", p?.id, mapErr);
      }
    }

    return ok(res, mapped, {
      page,
      limit,
      total,
      hasMore: skip + products.length < total,
    });
  } catch (err) {
    console.error("catalog list", err);
    return fail(
      res,
      500,
      `Could not load catalog: ${String(err?.message || err).slice(0, 180)}`,
      "db_error",
    );
  }
});

/**
 * POST /api/catalog/:id/view
 * Body: { channel: "website" | "app" | "qr" }
 * Records a product page open for merchant analytics.
 */
router.post("/:id/view", async (req, res) => {
  try {
    if (["categories", "hero", "publish"].includes(req.params.id)) {
      return fail(res, 404, "Not found");
    }
    const { productId } = parseMallProductId(req.params.id);
    if (!productId) return fail(res, 400, "product id required");

    const raw = String(req.body?.channel || "website").toLowerCase();
    const channel = ["website", "app", "qr"].includes(raw) ? raw : "website";

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        active: true,
        shop: { status: "approved" },
      },
      select: { id: true, shopId: true },
    });
    if (!product) return fail(res, 404, "Product not found");

    const counterKey =
      channel === "app"
        ? "viewsApp"
        : channel === "qr"
          ? "viewsQr"
          : "viewsWebsite";

    const [updated] = await prisma.$transaction([
      prisma.product.update({
        where: { id: product.id },
        data: { [counterKey]: { increment: 1 } },
        select: {
          id: true,
          viewsWebsite: true,
          viewsApp: true,
          viewsQr: true,
        },
      }),
      prisma.productView.create({
        data: {
          productId: product.id,
          shopId: product.shopId,
          channel,
        },
      }),
    ]);

    return ok(res, {
      productId: updated.id,
      channel,
      viewsWebsite: updated.viewsWebsite,
      viewsApp: updated.viewsApp,
      viewsQr: updated.viewsQr,
    });
  } catch (err) {
    console.error("catalog view", err);
    return fail(res, 500, "Could not record view", "db_error");
  }
});

/**
 * GET /api/catalog/:id — PDP
 * Accepts composite `shopId__productId` or product id
 */
router.get("/:id", async (req, res) => {
  try {
    if (["categories", "hero", "publish", "view"].includes(req.params.id)) {
      return fail(res, 404, "Not found");
    }
    const { productId } = parseMallProductId(req.params.id);
    if (!productId) return fail(res, 400, "product id required");

    const clientChannel = catalogClientChannel(req);
    const channelKey =
      clientChannel === "app" ? "sellOnApp" : "sellOnMarketplace";
    const product = await findBuyerProduct({
      where: {
        id: productId,
        active: true,
        [channelKey]: true,
        AND: [
          { categoryId: { not: null } },
          { categoryId: { not: "" } },
        ],
        shop: {
          status: "approved",
          listed: true,
          OR: [
            { features: null },
            { features: { listingMode: { not: "portfolio" } } },
          ],
        },
      },
    });
    if (!product) return fail(res, 404, "Product not found");
    return ok(res, toMallProduct(product));
  } catch (err) {
    console.error("catalog get", err);
    return fail(
      res,
      500,
      `Could not load product: ${String(err?.message || err).slice(0, 180)}`,
      "db_error",
    );
  }
});

/**
 * POST /api/catalog/publish — Merchant publishes inventory (incl. B2B price)
 */
router.post(
  "/publish",
  requireAuth,
  requireRole("merchant", "admin"),
  async (req, res) => {
    const shopId = req.user.shopId || req.body.shopId;
    if (!shopId) return fail(res, 400, "shopId required");

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return fail(res, 404, "Shop not found");
    if (shop.status !== "approved" && req.user.role === "merchant") {
      return fail(res, 403, "Shop must be approved before publishing");
    }

    const items = Array.isArray(req.body.products) ? req.body.products : [];
    const results = [];

    for (const item of items) {
      if (!item?.id && !item?.name) continue;
      const priceB2b =
        item.priceB2bKs != null && item.priceB2bKs !== ""
          ? Math.max(0, Math.floor(Number(item.priceB2bKs)))
          : null;
      const row = await prisma.product.upsert({
        where: { id: String(item.id || `tmp-${Date.now()}`) },
        create: {
          id: item.id ? String(item.id) : undefined,
          shopId,
          name: String(item.name),
          priceKs: Math.max(0, Math.floor(Number(item.priceKs) || 0)),
          priceB2bKs: priceB2b,
          compareAtKs:
            item.compareAtKs != null ? Math.floor(Number(item.compareAtKs)) : null,
          stock: Math.max(0, Math.floor(Number(item.stock) || 0)),
          categoryId: item.categoryId ?? null,
          badge: item.badge ?? null,
          imageUrl: item.imageUrl ?? null,
          active: item.active !== false,
          showOnWebsite: item.showOnWebsite !== false,
        },
        update: {
          name: String(item.name),
          priceKs: Math.max(0, Math.floor(Number(item.priceKs) || 0)),
          priceB2bKs: priceB2b,
          compareAtKs:
            item.compareAtKs != null ? Math.floor(Number(item.compareAtKs)) : null,
          stock: Math.max(0, Math.floor(Number(item.stock) || 0)),
          categoryId: item.categoryId ?? null,
          badge: item.badge ?? null,
          imageUrl: item.imageUrl ?? null,
          active: item.active !== false,
          showOnWebsite: item.showOnWebsite !== false,
        },
      });
      results.push(row.id);
    }

    return ok(res, { shopId, published: results.length, productIds: results });
  },
);

export default router;
