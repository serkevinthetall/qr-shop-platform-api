import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

const upsertSchema = z.object({
  shopId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(500).optional(),
  buyerName: z.string().min(1),
  buyerPhone: z.string().min(6),
});

/** GET /api/reviews?productId= | shopId= */
router.get("/", async (req, res) => {
  const where = {};
  if (req.query.productId) where.productId = String(req.query.productId);
  if (req.query.shopId) where.shopId = String(req.query.shopId);

  const reviews = await prisma.review.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok(res, reviews);
});

/** POST /api/reviews — Marketplace / Shop View (requires shop ratings On) */
router.post("/", requireAuth, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Invalid review");

  const b = parsed.data;
  const features = await prisma.shopFeatures.findUnique({
    where: { shopId: b.shopId },
  });
  if (!features?.ratingsReviewsEnabled) {
    return fail(res, 403, "This shop has ratings turned Off");
  }

  const phone = b.buyerPhone.replace(/\s+/g, "");
  const review = await prisma.review.upsert({
    where: {
      productId_buyerPhone: { productId: b.productId, buyerPhone: phone },
    },
    create: {
      shopId: b.shopId,
      productId: b.productId,
      buyerId: req.user.role === "buyer" ? req.user.sub : null,
      buyerName: b.buyerName,
      buyerPhone: phone,
      rating: b.rating,
      body: (b.body ?? "").trim(),
    },
    update: {
      rating: b.rating,
      body: (b.body ?? "").trim(),
      buyerName: b.buyerName,
    },
  });
  return ok(res, review);
});

/** DELETE /api/reviews/:id — Admin moderate */
router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    await prisma.review.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  },
);

export default router;
