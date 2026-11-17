/**
 * Saved OTP challenges for Admin “view account without user login”.
 * Codes are hashed; plaintext never stored. TTL 10 minutes.
 */
import crypto from "crypto";
import { prisma } from "./prisma.js";
import { ensureAdminViewOtpTable } from "./ensure-schema.js";
import { otpMailConfigured, otpRecipientEmail, sendOtpEmail } from "./otp-mail.js";

const TTL_MS = 10 * 60 * 1000;
const VIEW_GRANT_MS = 30 * 60 * 1000;
/** In-memory fallback when DB table is unavailable. */
const memory = new Map();
/** After OTP verify — admin may refresh account detail for VIEW_GRANT_MS. */
const viewGrants = new Map();

function grantKey(adminUserId, targetUserId) {
  return `${adminUserId}:${targetUserId}`;
}

export function grantViewAccess(adminUserId, targetUserId) {
  viewGrants.set(grantKey(adminUserId, targetUserId), Date.now() + VIEW_GRANT_MS);
}

export function hasViewAccess(adminUserId, targetUserId) {
  const until = viewGrants.get(grantKey(adminUserId, targetUserId));
  if (!until || until < Date.now()) {
    viewGrants.delete(grantKey(adminUserId, targetUserId));
    return false;
  }
  return true;
}

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function publicAccount(user, extras = {}) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
    email: user.email,
    address: user.address,
    townshipId: user.townshipId,
    active: user.active !== false,
    shopId: user.shopId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...extras,
  };
}

export async function listAccountsForAdmin({ q = "", role } = {}) {
  const where = {
    role: role || { in: ["buyer", "merchant"] },
  };
  const needle = String(q || "").trim();
  if (needle) {
    where.OR = [
      { name: { contains: needle } },
      { phone: { contains: needle } },
      { email: { contains: needle } },
    ];
  }
  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      role: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      townshipId: true,
      active: true,
      shopId: true,
      createdAt: true,
      updatedAt: true,
      shop: { select: { id: true, name: true, status: true } },
      _count: { select: { buyerOrders: true, addresses: true } },
    },
  });
  return rows.map((u) =>
    publicAccount(u, {
      shopName: u.shop?.name || null,
      shopStatus: u.shop?.status || null,
      orderCount: u._count?.buyerOrders ?? 0,
      addressCount: u._count?.addresses ?? 0,
    }),
  );
}

export async function loadAccountDetail(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      shop: { select: { id: true, name: true, status: true, location: true } },
      addresses: { orderBy: { createdAt: "desc" }, take: 20 },
      buyerOrders: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          code: true,
          totalKs: true,
          status: true,
          payment: true,
          createdAt: true,
          shopId: true,
        },
      },
      _count: { select: { buyerOrders: true, addresses: true } },
    },
  });
  if (!user) return null;
  if (user.role !== "buyer" && user.role !== "merchant") return null;
  const { passwordHash: _pw, ...safe } = user;
  return publicAccount(safe, {
    shop: user.shop,
    addresses: user.addresses,
    recentOrders: user.buyerOrders,
    orderCount: user._count?.buyerOrders ?? 0,
    addressCount: user._count?.addresses ?? 0,
  });
}

async function saveChallenge({ adminUserId, targetUserId, codeHash, expiresAt }) {
  try {
    await ensureAdminViewOtpTable();
    await prisma.adminViewOtp.create({
      data: {
        id: crypto.randomBytes(12).toString("hex"),
        adminUserId,
        targetUserId,
        codeHash,
        expiresAt,
      },
    });
    return "db";
  } catch (err) {
    console.warn("admin-view-otp: db save failed, using memory", String(err?.message || err).slice(0, 160));
    const key = `${adminUserId}:${targetUserId}`;
    memory.set(key, { codeHash, expiresAt: expiresAt.getTime(), consumed: false });
    return "memory";
  }
}

async function consumeChallenge({ adminUserId, targetUserId, code }) {
  const codeHash = hashCode(code);
  const now = new Date();
  try {
    await ensureAdminViewOtpTable();
    const row = await prisma.adminViewOtp.findFirst({
      where: {
        adminUserId,
        targetUserId,
        codeHash,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return false;
    await prisma.adminViewOtp.update({
      where: { id: row.id },
      data: { consumedAt: now },
    });
    return true;
  } catch {
    const key = `${adminUserId}:${targetUserId}`;
    const mem = memory.get(key);
    if (!mem || mem.consumed || mem.expiresAt < Date.now()) return false;
    if (mem.codeHash !== codeHash) return false;
    mem.consumed = true;
    memory.set(key, mem);
    return true;
  }
}

/**
 * Issue OTP for admin to view a user account (no user password login).
 * Email is sent from Admin Gmail to OTP_TO_EMAIL (defaults to the Gmail user).
 */
export async function issueViewAccountOtp({ adminUserId, targetUserId }) {
  if (!otpMailConfigured()) {
    const err = new Error(
      "OTP Gmail is not configured — set OTP_GMAIL_USER and OTP_GMAIL_APP_PASSWORD",
    );
    err.code = "otp_not_configured";
    throw err;
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target || (target.role !== "buyer" && target.role !== "merchant")) {
    const err = new Error("Account not found");
    err.code = "not_found";
    throw err;
  }

  const code = makeCode();
  const expiresAt = new Date(Date.now() + TTL_MS);
  const storage = await saveChallenge({
    adminUserId,
    targetUserId,
    codeHash: hashCode(code),
    expiresAt,
  });

  const label = `${target.name} · ${target.phone || target.email || target.id} (${target.role})`;
  const mailed = await sendOtpEmail({
    code,
    purpose: "view account",
    targetLabel: label,
  });

  return {
    sent: true,
    storage,
    to: mailed.to,
    expiresAt: expiresAt.toISOString(),
    target: publicAccount(target),
  };
}

export async function verifyViewAccountOtp({ adminUserId, targetUserId, code }) {
  const ok = await consumeChallenge({
    adminUserId,
    targetUserId,
    code: String(code || "").trim(),
  });
  if (!ok) {
    const err = new Error("Invalid or expired OTP");
    err.code = "otp_invalid";
    throw err;
  }
  const detail = await loadAccountDetail(targetUserId);
  if (!detail) {
    const err = new Error("Account not found");
    err.code = "not_found";
    throw err;
  }
  grantViewAccess(adminUserId, targetUserId);
  return {
    ...detail,
    viewGrantedUntil: new Date(Date.now() + VIEW_GRANT_MS).toISOString(),
  };
}

export function otpStatus() {
  return {
    configured: otpMailConfigured(),
    recipient: otpRecipientEmail() || null,
  };
}
