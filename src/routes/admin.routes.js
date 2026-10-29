/**
 * QR Shop Admin portal API — overview, merchants, announcements, ads, guides.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { normalizePhone } from "../lib/phone.js";
import {
  publicAnnouncement,
  toDbFields,
} from "../lib/announcement.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

/** GET /api/admin/overview */
router.get("/overview", async (_req, res) => {
  try {
    const [shops, pending, orders, reviews, announcements, unpublished] =
      await Promise.all([
        prisma.shop.count(),
        prisma.shop.count({ where: { status: "pending" } }),
        prisma.order.count(),
        prisma.review.count(),
        prisma.announcement.count(),
        prisma.announcement.count({ where: { published: false } }),
      ]);
    return ok(res, {
      shops,
      pending,
      orders,
      reviews,
      announcements,
      unpublishedAnnouncements: unpublished,
    });
  } catch (err) {
    console.error("admin overview", err);
    return fail(res, 500, "Could not load overview", "db_error");
  }
});

/** GET /api/admin/merchants — all shops for review */
router.get("/merchants", async (_req, res) => {
  try {
    const shops = await prisma.shop.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        users: {
          where: { role: "merchant" },
          select: { id: true, name: true, email: true, phone: true },
        },
        _count: { select: { products: true, orders: true } },
      },
    });
    return ok(res, shops);
  } catch (err) {
    console.error("admin merchants", err);
    return fail(res, 500, "Could not load merchants", "db_error");
  }
});

const createMerchantSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6),
  shopName: z.string().min(2),
  location: z.string().optional(),
  password: z.string().min(4).optional(),
});

/** POST /api/admin/merchants — Admin creates an approved shop + owner */
router.post("/merchants", async (req, res) => {
  try {
    const parsed = createMerchantSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid shop details");

    const email = parsed.data.email.trim().toLowerCase();
    const phone = normalizePhone(parsed.data.phone);
    const exists = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });
    if (exists) return fail(res, 409, "Email or phone already registered");

    const slugBase = parsed.data.shopName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const slug = `${slugBase || "shop"}-${Date.now().toString(36)}`;
    const passwordHash = await bcrypt.hash(parsed.data.password || "1111", 10);

    const shop = await prisma.shop.create({
      data: {
        slug,
        name: parsed.data.shopName.trim(),
        phone,
        email,
        location: parsed.data.location?.trim() || "Online",
        status: "approved",
        listed: true,
        features: {
          create: {
            listingMode: "b2c",
            b2cEnabled: true,
            b2bEnabled: false,
          },
        },
        delivery: { create: {} },
        users: {
          create: {
            role: "merchant",
            name: parsed.data.name.trim(),
            phone,
            email,
            passwordHash,
          },
        },
      },
      include: {
        users: {
          where: { role: "merchant" },
          select: { id: true, name: true, email: true, phone: true },
        },
        _count: { select: { products: true, orders: true } },
      },
    });

    return ok(res, shop, { created: true });
  } catch (err) {
    console.error("admin create merchant", err);
    return fail(res, 500, "Could not create shop", "db_error");
  }
});

/* ─── Announcements (Admin → Marketplace / Merchant) ─── */

const announcementBody = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  body: z.string().default(""),
  sendToCustomers: z.boolean().optional(),
  merchantScope: z.enum(["all", "selected", "none"]).optional(),
  merchantIds: z.array(z.string()).optional(),
  published: z.boolean().optional(),
  authorName: z.string().optional(),
});

/** GET /api/admin/announcements — full list for Admin UI */
router.get("/announcements", async (_req, res) => {
  try {
    const rows = await prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(res, rows.map(publicAnnouncement));
  } catch (err) {
    console.error("admin announcements list", err);
    return fail(res, 500, "Could not load announcements", "db_error");
  }
});

/** GET /api/admin/announcements/:id */
router.get("/announcements/:id", async (req, res) => {
  try {
    const row = await prisma.announcement.findUnique({
      where: { id: req.params.id },
    });
    if (!row) return fail(res, 404, "Announcement not found");
    return ok(res, publicAnnouncement(row));
  } catch (err) {
    console.error("admin announcement get", err);
    return fail(res, 500, "Could not load announcement", "db_error");
  }
});

