/**
 * QR App–specific catalog API (not shared with Marketplace web).
 *
 * GET /api/app/catalog
 * GET /api/app/catalog/categories
 * GET /api/app/catalog/:id
 *
 * - Only SKUs with sellOnApp
 * - Retail by default; wholesale when merchant allowed this registered phone
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { toAppCatalogProduct } from "../lib/app-catalog-product.js";
import { parseMallProductId } from "../lib/mall-product.js";
import { defaultCategories } from "../lib/mall-meta.js";
import { ensureCategoriesSeeded } from "../lib/categories.js";
import {
  findBuyerProduct,
  findBuyerProducts,
  sellChannelWhere,
} from "../lib/merchant-product.js";
import { optionalAuth } from "../middlewares/auth.middleware.js";
import { normalizePhone } from "../lib/phone.js";
import { isRegisteredBuyer } from "../lib/shop-customers.js";

const router = Router();

const appShopGate = {
  status: "approved",
  listed: true,
  OR: [
    { features: null },
    { features: { listingMode: { not: "portfolio" } } },
  ],
};

/** Shops where this registered App user may see wholesale. */
async function wholesaleShopIdsForReq(req) {
  const ids = new Set();
  const sub = req.user?.sub;
  if (!sub) return ids;
  const user = await prisma.user.findUnique({
    where: { id: sub },
    select: {
      id: true,
      role: true,
      phone: true,
      passwordLoginEnabled: true,
    },
  });
  if (!isRegisteredBuyer(user)) return ids;
  const phone = normalizePhone(user.phone);
  if (!phone) return ids;
  const rows = await prisma.guestPhoneAccess.findMany({
    where: { phone, b2bAllowed: true },
    select: { shopId: true },
  });
  for (const r of rows) ids.add(r.shopId);
  return ids;
}

/**
 * GET /api/app/catalog/categories
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
    console.error("app catalog categories", err);
    return ok(res, defaultCategories());
  }
});

router.use(optionalAuth);

/**
 * GET /api/app/catalog — paginated product list for QR App
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
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 48));
    const skip = (page - 1) * limit;

    const where = {
      AND: [
        { ...sellChannelWhere("app") },
        categoryId
          ? { categoryId }
          : {
              AND: [
                { categoryId: { not: null } },
                { categoryId: { not: "" } },
              ],
            },
        { shop: appShopGate },
        ...(shopId ? [{ shopId }] : []),
        ...(deal ? [{ badge: { not: null } }] : []),
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q } },
                  { badge: { contains: q } },
                ],
              },
            ]
          : []),
      ],
    };

    const wholesaleShopIds = await wholesaleShopIdsForReq(req);
    const viewer = { wholesaleShopIds };

    /** Fetch a bit more than one page so retail-null (B2B-only) rows can be dropped. */
    const fetchTake = Math.min(500, limit + 24);
    const [totalRaw, products] = await Promise.all([
      prisma.product.count({ where }),
      findBuyerProducts({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: fetchTake,
      }),
    ]);

    const mapped = products
      .map((p) => toAppCatalogProduct(p, viewer))
      .filter(Boolean)
      .slice(0, limit);

    return ok(res, mapped, {
      page,
      limit,
      total: totalRaw,
      hasMore: skip + products.length < totalRaw,
      channel: "app",
      pricing: wholesaleShopIds.size ? "mixed" : "retail",
    });
  } catch (err) {
    console.error("app catalog list", err);
    return fail(res, 500, "Could not load app catalog", "db_error");
  }
});

/**
 * GET /api/app/catalog/:id — single SKU for QR App PDP
 */
router.get("/:id", async (req, res) => {
  try {
    if (["categories"].includes(req.params.id)) {
      return fail(res, 404, "Not found");
    }
    const { productId } = parseMallProductId(req.params.id);
    if (!productId) return fail(res, 400, "product id required");

    const product = await findBuyerProduct({
      where: {
        id: productId,
        ...sellChannelWhere("app"),
        AND: [
          { categoryId: { not: null } },
          { categoryId: { not: "" } },
        ],
        shop: appShopGate,
      },
    });
    if (!product) return fail(res, 404, "Product not found");

    const wholesaleShopIds = await wholesaleShopIdsForReq(req);
    const row = toAppCatalogProduct(product, { wholesaleShopIds });
    if (!row) {
      return fail(res, 404, "Product not available on app (no price)");
    }
    return ok(res, row);
  } catch (err) {
    console.error("app catalog get", err);
    return fail(res, 500, "Could not load product", "db_error");
  }
});

export default router;
