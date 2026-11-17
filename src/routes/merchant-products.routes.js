import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail, requireShopOwner } from "../lib/merchant-auth.js";
import {
  productWriteData,
  publicMerchantProduct,
} from "../lib/merchant-product.js";
import { resolveListingMode } from "../lib/shop-channels.js";
import { recordStockAdjustMove } from "../lib/stock-moves.js";
import { ensureWholesaleMinQtyColumn } from "../lib/ensure-schema.js";
import { resolveProductBadgeName } from "../lib/product-badges.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));
router.use(async (_req, _res, next) => {
  try {
    await ensureWholesaleMinQtyColumn();
  } catch {
    /* logged in ensure-schema */
  }
  next();
});

async function shopIsCatalogOnly(shopId) {
  const features = await prisma.shopFeatures.findUnique({ where: { shopId } });
  return resolveListingMode(features) === "portfolio";
}

/**
 * GET /api/merchant/stock-moves
 * In/out ledger linked to orders + current inventory count (may be negative).
 * Query: ?productId=&q=name|barcode&limit=80
 */
router.get("/stock-moves", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    const productId = String(req.query.productId || "").trim();
    const q = String(req.query.q || "").trim();
    const limit = Math.min(200, Math.max(1, Math.floor(Number(req.query.limit) || 80)));

    const where = { shopId };
    if (productId) {
      where.productId = productId;
    } else if (q) {
      const matched = await prisma.product.findMany({
        where: {
          shopId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { barcode: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 100,
      });
      const ids = matched.map((p) => p.id);
      where.OR = [
        ...(ids.length ? [{ productId: { in: ids } }] : []),
        { productName: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.stockMove.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        product: { select: { id: true, name: true, barcode: true, stock: true } },
      },
    });

    const outQty = rows
      .filter((r) => r.direction === "out")
      .reduce((s, r) => s + r.qty, 0);
    const inQty = rows
      .filter((r) => r.direction === "in")
      .reduce((s, r) => s + r.qty, 0);

    const moves = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: r.productName,
      barcode: r.product?.barcode ?? null,
      /** Live inventory count — negative = sold without enough IN */
      stockNow: r.product?.stock ?? null,
      qty: r.qty,
      direction: r.direction,
      reason: r.reason,
      orderId: r.orderId,
      note: r.note,
      createdAt: r.createdAt,
    }));

    return ok(res, {
      moves,
      summary: { outQty, inQty, netOutQty: outQty - inQty },
    });
  } catch (err) {
    console.error("stock-moves list", err);
    return fail(res, 500, "Could not load stock moves", "db_error");
  }
});

const createSchema = z.object({
  name: z.string().min(1),
  priceKs: z.number().int().nonnegative(),
  priceB2bKs: z.number().int().nonnegative().nullable().optional(),
  wholesaleMinQty: z.number().int().positive().nullable().optional(),
  compareAtKs: z.number().int().nonnegative().nullable().optional(),
  costKs: z.number().int().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative().optional(),
  lowStockAlertEnabled: z.boolean().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  categoryId: z.string().min(1, "Category required"),
  badge: z.string().optional(),
  imageUrl: z
    .string()
    .optional()
    .refine(
      (v) =>
        v == null ||
        v === "" ||
        (!v.startsWith("blob:") &&
          !v.startsWith("data:") &&
          !v.startsWith("file:")),
      "Product photo must be an uploaded https URL (not a browser blob)",
    ),
  barcode: z.string().optional(),
  uom: z.string().optional(),
  purchaseUom: z.string().optional(),
  uomFactor: z.number().int().positive().optional(),
  templateId: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  active: z.boolean().optional(),
  showOnWebsite: z.boolean().optional(),
  sellOnMarketplace: z.boolean().optional(),
  sellOnApp: z.boolean().optional(),
  sellOnOwnPage: z.boolean().optional(),
});

/**
 * GET /api/merchant/products
 * Inventory list for the signed-in shop.
 */
router.get("/products", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const q = String(req.query.q || "").trim();
    const activeOnly = req.query.active === "1" || req.query.active === "true";
    const lowStock = req.query.lowStock === "1" || req.query.lowStock === "true";

    const where = {
      shopId,
      ...(activeOnly ? { active: true } : {}),
      ...(lowStock ? { lowStockAlertEnabled: true } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { barcode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const rows = await prisma.product.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
    });
    const mapped = rows.map(publicMerchantProduct);
    if (!lowStock) return ok(res, mapped);
    return ok(
      res,
      mapped.filter((p) => p.stock <= (p.lowStockThreshold ?? 5)),
    );
  } catch (err) {
    console.error("merchant products list", err);
    return fail(res, 500, "Could not load products", "db_error");
  }
});

