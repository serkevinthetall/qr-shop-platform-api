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

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

const createSchema = z.object({
  name: z.string().min(1),
  priceKs: z.number().int().nonnegative(),
  priceB2bKs: z.number().int().nonnegative().nullable().optional(),
  compareAtKs: z.number().int().nonnegative().nullable().optional(),
  costKs: z.number().int().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative().optional(),
  categoryId: z.string().optional(),
  badge: z.string().optional(),
  imageUrl: z.string().optional(),
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
    const lowThreshold = Math.max(0, Math.floor(Number(req.query.threshold) || 5));

    const where = {
      shopId,
      ...(activeOnly ? { active: true } : {}),
      ...(lowStock ? { stock: { lte: lowThreshold } } : {}),
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
    return ok(res, rows.map(publicMerchantProduct));
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
    if (!parsed.success) return fail(res, 400, "Invalid product");

    const data = productWriteData(parsed.data);
    if (!data.name) return fail(res, 400, "Name required");

    const row = await prisma.product.create({
      data: {
        shopId,
        name: data.name,
        priceKs: data.priceKs ?? 0,
        priceB2bKs: data.priceB2bKs ?? null,
        compareAtKs: data.compareAtKs ?? null,
        costKs: data.costKs ?? null,
        stock: data.stock ?? 0,
        categoryId: data.categoryId ?? "essentials",
        badge: data.badge ?? null,
        imageUrl: data.imageUrl ?? null,
        barcode: data.barcode ?? null,
        uom: data.uom ?? "piece",
        purchaseUom: data.purchaseUom ?? "piece",
        uomFactor: data.uomFactor ?? 1,
        templateId: data.templateId ?? null,
        attributesJson: data.attributesJson ?? "{}",
        active: data.active !== false,
        showOnWebsite: data.showOnWebsite !== false,
        sellOnMarketplace: data.sellOnMarketplace !== false,
        sellOnApp: data.sellOnApp !== false,
        sellOnOwnPage: data.sellOnOwnPage !== false,
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

    let next = existing.stock;
    if (req.body.set != null) {
      next = Math.max(0, Math.floor(Number(req.body.set)));
    } else if (req.body.delta != null) {
      next = Math.max(0, existing.stock + Math.floor(Number(req.body.delta)));
    } else {
      return fail(res, 400, "Provide set or delta");
    }

    const row = await prisma.product.update({
      where: { id: existing.id },
      data: { stock: next },
    });
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
      await prisma.product.delete({ where: { id: existing.id } });
      return ok(res, { id: existing.id, deleted: true });
    }

    const row = await prisma.product.update({
      where: { id: existing.id },
      data: { active: false, showOnWebsite: false },
    });
    return ok(res, publicMerchantProduct(row));
  } catch (err) {
    console.error("merchant product delete", err);
    return fail(res, 500, "Could not delete product", "db_error");
  }
});

export default router;
