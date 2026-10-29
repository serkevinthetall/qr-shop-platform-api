import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail, requireShopOwner } from "../lib/merchant-auth.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

const METHODS = ["cod", "kpay", "uabpay", "ayapay", "cbpay", "mmqr", "cash"];

const ALL_METHODS = METHODS;

function publicPayment(row) {
  return {
    id: row.id,
    shopId: row.shopId,
    method: row.method,
    enabled: Boolean(row.enabled),
    qrUrl: row.qrUrl ?? null,
  };
}

/**
 * GET /api/merchant/payments
 * All wallet / COD methods for the shop (creates missing rows as disabled).
 */
router.get("/payments", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const existing = await prisma.shopPaymentMethod.findMany({
      where: { shopId },
    });
    const byMethod = new Map(existing.map((r) => [r.method, r]));
    const out = [];

    for (const method of ALL_METHODS) {
      let row = byMethod.get(method);
      if (!row) {
        row = await prisma.shopPaymentMethod.create({
          data: { shopId, method, enabled: method === "cod", qrUrl: null },
        });
      }
      out.push(publicPayment(row));
    }

    return ok(res, out);
  } catch (err) {
    console.error("merchant payments list", err);
    return fail(res, 500, "Could not load payments", "db_error");
  }
});

const putSchema = z.object({
  methods: z
    .array(
      z.object({
        method: z.enum(METHODS),
        enabled: z.boolean(),
        qrUrl: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

/**
 * PUT /api/merchant/payments
 * Bulk upsert enable flags + QR image URLs (owner only).
 */
router.put("/payments", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;

    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid payments payload");

    const out = [];
    for (const item of parsed.data.methods) {
      const row = await prisma.shopPaymentMethod.upsert({
        where: {
          shopId_method: { shopId, method: item.method },
        },
        create: {
          shopId,
          method: item.method,
          enabled: item.enabled,
          qrUrl: item.qrUrl ?? null,
        },
        update: {
          enabled: item.enabled,
          ...(item.qrUrl !== undefined ? { qrUrl: item.qrUrl } : {}),
        },
      });
      out.push(publicPayment(row));
    }

    return ok(res, out);
  } catch (err) {
    console.error("merchant payments put", err);
    return fail(res, 500, "Could not save payments", "db_error");
  }
});

/**
 * PATCH /api/merchant/payments/:method
 * Toggle one method or set qrUrl.
 */
router.patch("/payments/:method", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;

    const method = String(req.params.method || "").toLowerCase();
    if (!METHODS.includes(method)) return fail(res, 400, "Unknown payment method");

    const data = {};
    if (typeof req.body.enabled === "boolean") data.enabled = req.body.enabled;
    if (req.body.qrUrl !== undefined) {
      data.qrUrl = req.body.qrUrl?.trim?.() || null;
    }
    if (Object.keys(data).length === 0) {
      return fail(res, 400, "Nothing to update");
    }

    const row = await prisma.shopPaymentMethod.upsert({
      where: { shopId_method: { shopId, method } },
      create: {
        shopId,
        method,
        enabled: data.enabled ?? false,
        qrUrl: data.qrUrl ?? null,
      },
      update: data,
    });
    return ok(res, publicPayment(row));
  } catch (err) {
    console.error("merchant payments patch", err);
    return fail(res, 500, "Could not update payment", "db_error");
  }
});

export default router;
