import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

/**
 * GET /api/merchant/guides
 * Published help blogs (written in Admin → Guides).
 */
router.get("/guides", async (req, res) => {
  try {
    const list = await prisma.guide.findMany({
      where: { published: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return ok(res, list);
  } catch (err) {
    console.error("merchant guides", err);
    return fail(res, 500, "Could not load guides", "db_error");
  }
});

/** GET /api/merchant/guides/:id */
router.get("/guides/:id", async (req, res) => {
  try {
    const row = await prisma.guide.findFirst({
      where: { id: req.params.id, published: true },
    });
    if (!row) return fail(res, 404, "Guide not found");
    return ok(res, row);
  } catch (err) {
    console.error("merchant guide get", err);
    return fail(res, 500, "Could not load guide", "db_error");
  }
});

export default router;
