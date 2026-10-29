/**
 * Marketplace content: platform settings, ads, announcements, public enquiries.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import {
  isVisibleToMerchant,
  publicAnnouncement,
  toDbFields,
} from "../lib/announcement.js";

const router = Router();

const defaultSettings = {
  id: "default",
  homePage: true,
  shopsDirectory: true,
  marketplace: true,
  submissions: true,
  publicEnquiries: true,
};

/** GET /api/mall/settings — Marketplace kill-switches */
router.get("/settings", async (_req, res) => {
  try {
    const row =
      (await prisma.platformSettings.findUnique({ where: { id: "default" } })) ??
      defaultSettings;
    return ok(res, {
      homePage: row.homePage,
      shopsDirectory: row.shopsDirectory,
      marketplace: row.marketplace,
      submissions: row.submissions,
      publicEnquiries: row.publicEnquiries,
      updatedAt: row.updatedAt?.toISOString?.() ?? null,
    });
  } catch (err) {
    console.error("mall settings", err);
    return ok(res, defaultSettings);
  }
});

/** PATCH /api/mall/settings — Admin */
router.patch(
  "/settings",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const data = {};
    for (const key of [
      "homePage",
      "shopsDirectory",
      "marketplace",
      "submissions",
      "publicEnquiries",
    ]) {
      if (typeof req.body[key] === "boolean") data[key] = req.body[key];
    }
    const row = await prisma.platformSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });
    return ok(res, row);
  },
);

/** GET /api/mall/ads — live banners for Marketplace home (active + within schedule) */
router.get("/ads", async (_req, res) => {
  try {
    const now = new Date();
    const ads = await prisma.ad.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return ok(
      res,
      ads.map((a) => ({
        id: a.id,
        title: a.title,
        subtitle: a.subtitle,
        cta: a.cta,
        imageUrl: a.imageUrl,
        linkHref: a.href ?? "/products",
        active: a.active,
        startsAt: a.startsAt ? a.startsAt.toISOString() : null,
        endsAt: a.endsAt ? a.endsAt.toISOString() : null,
        sortOrder: a.sortOrder,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    );
  } catch (err) {
    console.error("mall ads", err);
    return fail(res, 500, "Could not load ads", "db_error");
  }
});

/** POST /api/mall/ads — Admin create */
router.post("/ads", requireAuth, requireRole("admin"), async (req, res) => {
  const title = String(req.body.title || "").trim();
  const imageUrl = String(req.body.imageUrl || "").trim();
  if (!title || !imageUrl) return fail(res, 400, "title and imageUrl required");
  const startsAtRaw = req.body.startsAt;
  const endsAtRaw = req.body.endsAt;
  const startsAt =
    startsAtRaw == null || startsAtRaw === ""
      ? null
      : new Date(String(startsAtRaw));
  const endsAt =
    endsAtRaw == null || endsAtRaw === "" ? null : new Date(String(endsAtRaw));
  if (startsAt && Number.isNaN(startsAt.getTime())) {
    return fail(res, 400, "Invalid startsAt");
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return fail(res, 400, "Invalid endsAt");
  }
  const row = await prisma.ad.create({
    data: {
      title,
      subtitle: String(req.body.subtitle || ""),
      cta: String(req.body.cta || "Shop"),
      imageUrl,
      href: req.body.linkHref || req.body.href || null,
      active: req.body.active !== false,
      startsAt,
      endsAt,
      sortOrder: Number(req.body.sortOrder) || 0,
    },
  });
  return ok(res, row, { created: true });
});

/**
 * GET /api/mall/announcements
 * ?audience=customer (default) — Marketplace home / notifications
 * ?audience=merchant&shopId= — Merchant app feed
 */
router.get("/announcements", async (req, res) => {
  try {
    const audience = String(req.query.audience || "customer").toLowerCase();
    const shopId = String(req.query.shopId || "").trim();

    if (audience === "merchant") {
      const list = await prisma.announcement.findMany({
        where: { published: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return ok(
        res,
        list
          .filter((a) => isVisibleToMerchant(a, shopId))
          .map(publicAnnouncement),
      );
    }

    const list = await prisma.announcement.findMany({
      where: { published: true, sendToCustomers: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(res, list.map(publicAnnouncement));
  } catch (err) {
    console.error("mall announcements", err);
    return fail(res, 500, "Could not load announcements", "db_error");
  }
});

/** POST /api/mall/announcements — thin alias; prefer POST /api/admin/announcements */
router.post(
  "/announcements",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const fields = toDbFields(
        {
          ...req.body,
          authorName: req.body.authorName || req.user.name || "QR Shop Admin",
        },
        { forCreate: true },
      );
      if (!fields.title) return fail(res, 400, "title required");
      const row = await prisma.announcement.create({ data: fields });
      return ok(res, publicAnnouncement(row), { created: true });
    } catch (err) {
      console.error("mall announcement create", err);
      return fail(res, 500, "Could not save announcement", "db_error");
    }
  },
);

const enquirySchema = z.object({
  shopId: z.string().min(1),
  shopName: z.string().optional(),
  buyerName: z.string().min(1),
  buyerContact: z.string().min(3),
  message: z.string().min(1).max(2000),
  productName: z.string().optional(),
});

/** POST /api/mall/enquiries — Marketplace shops directory */
router.post("/enquiries", async (req, res) => {
  try {
    const settings =
      (await prisma.platformSettings.findUnique({ where: { id: "default" } })) ??
      defaultSettings;
    if (settings.publicEnquiries === false) {
      return fail(res, 403, "Public enquiries are disabled");
    }

    const parsed = enquirySchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid enquiry");

    const shop = await prisma.shop.findUnique({
      where: { id: parsed.data.shopId },
    });
    if (!shop || shop.status !== "approved" || !shop.listed) {
      return fail(res, 404, "Shop not found");
    }

    const row = await prisma.enquiry.create({
      data: {
        shopId: shop.id,
        shopName: parsed.data.shopName || shop.name,
        buyerName: parsed.data.buyerName.trim(),
        buyerContact: parsed.data.buyerContact.trim(),
        message: parsed.data.message.trim(),
        productName: parsed.data.productName?.trim() || null,
        status: "new",
      },
    });
    const { publishMessageEvent } = await import("../lib/realtime.js");
    publishMessageEvent(row, "created");
    return ok(res, row, { created: true });
  } catch (err) {
    console.error("mall enquiry", err);
    return fail(res, 500, "Could not send enquiry", "db_error");
  }
});

/** GET /api/mall/enquiries/mine — buyer: own threads by phone */
router.get("/enquiries/mine", requireAuth, requireRole("buyer"), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { phone: true, name: true },
    });
    if (!user?.phone) return ok(res, []);
    const phone = String(user.phone).trim();
    const list = await prisma.enquiry.findMany({
      where: {
        OR: [{ buyerContact: phone }, { buyerContact: { contains: phone.slice(-9) } }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(res, list);
  } catch (err) {
    console.error("mall enquiries mine", err);
    return fail(res, 500, "Could not load messages", "db_error");
  }
});

/** GET /api/mall/enquiries — Admin / Merchant (own shop) */
router.get(
  "/enquiries",
  requireAuth,
  requireRole("admin", "merchant", "staff"),
  async (req, res) => {
    const where = {};
    if (req.user.role === "merchant" || req.user.role === "staff") {
      if (!req.user.shopId) return fail(res, 403, "No shop on account");
      where.shopId = req.user.shopId;
    } else if (req.query.shopId) {
      where.shopId = String(req.query.shopId);
    }
    const list = await prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(res, list);
  },
);

export default router;
