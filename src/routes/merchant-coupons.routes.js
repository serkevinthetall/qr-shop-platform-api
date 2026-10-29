import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail, requireShopOwner } from "../lib/merchant-auth.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

async function assertCouponsModule(shopId, res) {
  const features = await prisma.shopFeatures.findUnique({ where: { shopId } });
  if (!features?.couponCodesEnabled) {
    fail(res, 403, "Coupon module is off — enable it in Modules");
    return false;
  }
  return true;
}

/** GET /api/merchant/coupons */
router.get("/coupons", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!(await assertCouponsModule(shopId, res))) return;

    const rows = await prisma.coupon.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, rows);
  } catch (err) {
    console.error("merchant coupons list", err);
    return fail(res, 500, "Could not load coupons", "db_error");
  }
});

const createSchema = z.object({
  code: z.string().min(2).max(32),
  kind: z.enum(["percent", "amount"]),
  percent: z.number().int().min(1).max(100).optional(),
  amountKs: z.number().int().positive().optional(),
  minSubtotalKs: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

/** POST /api/merchant/coupons */
router.post("/coupons", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;
    if (!(await assertCouponsModule(shopId, res))) return;

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid coupon");

    const code = parsed.data.code.trim().toUpperCase();
    if (parsed.data.kind === "percent" && !parsed.data.percent) {
      return fail(res, 400, "percent required for percent coupons");
    }
    if (parsed.data.kind === "amount" && !parsed.data.amountKs) {
      return fail(res, 400, "amountKs required for amount coupons");
    }

    const row = await prisma.coupon.create({
      data: {
        shopId,
        code,
        kind: parsed.data.kind,
        percent: parsed.data.kind === "percent" ? parsed.data.percent : null,
        amountKs: parsed.data.kind === "amount" ? parsed.data.amountKs : null,
        minSubtotalKs: parsed.data.minSubtotalKs ?? null,
        active: parsed.data.active !== false,
      },
    });
    return ok(res.status(201), row);
  } catch (err) {
    if (err?.code === "P2002") return fail(res, 409, "Coupon code already exists");
    console.error("merchant coupon create", err);
    return fail(res, 500, "Could not create coupon", "db_error");
  }
});

/** PATCH /api/merchant/coupons/:id */
router.patch("/coupons/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;
    if (!(await assertCouponsModule(shopId, res))) return;

    const existing = await prisma.coupon.findFirst({
      where: { id: req.params.id, shopId },
    });
    if (!existing) return fail(res, 404, "Coupon not found");

    const data = {};
    if (typeof req.body.active === "boolean") data.active = req.body.active;
    if (req.body.percent != null) data.percent = Math.floor(Number(req.body.percent));
    if (req.body.amountKs != null) {
      data.amountKs = Math.floor(Number(req.body.amountKs));
    }
    if (req.body.minSubtotalKs !== undefined) {
      data.minSubtotalKs =
        req.body.minSubtotalKs == null
          ? null
          : Math.floor(Number(req.body.minSubtotalKs));
    }

    const row = await prisma.coupon.update({
      where: { id: existing.id },
      data,
    });
    return ok(res, row);
  } catch (err) {
    console.error("merchant coupon patch", err);
    return fail(res, 500, "Could not update coupon", "db_error");
  }
});

/** DELETE /api/merchant/coupons/:id */
router.delete("/coupons/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;
    if (!(await assertCouponsModule(shopId, res))) return;

    const existing = await prisma.coupon.findFirst({
      where: { id: req.params.id, shopId },
    });
    if (!existing) return fail(res, 404, "Coupon not found");

    await prisma.coupon.delete({ where: { id: existing.id } });
    return ok(res, { id: existing.id, deleted: true });
  } catch (err) {
    console.error("merchant coupon delete", err);
    return fail(res, 500, "Could not delete coupon", "db_error");
  }
});

export default router;
