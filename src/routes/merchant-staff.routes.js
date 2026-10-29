import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail, requireShopOwner } from "../lib/merchant-auth.js";
import { normalizePhone } from "../lib/phone.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

function publicStaff(u) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    active: u.active !== false,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

async function assertStaffModule(shopId, res) {
  const features = await prisma.shopFeatures.findUnique({ where: { shopId } });
  if (!features?.staffEnabled) {
    fail(res, 403, "Staff module is off — enable it in Modules");
    return false;
  }
  return true;
}

/** GET /api/merchant/staff — roster */
router.get("/staff", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!(await assertStaffModule(shopId, res))) return;

    const rows = await prisma.user.findMany({
      where: { shopId, role: "staff" },
      orderBy: { name: "asc" },
    });
    return ok(res, rows.map(publicStaff));
  } catch (err) {
    console.error("merchant staff list", err);
    return fail(res, 500, "Could not load staff", "db_error");
  }
});

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  /** 4–8 digit PIN stored as passwordHash */
  pin: z.string().min(4).max(8),
  active: z.boolean().optional(),
});

/** POST /api/merchant/staff — add staff (owner) */
router.post("/staff", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;
    if (!(await assertStaffModule(shopId, res))) return;

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid staff payload");

    const phone = normalizePhone(parsed.data.phone);
    const taken = await prisma.user.findFirst({
      where: { OR: [{ phone }, { phone: parsed.data.phone }] },
    });
    if (taken) return fail(res, 409, "Phone already registered");

    const passwordHash = await bcrypt.hash(parsed.data.pin, 10);
    const row = await prisma.user.create({
      data: {
        role: "staff",
        name: parsed.data.name.trim(),
        phone,
        passwordHash,
        shopId,
        active: parsed.data.active !== false,
      },
    });
    return ok(res.status(201), publicStaff(row));
  } catch (err) {
    console.error("merchant staff create", err);
    return fail(res, 500, "Could not create staff", "db_error");
  }
});

/** PATCH /api/merchant/staff/:id — name / active / pin */
router.patch("/staff/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;
    if (!(await assertStaffModule(shopId, res))) return;

    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, shopId, role: "staff" },
    });
    if (!existing) return fail(res, 404, "Staff not found");

    const data = {};
    if (req.body.name != null) data.name = String(req.body.name).trim();
    if (typeof req.body.active === "boolean") data.active = req.body.active;
    if (req.body.pin != null) {
      const pin = String(req.body.pin);
      if (pin.length < 4 || pin.length > 8) {
        return fail(res, 400, "PIN must be 4–8 characters");
      }
      data.passwordHash = await bcrypt.hash(pin, 10);
    }
    if (Object.keys(data).length === 0) {
      return fail(res, 400, "Nothing to update");
    }

    const row = await prisma.user.update({
      where: { id: existing.id },
      data,
    });
    return ok(res, publicStaff(row));
  } catch (err) {
    console.error("merchant staff patch", err);
    return fail(res, 500, "Could not update staff", "db_error");
  }
});

/** DELETE /api/merchant/staff/:id — deactivate or hard-remove */
router.delete("/staff/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;
    if (!(await assertStaffModule(shopId, res))) return;

    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, shopId, role: "staff" },
    });
    if (!existing) return fail(res, 404, "Staff not found");

    const hard = req.query.hard === "1" || req.query.hard === "true";
    if (hard) {
      await prisma.user.delete({ where: { id: existing.id } });
      return ok(res, { id: existing.id, deleted: true });
    }

    const row = await prisma.user.update({
      where: { id: existing.id },
      data: { active: false },
    });
    return ok(res, publicStaff(row));
  } catch (err) {
    console.error("merchant staff delete", err);
    return fail(res, 500, "Could not remove staff", "db_error");
  }
});

export default router;
