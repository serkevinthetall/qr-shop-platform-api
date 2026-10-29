import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail, requireShopOwner } from "../lib/merchant-auth.js";
import { publishMessageEvent } from "../lib/realtime.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

/** GET /api/merchant/enquiries — inbox for this shop */
router.get("/enquiries", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const status = String(req.query.status || "").trim();
    const list = await prisma.enquiry.findMany({
      where: {
        shopId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(res, list);
  } catch (err) {
    console.error("merchant enquiries list", err);
    return fail(res, 500, "Could not load enquiries", "db_error");
  }
});

const replySchema = z.object({
  reply: z.string().min(1),
  status: z.enum(["new", "replied", "closed"]).optional(),
});

/** PATCH /api/merchant/enquiries/:id — reply (owner) */
router.patch("/enquiries/:id", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!requireShopOwner(req, res)) return;

    const existing = await prisma.enquiry.findFirst({
      where: { id: req.params.id, shopId },
    });
    if (!existing) return fail(res, 404, "Enquiry not found");

    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid reply");

    const row = await prisma.enquiry.update({
      where: { id: existing.id },
      data: {
        reply: parsed.data.reply.trim(),
        replyAt: new Date(),
        status: parsed.data.status || "replied",
      },
    });
    publishMessageEvent(row, "replied");
    return ok(res, row);
  } catch (err) {
    console.error("merchant enquiry reply", err);
    return fail(res, 500, "Could not reply", "db_error");
  }
});

export default router;
