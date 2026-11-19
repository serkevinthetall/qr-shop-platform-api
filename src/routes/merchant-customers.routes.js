/**
 * Merchant customers — one-time vs registered; wholesale for registered only.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { normalizePhone } from "../lib/phone.js";
import {
  findRegisteredBuyerByEmail,
  isRegisteredBuyer,
  listCustomers,
} from "../lib/shop-customers.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

function shopIdOrFail(req, res) {
  if (!req.user.shopId) {
    fail(res, 403, "No shop on account");
    return null;
  }
  return req.user.shopId;
}

function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** GET /api/merchant/customers?type=&from=&to= */
router.get("/customers", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  try {
    const type = String(req.query.type || "all");
    const rows = await listCustomers({
      shopId,
      type: ["one_time", "registered", "all"].includes(type) ? type : "all",
      from: parseDate(req.query.from),
      to: parseDate(req.query.to),
    });
    return ok(res, rows);
  } catch (err) {
    console.error("merchant customers", err);
    return fail(res, 500, "Could not load customers", "db_error");
  }
});

/** GET /api/merchant/customers/lookup?email= */
router.get("/customers/lookup", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const email = String(req.query.email || "").trim();
  if (!email.includes("@")) {
    return fail(res, 400, "Email required");
  }
  const user = await findRegisteredBuyerByEmail(email);
  if (!user) {
    return fail(res, 404, "No registered QR App user with that email");
  }
  if (!normalizePhone(user.phone)) {
    return fail(res, 400, "That App user has no phone on file");
  }
  const access = await prisma.guestPhoneAccess.findUnique({
    where: {
      shopId_phone: { shopId, phone: normalizePhone(user.phone) },
    },
  });
  return ok(res, {
    buyerId: user.id,
    name: user.name,
    email: user.email,
    phone: normalizePhone(user.phone),
    type: "registered",
    alreadyAdded: Boolean(access),
    wholesaleAllowed: Boolean(access?.b2bAllowed),
  });
});

const addSchema = z.object({
  email: z.string().email(),
  wholesaleAllowed: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

/** POST /api/merchant/customers — add registered App user by email */
router.post("/customers", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Valid email required");

  const user = await findRegisteredBuyerByEmail(parsed.data.email);
  if (!user) {
    return fail(res, 404, "No registered QR App user with that email");
  }
  const phone = normalizePhone(user.phone);
  if (!phone) {
    return fail(res, 400, "That App user has no phone on file");
  }

  const wholesaleAllowed = Boolean(parsed.data.wholesaleAllowed);
  const row = await prisma.guestPhoneAccess.upsert({
    where: { shopId_phone: { shopId, phone } },
    create: {
      shopId,
      phone,
      b2bAllowed: wholesaleAllowed,
      note: parsed.data.note,
    },
    update: {
      ...(parsed.data.wholesaleAllowed !== undefined
        ? { b2bAllowed: wholesaleAllowed }
        : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
  });

  return ok(
    res,
    {
      phone: row.phone,
      name: user.name,
      email: user.email,
      buyerId: user.id,
      type: "registered",
      wholesaleAllowed: row.b2bAllowed,
      note: row.note,
      orderCount: 0,
      totalSpentKs: 0,
      lastOrderAt: row.updatedAt,
      shopId,
      source: "added",
    },
    { created: true },
  );
});

const wholesaleSchema = z.object({
  wholesaleAllowed: z.boolean(),
});

/**
 * PATCH /api/merchant/customers/:phone/wholesale
 * Registered buyers only.
 */
router.patch("/customers/:phone/wholesale", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const parsed = wholesaleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "wholesaleAllowed required");

  const phone = normalizePhone(req.params.phone);
  if (!phone) return fail(res, 400, "phone required");

  const buyer = await prisma.user.findFirst({
    where: { role: "buyer", phone },
  });
  if (!isRegisteredBuyer(buyer)) {
    return fail(
      res,
      400,
      "Wholesale can only be set for registered QR App customers",
    );
  }

  const row = await prisma.guestPhoneAccess.upsert({
    where: { shopId_phone: { shopId, phone } },
    create: {
      shopId,
      phone,
      b2bAllowed: parsed.data.wholesaleAllowed,
    },
    update: { b2bAllowed: parsed.data.wholesaleAllowed },
  });

  return ok(res, {
    phone: row.phone,
    type: "registered",
    wholesaleAllowed: row.b2bAllowed,
    buyerId: buyer.id,
    name: buyer.name,
    email: buyer.email,
  });
});

const noteSchema = z.object({
  note: z.string().max(500),
});

/** PATCH /api/merchant/customers/:phone/note */
router.patch("/customers/:phone/note", async (req, res) => {
  const shopId = shopIdOrFail(req, res);
  if (!shopId) return;
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "note required");
  const phone = normalizePhone(req.params.phone);
  if (!phone) return fail(res, 400, "phone required");

  const note = parsed.data.note.trim() || null;
  const row = await prisma.guestPhoneAccess.upsert({
    where: { shopId_phone: { shopId, phone } },
    create: { shopId, phone, b2bAllowed: false, note },
    update: { note },
  });
  return ok(res, { phone: row.phone, note: row.note });
});

export default router;