/** GET /api/merchant/products/:id */
router.get("/products/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const row = await prisma.product.findFirst({
      where: { id: req.params.id, shopId },
    });
    if (!row) return fail(res, 404, "Product not found");
    return ok(res, publicMerchantProduct(row));
  } catch (err) {
    console.error("merchant product get", err);
    return fail(res, 500, "Could not load product", "db_error");
  }
});

/** POST /api/merchant/products — create SKU (owner only) */
router.post("/products", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return fail(res, 404, "Shop not found");
    if (shop.status === "pending" || shop.status === "rejected" || shop.status === "suspended") {
      return fail(res, 403, "Shop cannot create products in this status");
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const detail = first?.message
        ? `${first.path.join(".") || "body"}: ${first.message}`
        : "Invalid product";
      return fail(res, 400, detail, "invalid_product");
    }

    const data = productWriteData(parsed.data);
    if (!data.name) return fail(res, 400, "Name required");
    const categoryId = String(data.categoryId || "").trim();
    if (!categoryId) {
      return fail(res, 400, "Category required", "category_required");
    }
    if (data.priceB2bKs != null && data.priceB2bKs > 0) {
      const minQty = data.wholesaleMinQty;
      if (minQty == null || minQty < 2) {
        return fail(
          res,
          400,
          "Set min qty for wholesale (at least 2)",
          "wholesale_min_qty",
        );
      }
    }

    let badge = null;
    if (data.badge) {
      const resolved = await resolveProductBadgeName(data.badge, {
        allowInactive: true,
      });
      if (resolved === undefined) {
        return fail(
          res,
          400,
          "Pick a badge from the Admin list (or leave empty)",
          "invalid_badge",
        );
      }
      badge = resolved;
    }

    const published = data.active !== false;
    const catalogOnly = await shopIsCatalogOnly(shopId);
    let sellOnMarketplace =
      !catalogOnly && published && data.sellOnMarketplace === true;
    let sellOnApp = !catalogOnly && published && data.sellOnApp === true;
    if (sellOnMarketplace) {
      const settings = await prisma.platformSettings.findUnique({
        where: { id: "default" },
      });
      if (settings && settings.submissions === false) {
        return fail(
          res,
          403,
          "Mall submissions are paused by platform admin",
          "submissions_off",
        );
      }
    }

    const row = await prisma.product.create({
      data: {
        shopId,
        name: data.name,
        priceKs: data.priceKs ?? 0,
        priceB2bKs: data.priceB2bKs ?? null,
        wholesaleMinQty: data.wholesaleMinQty ?? null,
        compareAtKs: data.compareAtKs ?? null,
        costKs: data.costKs ?? null,
        stock: data.stock ?? 0,
        categoryId,
        badge,
        imageUrl: data.imageUrl ?? null,
        barcode: data.barcode ?? null,
        uom: data.uom ?? "piece",
        purchaseUom: data.purchaseUom ?? "piece",
        uomFactor: data.uomFactor ?? 1,
        templateId: data.templateId ?? null,
        attributesJson:
          data.attributesJson ??
          (parsed.data.attributes
            ? JSON.stringify(parsed.data.attributes)
            : "{}"),
        active: published,
        /** Published → shop website; mall/app only when those flags are on. */
        sellOnOwnPage: published,
        sellOnMarketplace,
        sellOnApp,
        showOnWebsite: published || sellOnMarketplace || sellOnApp,
      },
    });
    return ok(res.status(201), publicMerchantProduct(row));
  } catch (err) {
    console.error("merchant product create", err);
    return fail(res, 500, "Could not create product", "db_error");
  }
});

