import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { formatLocation } from "../lib/township.js";

const router = Router();

router.use(requireAuth, requireRole("buyer"));

function publicAddress(a) {
  return {
    id: a.id,
    label: a.label,
    street: a.street,
    townshipId: a.townshipId,
    location: a.location,
    isDefault: a.isDefault,
  };
}

async function syncUserDefault(userId) {
  const def = await prisma.buyerAddress.findFirst({
    where: { userId, isDefault: true },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      address: def?.location ?? null,
      townshipId: def?.townshipId ?? null,
    },
  });
}

/** GET /api/addresses — saved places for logged-in buyer */
router.get("/", async (req, res) => {
  const rows = await prisma.buyerAddress.findMany({
    where: { userId: req.user.sub },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return ok(res, rows.map(publicAddress));
});

const saveSchema = z.object({
  label: z.string().min(1).optional(),
  street: z.string().min(1),
  townshipId: z.string().min(1),
  isDefault: z.boolean().optional(),
});

/** POST /api/addresses */
router.post("/", async (req, res) => {
  try {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "street and townshipId required");

    const township = await prisma.township.findUnique({
      where: { id: parsed.data.townshipId },
    });
    if (!township || !township.active) {
      return fail(res, 400, "Choose a published township");
    }

    const existingCount = await prisma.buyerAddress.count({
      where: { userId: req.user.sub },
    });
    const makeDefault =
      parsed.data.isDefault === true || existingCount === 0;

    if (makeDefault) {
      await prisma.buyerAddress.updateMany({
        where: { userId: req.user.sub },
        data: { isDefault: false },
      });
    }

    const location = formatLocation(parsed.data.street, township);
    const row = await prisma.buyerAddress.create({
      data: {
        userId: req.user.sub,
        label: parsed.data.label?.trim() || "Home",
        street: parsed.data.street.trim(),
        townshipId: township.id,
        location,
        isDefault: makeDefault,
      },
    });
    await syncUserDefault(req.user.sub);
    return ok(res, publicAddress(row), { created: true });
  } catch (err) {
    console.error("address create", err);
    return fail(res, 500, "Could not save address", "db_error");
  }
});

/** PATCH /api/addresses/:id */
router.patch("/:id", async (req, res) => {
  try {
    const existing = await prisma.buyerAddress.findFirst({
      where: { id: req.params.id, userId: req.user.sub },
    });
    if (!existing) return fail(res, 404, "Address not found");

    const street =
      req.body.street != null ? String(req.body.street).trim() : existing.street;
    const townshipId =
      req.body.townshipId != null
        ? String(req.body.townshipId)
        : existing.townshipId;
    const label =
      req.body.label != null ? String(req.body.label).trim() : existing.label;

    const township = await prisma.township.findUnique({ where: { id: townshipId } });
    if (!township || !township.active) {
      return fail(res, 400, "Choose a published township");
    }

    if (req.body.isDefault === true) {
      await prisma.buyerAddress.updateMany({
        where: { userId: req.user.sub },
        data: { isDefault: false },
      });
    }

    const row = await prisma.buyerAddress.update({
      where: { id: existing.id },
      data: {
        street,
        townshipId,
        label: label || "Home",
        location: formatLocation(street, township),
        ...(req.body.isDefault === true ? { isDefault: true } : {}),
      },
    });
    await syncUserDefault(req.user.sub);
    return ok(res, publicAddress(row));
  } catch (err) {
    console.error("address patch", err);
    return fail(res, 500, "Could not update address", "db_error");
  }
});

/** POST /api/addresses/:id/default */
router.post("/:id/default", async (req, res) => {
  const existing = await prisma.buyerAddress.findFirst({
    where: { id: req.params.id, userId: req.user.sub },
  });
  if (!existing) return fail(res, 404, "Address not found");
  await prisma.buyerAddress.updateMany({
    where: { userId: req.user.sub },
    data: { isDefault: false },
  });
  const row = await prisma.buyerAddress.update({
    where: { id: existing.id },
    data: { isDefault: true },
  });
  await syncUserDefault(req.user.sub);
  return ok(res, publicAddress(row));
});

/** DELETE /api/addresses/:id */
router.delete("/:id", async (req, res) => {
  const existing = await prisma.buyerAddress.findFirst({
    where: { id: req.params.id, userId: req.user.sub },
  });
  if (!existing) return fail(res, 404, "Address not found");
  await prisma.buyerAddress.delete({ where: { id: existing.id } });
  if (existing.isDefault) {
    const next = await prisma.buyerAddress.findFirst({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await prisma.buyerAddress.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
    await syncUserDefault(req.user.sub);
  }
  return ok(res, { deleted: true });
});

export default router;
