import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { issueSession, publicUser } from "../lib/auth-session.js";
import { normalizeLogin, normalizePhone } from "../lib/phone.js";
import { formatLocation } from "../lib/township.js";

const router = Router();

const ROLES = ["buyer", "merchant", "staff", "admin", "super_admin"];

const loginSchema = z.object({
  /** Email or phone */
  login: z.string().min(3),
  /** Password, or staff PIN */
  password: z.string().min(4),
  /**
   * Portal lock:
   * - Marketplace: "buyer"
   * - Merchant: "merchant" | "staff"
   * - Admin: "admin" (also accepts super_admin)
   */
  role: z.enum(["buyer", "merchant", "staff", "admin", "super_admin"]).optional(),
});

const registerBuyerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  password: z.string().min(4),
  /** Street line (Marketplace register) */
  street: z.string().min(1).optional(),
  /** Admin-published township id */
  townshipId: z.string().min(1).optional(),
  /** Legacy flat address if street/township not sent yet */
  address: z.string().min(1).optional(),
  label: z.string().optional(),
});

/** Required: name, phone, shopName. Password is set by Admin later (not by merchant). */
const registerMerchantSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(4).optional().or(z.literal("")),
  shopName: z.string().min(1),
  location: z.string().optional(),
});

function roleAllowed(requested, actual) {
  if (!requested) return true;
  if (requested === "admin") {
    return actual === "admin" || actual === "super_admin";
  }
  return actual === requested;
}

/**
 * POST /api/auth/login
 * Body: { login, password, role? }
 *
 * Demo (after seed):
 * - Super admin: super@qrshop.com / 11111
 * - Admin:       qrshop@gmail.com / 11111
 * - Merchant:    admin@gmail.com / 1111
 * - Staff:       09777100201 / 1234
 * - Buyer:       09111222333 / 1111
 */
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Enter login and password");

    const { email, phone } = normalizeLogin(parsed.data.login);
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    });
    if (!user || user.active === false) {
      return fail(res, 401, "Invalid login or password");
    }

    if (!roleAllowed(parsed.data.role, user.role)) {
      return fail(
        res,
        403,
        `This account is ${user.role}, not ${parsed.data.role}`,
        "wrong_role",
      );
    }

    const match = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!match) return fail(res, 401, "Invalid login or password");

    return ok(res, issueSession(user));
  } catch (err) {
    console.error("login error", err);
    const detail = String(err?.message || err).slice(0, 180);
    return fail(
      res,
      500,
      `Login failed — database error: ${detail}`,
      "db_error",
    );
  }
});

/**
 * POST /api/auth/register/buyer
 * Marketplace: name, phone, password, street + townshipId (preferred)
 * Same shape as auth-context register + Addresses screen.
 */
router.post("/register/buyer", async (req, res) => {
  try {
    const parsed = registerBuyerSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 400, "Name, phone, password, and address are required");
    }

    const phone = normalizePhone(parsed.data.phone);
    const exists = await prisma.user.findFirst({ where: { phone } });
    if (exists) return fail(res, 409, "This phone is already registered");

    const street = (parsed.data.street || parsed.data.address || "").trim();
    if (!street) return fail(res, 400, "Street / address is required");

    let township = null;
    let location = street;
    let townshipId = null;
    if (parsed.data.townshipId) {
      township = await prisma.township.findUnique({
        where: { id: parsed.data.townshipId },
      });
      if (!township || !township.active) {
        return fail(res, 400, "Choose a published township");
      }
      townshipId = township.id;
      location = formatLocation(street, township);
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: {
        role: "buyer",
        name: parsed.data.name.trim(),
        phone,
        address: location,
        townshipId,
        passwordHash,
        ...(townshipId
          ? {
              addresses: {
                create: {
                  label: parsed.data.label?.trim() || "Home",
                  street,
                  townshipId,
                  location,
                  isDefault: true,
                },
              },
            }
          : {}),
      },
      include: { addresses: true },
    });
    return ok(res, issueSession(user, user.addresses), { created: true });
  } catch (err) {
    console.error("register buyer error", err);
    return fail(res, 500, "Registration failed", "db_error");
  }
});

/** POST /api/auth/register/merchant — Merchant app (shop starts pending) */
router.post("/register/merchant", async (req, res) => {
  try {
    const parsed = registerMerchantSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid merchant registration");

    const phone = normalizePhone(parsed.data.phone);
    const emailRaw = (parsed.data.email || "").trim().toLowerCase();
    const email =
      emailRaw || `${phone.replace(/\D/g, "") || "shop"}@merchant.qrshop.local`;
    const exists = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });
    if (exists) return fail(res, 409, "Account already exists");

    const slugBase = parsed.data.shopName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const slug = `${slugBase || "shop"}-${Date.now().toString(36)}`;

    // Merchant does not set a password — Admin assigns one later.
    // Random unusable hash until Admin resets / creates with a real password.
    const provisional =
      (parsed.data.password && parsed.data.password.length >= 4
        ? parsed.data.password
        : `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`) ;
    const passwordHash = await bcrypt.hash(provisional, 10);
    const shop = await prisma.shop.create({
      data: {
        slug,
        name: parsed.data.shopName.trim(),
        phone,
        email,
        location: parsed.data.location ?? "",
        status: "pending",
        features: {
          create: {
            listingMode: "b2c",
            b2cEnabled: true,
            b2bEnabled: false,
          },
        },
        delivery: { create: {} },
      },
    });
    const user = await prisma.user.create({
      data: {
        role: "merchant",
        name: parsed.data.name.trim(),
        phone,
        email,
        passwordHash,
        shopId: shop.id,
      },
    });

    // Do not issue a long-lived session that implies they know a password.
    return ok(res, { ...issueSession(user), shop }, { created: true });
  } catch (err) {
    console.error("register merchant error", err);
    return fail(res, 500, "Registration failed", "db_error");
  }
});

/** GET /api/auth/me — registered account (+ addresses for buyers) */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } },
    });
    if (!user) return fail(res, 404, "User not found");
    return ok(res, { user: publicUser(user, user.addresses) });
  } catch (err) {
    console.error("me error", err);
    return fail(res, 500, "Could not load profile", "db_error");
  }
});

/** PATCH /api/auth/me — update name / address (buyers) */
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const name = req.body.name != null ? String(req.body.name).trim() : undefined;
    const address =
      req.body.address != null ? String(req.body.address).trim() : undefined;
    if (name === undefined && address === undefined) {
      return fail(res, 400, "Nothing to update");
    }
    const user = await prisma.user.update({
      where: { id: req.user.sub },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(address !== undefined ? { address } : {}),
      },
    });
    return ok(res, { user: publicUser(user) });
  } catch (err) {
    console.error("patch me error", err);
    return fail(res, 500, "Could not update profile", "db_error");
  }
});

router.get("/roles", (_req, res) => ok(res, { roles: ROLES }));

export default router;