/** PUT /api/merchant/products/:id — full/partial update (owner only) */
router.put("/products/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;

    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, shopId },
    });
    if (!existing) return fail(res, 404, "Product not found");

    const data = productWriteData(req.body, { partial: true });
    if (Object.keys(data).length === 0) {
      return ok(res, publicMerchantProduct(existing));
    }

    if (data.badge !== undefined) {
      if (!data.badge) {
        data.badge = null;
      } else {
        const resolved = await resolveProductBadgeName(data.badge, {
          allowInactive: true,
        });
        if (resolved === undefined) {
          return fail(
            res,
            400,
            "Pick a badge from the Admin list (or leave empty)",
            "invalid_badge",
          );
        }
        data.badge = resolved;
      }
    }

    const nextWs =
      data.priceB2bKs !== undefined ? data.priceB2bKs : existing.priceB2bKs;
    const nextMin =
      data.wholesaleMinQty !== undefined
        ? data.wholesaleMinQty
        : existing.wholesaleMinQty;
    if (nextWs != null && Number(nextWs) > 0) {
      if (nextMin == null || Number(nextMin) < 2) {
        return fail(
          res,
          400,
          "Set min qty for wholesale (at least 2)",
          "wholesale_min_qty",
        );
      }
    }

    const nextActive =
      typeof data.active === "boolean" ? data.active : existing.active;
    const nextCategory =
      data.categoryId !== undefined
        ? String(data.categoryId || "").trim()
        : String(existing.categoryId || "").trim();
    if (nextActive && !nextCategory) {
      return fail(
        res,
        400,
        "Category required to publish this product",
        "category_required",
      );
    }
    if (data.categoryId !== undefined) {
      data.categoryId = nextCategory || null;
    }
    const wantMall =
      nextActive &&
      (data.sellOnMarketplace === true ||
        (data.sellOnMarketplace === undefined && existing.sellOnMarketplace));
    if (wantMall && data.sellOnMarketplace !== false) {
      const settings = await prisma.platformSettings.findUnique({
        where: { id: "default" },
      });
      if (settings && settings.submissions === false && data.sellOnMarketplace === true) {
        return fail(
          res,
          403,
          "Mall submissions are paused by platform admin",
          "submissions_off",
        );
      }
    }
    if (!nextActive) {
      data.active = false;
      data.sellOnOwnPage = false;
      data.sellOnMarketplace = false;
      data.sellOnApp = false;
      data.showOnWebsite = false;
    } else {
      data.sellOnOwnPage = true;
      if (data.sellOnMarketplace === true || data.sellOnApp === true) {
        data.showOnWebsite = true;
      } else if (data.showOnWebsite == null) {
        data.showOnWebsite = true;
      }
      // Marketplace / App require published — strip if client sent channels without active
      if (typeof data.sellOnMarketplace === "boolean" && !nextActive) {
        data.sellOnMarketplace = false;
      }
      if (typeof data.sellOnApp === "boolean" && !nextActive) {
        data.sellOnApp = false;
      }
      /** Catalog only shops cannot list on Marketplace or App. */
      if (await shopIsCatalogOnly(shopId)) {
        data.sellOnMarketplace = false;
        data.sellOnApp = false;
      }
    }

    const row = await prisma.product.update({
      where: { id: existing.id },
      data,
    });
    return ok(res, publicMerchantProduct(row));
  } catch (err) {
    console.error("merchant product update", err);
    return fail(res, 500, "Could not update product", "db_error");
  }
});

/**
 * PATCH /api/merchant/products/:id/stock
 * Adjust stock: { set } or { delta } (staff may adjust).
 */
router.patch("/products/:id/stock", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, shopId },
    });
    if (!existing) return fail(res, 404, "Product not found");

    const prev = existing.stock;
    let next = prev;
    if (req.body.set != null) {
      /** Allow negative counts — sold without prior stock-in */
      next = Math.floor(Number(req.body.set));
    } else if (req.body.delta != null) {
      next = prev + Math.floor(Number(req.body.delta));
    } else {
      return fail(res, 400, "Provide set or delta");
    }
    if (!Number.isFinite(next)) {
      return fail(res, 400, "Invalid stock value");
    }

    const row = await prisma.product.update({
      where: { id: existing.id },
      data: { stock: next },
    });
    try {
      await recordStockAdjustMove({
        shopId,
        product: row,
        prevStock: prev,
        nextStock: next,
      });
    } catch (e) {
      console.warn("stock adjust move", e);
    }
    return ok(res, publicMerchantProduct(row));
  } catch (err) {
    console.error("merchant product stock", err);
    return fail(res, 500, "Could not update stock", "db_error");
  }
});

/** DELETE /api/merchant/products/:id — soft-deactivate (owner) */
router.delete("/products/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;

    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, shopId },
    });
    if (!existing) return fail(res, 404, "Product not found");

    const hard = req.query.hard === "1" || req.query.hard === "true";
    if (hard) {
      /** Detach order lines first — FK has no onDelete and blocks hard delete. */
      await prisma.orderLine.updateMany({
        where: { productId: existing.id },
        data: { productId: null },
      });
      await prisma.product.delete({ where: { id: existing.id } });
      return ok(res, { id: existing.id, deleted: true });
    }

    const row = await prisma.product.update({
      where: { id: existing.id },
      data: {
        active: false,
        showOnWebsite: false,
        sellOnOwnPage: false,
        sellOnMarketplace: false,
        sellOnApp: false,
      },
    });
    return ok(res, publicMerchantProduct(row));
  } catch (err) {
    console.error("merchant product delete", err);
    return fail(res, 500, "Could not delete product", "db_error");
  }
});

export default router;
