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
import {
  ensureBuiltinPlatformPayments,
  listPlatformPayments,
  mapPlatformPayment,
} from "../lib/platform-payments.js";
import { ensureCategoriesSeeded } from "../lib/categories.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

/** GET /api/admin/overview */
router.get("/overview", async (_req, res) => {
  try {
    const [
      shops,
      opened,
      pending,
      closed,
      orders,
      reviews,
      announcements,
      unpublished,
    ] = await Promise.all([
      prisma.shop.count(),
      prisma.shop.count({ where: { status: "approved" } }),
      prisma.shop.count({ where: { status: "pending" } }),
      prisma.shop.count({
        where: { status: { in: ["suspended", "rejected"] } },
      }),
      prisma.order.count(),
      prisma.review.count(),
      prisma.announcement.count(),
      prisma.announcement.count({ where: { published: false } }),
    ]);
    return ok(res, {
      shops,
      opened,
      pending,
      closed,
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

/** Required: name, phone, shopName, address(location), password (Admin sets it). Email optional. */
const createMerchantSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(6),
  shopName: z.string().min(2),
  location: z.string().optional(),
  password: z.string().min(4),
});

/** POST /api/admin/merchants — Admin creates an approved shop + owner */
router.post("/merchants", async (req, res) => {
  try {
    const parsed = createMerchantSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid shop details");

    const phone = normalizePhone(parsed.data.phone);
    const emailRaw = (parsed.data.email || "").trim().toLowerCase();
    const email =
      emailRaw || `${phone.replace(/\D/g, "") || "shop"}@merchant.qrshop.local`;
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
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

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
    const code = err?.code || "";
    const msg = String(err?.message || "");
    if (code === "P2002") {
      return fail(res, 409, "Email, phone, or shop slug already exists", "conflict");
    }
    if (msg.includes("openingHoursJson") || msg.includes("Unknown column")) {
      return fail(
        res,
        500,
        "Database is missing a required column — run prisma db push on the API host",
        "schema_mismatch",
      );
    }
    return fail(res, 500, "Could not create shop", "db_error");
  }
});

const resetPasswordSchema = z.object({
  password: z.string().min(4),
});

/**
 * PATCH /api/admin/merchants/:shopId/password
 * Set / reset the shop owner's login password (Merchant app).
 */
router.patch("/merchants/:shopId/password", async (req, res) => {
  try {
    const shopId = String(req.params.shopId || "").trim();
    if (!shopId) return fail(res, 400, "shopId required");
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Password must be at least 4 characters");

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return fail(res, 404, "Shop not found");

    const owner = await prisma.user.findFirst({
      where: { shopId, role: "merchant" },
      orderBy: { createdAt: "asc" },
    });
    if (!owner) return fail(res, 404, "Shop owner account not found");

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await prisma.user.update({
      where: { id: owner.id },
      data: { passwordHash },
    });

    return ok(res, {
      shopId,
      userId: owner.id,
      email: owner.email,
      phone: owner.phone,
      updated: true,
    });
  } catch (err) {
    console.error("admin reset merchant password", err);
    return fail(res, 500, "Could not reset password", "db_error");
  }
});

const deleteShopSchema = z.object({
  merchantPassword: z.string().min(1),
  adminPassword: z.string().min(1),
});

/**
 * DELETE /api/admin/merchants/:shopId
 * Permanently delete a shop. Requires both:
 * - merchantPassword — shop owner's current Merchant-app login password
 * - adminPassword — signed-in admin's current password
 * Removes the shop, owner/staff users, orders, products, and cascaded shop data.
 */
router.delete("/merchants/:shopId", async (req, res) => {
  try {
    const shopId = String(req.params.shopId || "").trim();
    if (!shopId) return fail(res, 400, "shopId required");

    const parsed = deleteShopSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return fail(res, 400, "Merchant password and admin password are required");
    }

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return fail(res, 404, "Shop not found");

    const owner = await prisma.user.findFirst({
      where: { shopId, role: "merchant" },
      orderBy: { createdAt: "asc" },
    });
    if (!owner) return fail(res, 404, "Shop owner account not found");

    const adminId = String(req.user?.sub || "").trim();
    if (!adminId) return fail(res, 401, "Sign in required", "unauthorized");
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (
      !admin ||
      (admin.role !== "admin" && admin.role !== "super_admin") ||
      admin.active === false
    ) {
      return fail(res, 403, "Admin account required");
    }

    const merchantOk = await bcrypt.compare(
      parsed.data.merchantPassword,
      owner.passwordHash,
    );
    if (!merchantOk) {
      return fail(res, 403, "Merchant password is incorrect", "bad_merchant_password");
    }

    const adminOk = await bcrypt.compare(
      parsed.data.adminPassword,
      admin.passwordHash,
    );
    if (!adminOk) {
      return fail(res, 403, "Admin password is incorrect", "bad_admin_password");
    }

    const shopName = shop.name;
    const ownerIds = (
      await prisma.user.findMany({
        where: { shopId },
        select: { id: true },
      })
    ).map((u) => u.id);

    await prisma.$transaction(async (tx) => {
      /** Orders (and lines) first — Order.shopId / OrderLine.product block shop delete. */
      await tx.order.deleteMany({ where: { shopId } });

      if (ownerIds.length) {
        await tx.guestQr.updateMany({
          where: { createdById: { in: ownerIds } },
          data: { createdById: null },
        });
      }

      await tx.user.deleteMany({ where: { shopId } });
      await tx.shop.delete({ where: { id: shopId } });
    });

    return ok(res, { deleted: true, shopId, shopName });
  } catch (err) {
    console.error("admin delete shop", err);
    return fail(res, 500, "Could not delete shop", "db_error");
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

/**
 * Merchant Modules hub toggles (ShopFeatures).
 * Staff + POS are not offered (platform holds them back) — Purchases retired.
 * Delivery pricing is always on — not a module.
 */
const MODULE_DEFS = [
  { key: "barcodeTrackingEnabled", id: "barcode", label: "Barcode" },
  { key: "memberPointsEnabled", id: "points", label: "Member points" },
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

/* ─── Categories (mall chips) ─── */

function mapCategory(c) {
  return {
    id: c.id,
    name: c.name,
    nameMy: c.nameMy ?? "",
    icon: c.icon ?? "",
    imageUrl: c.imageUrl ?? "",
    sortOrder: c.sortOrder ?? 0,
    active: c.active !== false,
  };
}

router.get("/categories", async (_req, res) => {
  try {
    await ensureCategoriesSeeded();
    const rows = await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return ok(res, rows.map(mapCategory));
  } catch (err) {
    console.error("admin categories", err);
    return fail(res, 500, "Could not load categories", "db_error");
  }
});

router.post("/categories", async (req, res) => {
  try {
    const id = String(req.body.id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 40);
    const name = String(req.body.name || "").trim();
    if (!id || id.length < 2) return fail(res, 400, "Id must be 2+ letters/numbers");
    if (!name) return fail(res, 400, "Name required");
    const existing = await prisma.category.findUnique({ where: { id } });
    if (existing) return fail(res, 409, "Category id already exists");
    const maxSort = await prisma.category.aggregate({ _max: { sortOrder: true } });
    const row = await prisma.category.create({
      data: {
        id,
        name,
        nameMy: String(req.body.nameMy || "").trim() || null,
        icon: String(req.body.icon || "").trim() || null,
        imageUrl: String(req.body.imageUrl || "").trim() || null,
        sortOrder:
          req.body.sortOrder != null
            ? Number(req.body.sortOrder) || 0
            : (maxSort._max.sortOrder ?? 0) + 10,
        active: req.body.active !== false,
      },
    });
    return ok(res, mapCategory(row), { created: true });
  } catch (err) {
    console.error("admin category create", err);
    return fail(res, 500, "Could not create category", "db_error");
  }
});

router.patch("/categories/:id", async (req, res) => {
  try {
    const data = {};
    if (req.body.name != null) data.name = String(req.body.name).trim();
    if (req.body.nameMy != null) data.nameMy = String(req.body.nameMy).trim() || null;
    if (req.body.icon != null) data.icon = String(req.body.icon).trim() || null;
    if (req.body.imageUrl != null) data.imageUrl = String(req.body.imageUrl).trim() || null;
    if (req.body.sortOrder != null) data.sortOrder = Number(req.body.sortOrder) || 0;
    if (typeof req.body.active === "boolean") data.active = req.body.active;
    if (data.name === "") return fail(res, 400, "Name required");
    const row = await prisma.category.update({
      where: { id: req.params.id },
      data,
    });
    return ok(res, mapCategory(row));
  } catch (err) {
    if (err?.code === "P2025") return fail(res, 404, "Category not found");
    return fail(res, 500, "Could not update category", "db_error");
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    const inUse = await prisma.product.count({
      where: { categoryId: req.params.id },
    });
    if (inUse > 0) {
      return fail(
        res,
        400,
        `Category is used by ${inUse} product(s) — turn it Off instead of deleting`,
        "category_in_use",
      );
    }
    await prisma.category.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  } catch (err) {
    if (err?.code === "P2025") return fail(res, 404, "Category not found");
    return fail(res, 500, "Could not delete category", "db_error");
  }
});

/* ─── Mall hero ─── */

function mapHero(h) {
  if (!h) return null;
  return {
    imageUrl: h.imageUrl || "",
    eyebrow: h.eyebrow || "",
    title: h.title || "",
    subtitle: h.subtitle || "",
    cta: h.cta || "Browse",
    href: h.href || "/products",
    updatedAt: h.updatedAt?.toISOString?.() ?? null,
  };
}

router.get("/hero", async (_req, res) => {
  try {
    const row = await prisma.mallHero.findUnique({ where: { id: "default" } });
    if (row) return ok(res, mapHero(row));
    const { defaultHero } = await import("../lib/mall-meta.js");
    return ok(res, { ...defaultHero(), href: "/products" });
  } catch (err) {
    console.error("admin hero", err);
    return fail(res, 500, "Could not load hero", "db_error");
  }
});

router.put("/hero", async (req, res) => {
  try {
    const data = {
      imageUrl: String(req.body.imageUrl || "").trim(),
      eyebrow: String(req.body.eyebrow || "").trim(),
      title: String(req.body.title || "").trim(),
      subtitle: String(req.body.subtitle || "").trim(),
      cta: String(req.body.cta || "Browse").trim() || "Browse",
      href: String(req.body.href || req.body.linkHref || "/products").trim() || "/products",
    };
    if (!data.title) return fail(res, 400, "Title required");
    const row = await prisma.mallHero.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });
    return ok(res, mapHero(row));
  } catch (err) {
    console.error("admin hero put", err);
    return fail(res, 500, "Could not save hero", "db_error");
  }
});

/* ─── Platform payment catalog ─── */

router.get("/payments", async (_req, res) => {
  try {
    return ok(res, await listPlatformPayments());
  } catch (err) {
    console.error("admin payments", err);
    return fail(res, 500, "Could not load payments", "db_error");
  }
});

router.post("/payments", async (req, res) => {
  try {
    await ensureBuiltinPlatformPayments();
    const id = String(req.body.id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 24);
    const label = String(req.body.label || "").trim();
    if (id.length < 2 || id.length > 24) {
      return fail(res, 400, "Id must be 2–24 letters/numbers");
    }
    if (!label) return fail(res, 400, "Display name required");
    const exists = await prisma.platformPaymentMethod.findUnique({ where: { id } });
    if (exists) return fail(res, 409, "Payment id already exists");
    const maxSort = await prisma.platformPaymentMethod.aggregate({
      _max: { sort: true },
    });
    const row = await prisma.platformPaymentMethod.create({
      data: {
        id,
        label,
        shortLabel: String(req.body.shortLabel || label).trim().slice(0, 24),
        subtitle:
          String(req.body.subtitle || "").trim() ||
          "Merchants upload their shop QR when needed",
        needsQr: req.body.needsQr !== false,
        active: true,
        builtin: false,
        sort: (maxSort._max.sort ?? 0) + 10,
      },
    });
    return ok(res, mapPlatformPayment(row), { created: true });
  } catch (err) {
    console.error("admin payment create", err);
    return fail(res, 500, "Could not create payment", "db_error");
  }
});

router.patch("/payments/:id", async (req, res) => {
  try {
    const data = {};
    if (req.body.label != null) data.label = String(req.body.label).trim();
    if (req.body.shortLabel != null)
      data.shortLabel = String(req.body.shortLabel).trim().slice(0, 24);
    if (req.body.subtitle != null) data.subtitle = String(req.body.subtitle).trim();
    if (typeof req.body.needsQr === "boolean") data.needsQr = req.body.needsQr;
    if (typeof req.body.active === "boolean") data.active = req.body.active;
    if (req.body.sort != null) data.sort = Number(req.body.sort) || 0;
    if (data.label === "") return fail(res, 400, "Label required");
    const row = await prisma.platformPaymentMethod.update({
      where: { id: req.params.id },
      data,
    });
    return ok(res, mapPlatformPayment(row));
  } catch (err) {
    if (err?.code === "P2025") return fail(res, 404, "Payment not found");
    return fail(res, 500, "Could not update payment", "db_error");
  }
});

router.delete("/payments/:id", async (req, res) => {
  try {
    const row = await prisma.platformPaymentMethod.findUnique({
      where: { id: req.params.id },
    });
    if (!row) return fail(res, 404, "Payment not found");
    if (row.builtin) {
      return fail(res, 400, "Built-in methods cannot be deleted — turn them Off");
    }
    await prisma.platformPaymentMethod.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  } catch (err) {
    return fail(res, 500, "Could not delete payment", "db_error");
  }
});

export default router;