/**
 * POST /api/admin/announcements — create (or upsert if id provided)
 * Body matches Admin Draft / PlatformAnnouncement.
 */
router.post("/announcements", async (req, res) => {
  try {
    const parsed = announcementBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid announcement");

    const b = parsed.data;
    const authorName =
      b.authorName?.trim() ||
      req.user.name ||
      "QR Shop Admin";
    const fields = toDbFields(
      { ...b, authorName },
      { forCreate: true },
    );
    if (!fields.title) return fail(res, 400, "title required");

    if (b.id) {
      const row = await prisma.announcement.upsert({
        where: { id: b.id },
        create: { id: b.id, ...fields, authorName },
        update: { ...fields, authorName },
      });
      return ok(res, publicAnnouncement(row), { created: true });
    }

    const row = await prisma.announcement.create({
      data: { ...fields, authorName },
    });
    return ok(res, publicAnnouncement(row), { created: true });
  } catch (err) {
    console.error("admin announcement create", err);
    return fail(res, 500, "Could not save announcement", "db_error");
  }
});

/** PUT /api/admin/announcements/:id — full update */
router.put("/announcements/:id", async (req, res) => {
  try {
    const existing = await prisma.announcement.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return fail(res, 404, "Announcement not found");

    let existingIds = [];
    try {
      existingIds = JSON.parse(existing.merchantIdsJson || "[]");
    } catch {
      existingIds = [];
    }

    const fields = toDbFields({
      title: req.body.title ?? existing.title,
      body: req.body.body ?? existing.body,
      sendToCustomers:
        req.body.sendToCustomers != null
          ? req.body.sendToCustomers
          : existing.sendToCustomers,
      merchantScope: req.body.merchantScope ?? existing.merchantScope,
      merchantIds: req.body.merchantIds ?? existingIds,
      published:
        req.body.published != null ? req.body.published : existing.published,
      authorName: req.body.authorName ?? existing.authorName,
    });
    if (!fields.title) return fail(res, 400, "title required");

    const row = await prisma.announcement.update({
      where: { id: existing.id },
      data: fields,
    });
    return ok(res, publicAnnouncement(row));
  } catch (err) {
    console.error("admin announcement update", err);
    return fail(res, 500, "Could not update announcement", "db_error");
  }
});

/** PATCH /api/admin/announcements/:id/publish — toggle published */
router.patch("/announcements/:id/publish", async (req, res) => {
  try {
    const existing = await prisma.announcement.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return fail(res, 404, "Announcement not found");
    const published =
      typeof req.body.published === "boolean"
        ? req.body.published
        : !existing.published;
    const row = await prisma.announcement.update({
      where: { id: existing.id },
      data: { published },
    });
    return ok(res, publicAnnouncement(row));
  } catch (err) {
    console.error("admin announcement publish", err);
    return fail(res, 500, "Could not update publish state", "db_error");
  }
});

/** DELETE /api/admin/announcements/:id */
router.delete("/announcements/:id", async (req, res) => {
  try {
    await prisma.announcement.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true, id: req.params.id });
  } catch (err) {
    if (err?.code === "P2025") return fail(res, 404, "Announcement not found");
    console.error("admin announcement delete", err);
    return fail(res, 500, "Could not delete announcement", "db_error");
  }
});

/* ─── Ads (Admin mall banners) ─── */

function mapAdRow(a) {
  return {
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
  };
}

function parseOptionalDate(value) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

router.get("/ads", async (_req, res) => {
  try {
    const ads = await prisma.ad.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return ok(res, ads.map(mapAdRow));
  } catch (err) {
    console.error("admin ads", err);
    return fail(res, 500, "Could not load ads", "db_error");
  }
});

