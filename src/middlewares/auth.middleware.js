import jwt from "jsonwebtoken";
import { fail } from "../lib/response.js";

export function signToken(payload, options = {}) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return jwt.sign(payload, secret, {
    expiresIn: options.expiresIn || process.env.JWT_EXPIRES_IN || "7d",
  });
}

function readBearer(req) {
  const header = String(req.headers.authorization || "");
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  // EventSource cannot set Authorization — allow query token for SSE
  return String(req.query?.access_token || req.query?.token || "").trim();
}

export function requireAuth(req, res, next) {
  const token = readBearer(req);
  if (!token) return fail(res, 401, "Sign in required", "unauthorized");

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return fail(res, 500, "Server auth not configured");
    const payload = jwt.verify(token, secret);
    if (payload.kind === "guest") {
      return fail(res, 403, "Registered account required", "guest_not_allowed");
    }
    req.user = payload;
    req.authKind = "user";
    return next();
  } catch {
    return fail(res, 401, "Invalid or expired token", "unauthorized");
  }
}

/** Attach req.user when Bearer is a registered user; never 401 (public routes). */
export function optionalAuth(req, _res, next) {
  const token = readBearer(req);
  if (!token) return next();
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return next();
    const payload = jwt.verify(token, secret);
    if (payload.kind !== "guest") {
      req.user = payload;
      req.authKind = "user";
    }
  } catch {
    /* ignore bad token on public catalog */
  }
  return next();
}

/** Registered user OR one-time guest JWT */
export function requireUserOrGuest(req, res, next) {
  const token = readBearer(req);
  if (!token) return fail(res, 401, "Sign in required", "unauthorized");

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return fail(res, 500, "Server auth not configured");
    const payload = jwt.verify(token, secret);
    if (payload.kind === "guest") {
      req.guest = payload;
      req.authKind = "guest";
      return next();
    }
    req.user = payload;
    req.authKind = "user";
    return next();
  } catch {
    return fail(res, 401, "Invalid or expired token", "unauthorized");
  }
}

export function requireGuest(req, res, next) {
  const token = readBearer(req);
  if (!token) return fail(res, 401, "Guest session required", "unauthorized");

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return fail(res, 500, "Server auth not configured");
    const payload = jwt.verify(token, secret);
    if (payload.kind !== "guest") {
      return fail(res, 403, "Guest QR session required", "not_guest");
    }
    req.guest = payload;
    req.authKind = "guest";
    return next();
  } catch {
    return fail(res, 401, "Invalid or expired guest token", "unauthorized");
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 401, "Sign in required", "unauthorized");
    const role = req.user.role;
    // Admin portal: "admin" gate also allows super_admin
    const expanded = roles.includes("admin")
      ? [...new Set([...roles, "super_admin"])]
      : roles;
    if (!expanded.includes(role)) {
      return fail(res, 403, "Not allowed for this role", "forbidden");
    }
    return next();
  };
}
