import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail, requireShopOwner } from "../lib/merchant-auth.js";
import { listPlatformPayments } from "../lib/platform-payments.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

function publicPayment(row, meta) {
  return {
    id: row.id,
    shopId: row.shopId,
    method: row.method,
    enabled: Boolean(row.enabled),
    qrUrl: row.qrUrl ?? null,
    label: meta?.label ?? row.method,
    shortLabel: meta?.shortLabel ?? row.method,
    subtitle: meta?.subtitle ?? "",
    needsQr: meta?.needsQr !== false,
  };
}

/**
 * GET /api/merchant/payments
 * Methods from Admin platform catalog (active only) + shop enable/QR rows.
 */
router.get("/payments", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const catalog = await listPlatformPayments({ activeOnly: true });
    const existing = await prisma.shopPaymentMethod.findMany({
      where: { shopId },
    });
    const byMethod = new Map(existing.map((r) => [r.method, r]));
    const out = [];

    for (const meta of catalog) {
      let row = byMethod.get(meta.id);
      if (!row) {
        row = await prisma.shopPaymentMethod.create({
          data: {
            shopId,
            method: meta.id,
            enabled: meta.id === "cod",
            qrUrl: null,
          },
        });
      }
      out.push(publicPayment(row, meta));
    }

    return ok(res, out);
  } catch (err) {
    console.error("merchant payments list", err);
    return fail(res, 500, "Could not load payments", "db_error");
  }
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

    const catalog = await listPlatformPayments({ activeOnly: true });
    const allowed = new Set(catalog.map((m) => m.id));
    const putSchema = z.object({
      methods: z
        .array(
          z.object({
            method: z.string().min(1),
            enabled: z.boolean(),
            qrUrl: z.string().nullable().optional(),
          }),
        )
        .min(1),
    });
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid payments payload");

    const out = [];
    for (const item of parsed.data.methods) {
      if (!allowed.has(item.method)) continue;
      const meta = catalog.find((m) => m.id === item.method);
      const row = await prisma.shopPaymentMethod.upsert({
        where: { shopId_method: { shopId, method: item.method } },
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
      out.push(publicPayment(row, meta));
    }

    return ok(res, out);
  } catch (err) {
    console.error("merchant payments put", err);
    return fail(res, 500, "Could not save payments", "db_error");
  }
});

/**
 * PATCH /api/merchant/payments/:method
 */
router.patch("/payments/:method", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;

    const method = String(req.params.method || "")
      .trim()
      .toLowerCase();
    const catalog = await listPlatformPayments({ activeOnly: true });
    const meta = catalog.find((m) => m.id === method);
    if (!meta) return fail(res, 400, "Unknown or inactive payment method");

    const data = {};
    if (typeof req.body.enabled === "boolean") data.enabled = req.body.enabled;
    if ("qrUrl" in req.body) data.qrUrl = req.body.qrUrl || null;

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
    return ok(res, publicPayment(row, meta));
  } catch (err) {
    console.error("merchant payments patch", err);
    return fail(res, 500, "Could not update payment", "db_error");
  }
});

export default router;
