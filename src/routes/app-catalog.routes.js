/**
 * QR App–specific catalog API (not shared with Marketplace web).
 *
 * GET /api/app/catalog
 * GET /api/app/catalog/categories
 * GET /api/app/catalog/:id
 *
 * - Only SKUs with sellOnApp
 * - Retail (B2C) prices only — no wholesale fields
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { toAppCatalogProduct } from "../lib/app-catalog-product.js";
import { parseMallProductId } from "../lib/mall-product.js";
import { defaultCategories } from "../lib/mall-meta.js";
import { ensureCategoriesSeeded } from "../lib/categories.js";
import { sellChannelWhere } from "../lib/merchant-product.js";

const router = Router();

const productInclude = {
  shop: {
    select: {
      id: true,
      name: true,
      slug: true,
      features: true,
    },
  },
};

const appShopGate = {
  status: "approved",
  listed: true,
  OR: [
    { features: null },
    { features: { listingMode: { not: "portfolio" } } },
  ],
};

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

/**
 * GET /api/app/catalog — paginated retail-only product list for QR App
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

    /** Fetch a bit more than one page so retail-null (B2B-only) rows can be dropped. */
    const fetchTake = Math.min(500, limit + 24);
    const [totalRaw, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { updatedAt: "desc" },
        skip,
        take: fetchTake,
      }),
    ]);

    const mapped = products
      .map(toAppCatalogProduct)
      .filter(Boolean)
      .slice(0, limit);

    return ok(res, mapped, {
      page,
      limit,
      total: totalRaw,
      hasMore: skip + products.length < totalRaw,
      channel: "app",
      pricing: "retail",
    });
  } catch (err) {
    console.error("app catalog list", err);
    return fail(res, 500, "Could not load app catalog", "db_error");
  }
});

/**
 * GET /api/app/catalog/:id — single SKU for QR App PDP (retail-only)
 */
router.get("/:id", async (req, res) => {
  try {
    if (["categories"].includes(req.params.id)) {
      return fail(res, 404, "Not found");
    }
    const { productId } = parseMallProductId(req.params.id);
    if (!productId) return fail(res, 400, "product id required");

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        ...sellChannelWhere("app"),
        AND: [
          { categoryId: { not: null } },
          { categoryId: { not: "" } },
        ],
        shop: appShopGate,
      },
      include: productInclude,
    });
    if (!product) return fail(res, 404, "Product not found");

    const row = toAppCatalogProduct(product);
    if (!row) {
      return fail(res, 404, "Product not available on app (no retail price)");
    }
    return ok(res, row);
  } catch (err) {
    console.error("app catalog get", err);
    return fail(res, 500, "Could not load product", "db_error");
  }
});

export default router;