router.post("/ads", async (req, res) => {
  const title = String(req.body.title || "").trim();
  const imageUrl = String(req.body.imageUrl || "").trim();
  if (!title || !imageUrl) return fail(res, 400, "title and imageUrl required");
  const startsAt = parseOptionalDate(req.body.startsAt);
  const endsAt = parseOptionalDate(req.body.endsAt);
  if (startsAt === undefined || endsAt === undefined) {
    return fail(res, 400, "Invalid startsAt or endsAt");
  }
  const row = await prisma.ad.create({
    data: {
      title,
      subtitle: String(req.body.subtitle || ""),
      cta: String(req.body.cta || "Shop"),
      imageUrl,
      href: req.body.linkHref || req.body.href || null,
      active: req.body.active !== false,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
      sortOrder: Number(req.body.sortOrder) || 0,
    },
  });
  return ok(res, mapAdRow(row), { created: true });
});

router.patch("/ads/:id", async (req, res) => {
  try {
    const data = {};
    if (req.body.title != null) data.title = String(req.body.title).trim();
    if (req.body.subtitle != null) data.subtitle = String(req.body.subtitle);
    if (req.body.cta != null) data.cta = String(req.body.cta);
    if (req.body.imageUrl != null) data.imageUrl = String(req.body.imageUrl).trim();
    if (req.body.linkHref != null || req.body.href != null) {
      data.href = req.body.linkHref || req.body.href || null;
    }
    if (typeof req.body.active === "boolean") data.active = req.body.active;
    if (req.body.sortOrder != null) data.sortOrder = Number(req.body.sortOrder) || 0;
    if ("startsAt" in req.body) {
      const startsAt = parseOptionalDate(req.body.startsAt);
      if (startsAt === undefined) return fail(res, 400, "Invalid startsAt");
      data.startsAt = startsAt;
    }
    if ("endsAt" in req.body) {
      const endsAt = parseOptionalDate(req.body.endsAt);
      if (endsAt === undefined) return fail(res, 400, "Invalid endsAt");
      data.endsAt = endsAt;
    }
    const row = await prisma.ad.update({ where: { id: req.params.id }, data });
    return ok(res, mapAdRow(row));
  } catch (err) {
    if (err?.code === "P2025") return fail(res, 404, "Ad not found");
    return fail(res, 500, "Could not update ad", "db_error");
  }
});

router.delete("/ads/:id", async (req, res) => {
  try {
    await prisma.ad.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  } catch (err) {
    if (err?.code === "P2025") return fail(res, 404, "Ad not found");
    return fail(res, 500, "Could not delete ad", "db_error");
  }
});

/* ─── Guides ─── */

router.get("/guides", async (_req, res) => {
  return ok(res, await prisma.guide.findMany({ orderBy: { updatedAt: "desc" } }));
});

router.post("/guides", async (req, res) => {
  const title = String(req.body.title || "").trim();
  const body = String(req.body.body || "");
  if (!title) return fail(res, 400, "title required");
  const row = await prisma.guide.create({
    data: { title, body, published: Boolean(req.body.published) },
  });
  return ok(res, row, { created: true });
});

router.patch("/guides/:id", async (req, res) => {
  try {
    const data = {};
    if (req.body.title != null) data.title = String(req.body.title).trim();
    if (req.body.body != null) data.body = String(req.body.body);
    if (typeof req.body.published === "boolean") data.published = req.body.published;
    const row = await prisma.guide.update({ where: { id: req.params.id }, data });
    return ok(res, row);
  } catch (err) {
    if (err?.code === "P2025") return fail(res, 404, "Guide not found");
    return fail(res, 500, "Could not update guide", "db_error");
  }
});

router.delete("/guides/:id", async (req, res) => {
  try {
    await prisma.guide.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true, id: req.params.id });
  } catch (err) {
    if (err?.code === "P2025") return fail(res, 404, "Guide not found");
    return fail(res, 500, "Could not delete guide", "db_error");
  }
});

