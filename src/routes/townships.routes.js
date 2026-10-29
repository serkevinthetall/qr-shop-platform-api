import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { publicTownship } from "../lib/township.js";

const router = Router();

/** GET /api/townships — active (published) for Marketplace + Merchant */
router.get("/", async (req, res) => {
  try {
    const all = req.query.all === "1" || req.query.all === "true";
    const rows = await prisma.township.findMany({
      where: all ? undefined : { active: true },
      orderBy: [{ state: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return ok(res, rows.map(publicTownship));
  } catch (err) {
    console.error("townships list", err);
    return fail(res, 500, "Could not load townships", "db_error");
  }
});

/** GET /api/townships/:id */
router.get("/:id", async (req, res) => {
  const t = await prisma.township.findUnique({ where: { id: req.params.id } });
  if (!t) return fail(res, 404, "Township not found");
  return ok(res, publicTownship(t));
});

const upsertSchema = z.object({
  id: z.string().min(2),
  name: z.string().min(1),
  nameEn: z.string().optional(),
  nameMm: z.string().optional(),
  state: z.string().min(1),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  sequence: z.number().int().optional(),
});

/** POST /api/townships — Admin add/update */
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Invalid township");
  const b = parsed.data;
  const row = await prisma.township.upsert({
    where: { id: b.id },
    create: {
      id: b.id,
      name: b.name,
      nameEn: b.nameEn,
      nameMm: b.nameMm,
      state: b.state,
      postalCode: b.postalCode ?? "",
      country: b.country ?? "Myanmar",
      active: b.active ?? false,
      sortOrder: b.sortOrder ?? 0,
      sequence: b.sequence,
    },
    update: {
      name: b.name,
      nameEn: b.nameEn,
      nameMm: b.nameMm,
      state: b.state,
      postalCode: b.postalCode ?? "",
      country: b.country ?? "Myanmar",
      ...(b.active != null ? { active: b.active } : {}),
      ...(b.sortOrder != null ? { sortOrder: b.sortOrder } : {}),
      sequence: b.sequence,
    },
  });
  return ok(res, publicTownship(row), { created: true });
});

/**
 * PATCH /api/townships/bulk — Admin Select all / Clear all
 * Body: { active: boolean, state?: string }
 * If state omitted, updates every township in the catalog.
 */
router.patch("/bulk", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    if (typeof req.body.active !== "boolean") {
      return fail(res, 400, "active boolean required");
    }
    const state = String(req.body.state || "").trim();
    const where = state ? { state } : {};
    const result = await prisma.township.updateMany({
      where,
      data: { active: req.body.active },
    });
    return ok(res, {
      updated: result.count,
      active: req.body.active,
      state: state || null,
    });
  } catch (err) {
    console.error("townships bulk", err);
    return fail(res, 500, "Could not update townships", "db_error");
  }
});

/** PATCH /api/townships/:id — Admin publish / edit */
router.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const existing = await prisma.township.findUnique({ where: { id: req.params.id } });
  if (!existing) return fail(res, 404, "Township not found");
  const data = {};
  for (const key of [
    "name",
    "nameEn",
    "nameMm",
    "state",
    "postalCode",
    "country",
    "active",
    "sortOrder",
    "sequence",
  ]) {
    if (req.body[key] !== undefined) data[key] = req.body[key];
  }
  const row = await prisma.township.update({
    where: { id: req.params.id },
    data,
  });
  return ok(res, publicTownship(row));
});

export default router;