/** Merchant Modules hub toggles (ShopFeatures) — same set as Merchant → Modules. */
const MODULE_DEFS = [
  { key: "purchasesEnabled", id: "purchases", label: "Purchases" },
  { key: "staffEnabled", id: "staff", label: "Staff" },
  { key: "deliveryModuleEnabled", id: "delivery", label: "Delivery" },
  { key: "posEnabled", id: "pos", label: "POS" },
  { key: "barcodeTrackingEnabled", id: "barcode", label: "Barcode" },
  { key: "memberPointsEnabled", id: "points", label: "Member points" },
  { key: "ratingsReviewsEnabled", id: "reviews", label: "Ratings & reviews" },
  { key: "couponCodesEnabled", id: "coupons", label: "Coupon codes" },
  { key: "bogoEnabled", id: "bogo", label: "Buy 1 Get 1" },
];

/**
 * GET /api/admin/modules
 * How many shops have each Merchant module On vs Off.
 */
router.get("/modules", async (_req, res) => {
  try {
    const shops = await prisma.shop.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        features: true,
      },
      orderBy: { name: "asc" },
    });

    const shopCount = shops.length;
    const modules = MODULE_DEFS.map((def) => {
      const onShops = [];
      const offShops = [];
      for (const shop of shops) {
        const on = Boolean(shop.features?.[def.key]);
        const row = { id: shop.id, name: shop.name, status: shop.status };
        if (on) onShops.push(row);
        else offShops.push(row);
      }
      return {
        id: def.id,
        key: def.key,
        label: def.label,
        on: onShops.length,
        off: offShops.length,
        onShops,
        offShops,
      };
    });

    const shopRows = shops.map((shop) => {
      const flags = {};
      for (const def of MODULE_DEFS) {
        flags[def.id] = Boolean(shop.features?.[def.key]);
      }
      return {
        id: shop.id,
        name: shop.name,
        status: shop.status,
        modules: flags,
        modulesOn: Object.values(flags).filter(Boolean).length,
      };
    });

    return ok(res, { shopCount, modules, shops: shopRows });
  } catch (err) {
    console.error("admin modules", err);
    return fail(res, 500, "Could not load modules", "db_error");
  }
});

/**
 * GET /api/admin/products
 * All shops’ SKUs with view counts + units/revenue sold (non-cancelled orders).
 * Optional ?shopId= · ?q=
 */
router.get("/products", async (req, res) => {
  try {
    const shopId = String(req.query.shopId || "").trim();
    const q = String(req.query.q || "").trim().toLowerCase();

    const products = await prisma.product.findMany({
      where: shopId ? { shopId } : undefined,
      include: {
        shop: { select: { id: true, name: true, status: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 2000,
    });

    const sales = await prisma.orderLine.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        order: {
          stage: { not: "cancelled" },
          ...(shopId ? { shopId } : {}),
        },
      },
      _sum: { qty: true, lineTotalKs: true },
    });

    const salesMap = new Map(
      sales
        .filter((s) => s.productId)
        .map((s) => [
          s.productId,
          {
            soldQty: s._sum.qty || 0,
            soldKs: s._sum.lineTotalKs || 0,
          },
        ]),
    );

    let rows = products.map((p) => {
      const sold = salesMap.get(p.id) || { soldQty: 0, soldKs: 0 };
      const viewsWebsite = p.viewsWebsite || 0;
      const viewsApp = p.viewsApp || 0;
      const viewsQr = p.viewsQr || 0;
      return {
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrl || null,
        priceKs: p.priceKs,
        stock: p.stock,
        active: p.active,
        barcode: p.barcode || null,
        shopId: p.shopId,
        shopName: p.shop?.name || p.shopId,
        shopStatus: p.shop?.status || null,
        viewsWebsite,
        viewsApp,
        viewsQr,
        viewsTotal: viewsWebsite + viewsApp + viewsQr,
        soldQty: sold.soldQty,
        soldKs: sold.soldKs,
        updatedAt: p.updatedAt.toISOString(),
        createdAt: p.createdAt.toISOString(),
      };
    });

    if (q) {
      rows = rows.filter((r) =>
        [r.name, r.shopName, r.barcode || "", r.id]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    rows.sort((a, b) => b.soldKs - a.soldKs || b.viewsTotal - a.viewsTotal);

    return ok(res, rows);
  } catch (err) {
    console.error("admin products", err);
    return fail(res, 500, "Could not load products", "db_error");
  }
});

export default router;
