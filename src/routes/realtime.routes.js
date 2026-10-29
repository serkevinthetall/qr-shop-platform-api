/**
 * GET /api/realtime/stream — Server-Sent Events for orders + messages
 * Auth: Authorization Bearer OR ?access_token=
 */
import { Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { fail } from "../lib/response.js";
import { normalizePhone } from "../lib/phone.js";
import { subscribe } from "../lib/realtime.js";

const router = Router();

function readToken(req) {
  const header = String(req.headers.authorization || "");
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return String(req.query.access_token || req.query.token || "").trim();
}

router.get("/stream", async (req, res) => {
  const token = readToken(req);
  if (!token) return fail(res, 401, "Sign in required", "unauthorized");

  let payload;
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return fail(res, 500, "Server auth not configured");
    payload = jwt.verify(token, secret);
  } catch {
    return fail(res, 401, "Invalid or expired token", "unauthorized");
  }

  const topics = [];

  try {
    if (payload.kind === "guest") {
      if (payload.shopId) topics.push(`shop:${payload.shopId}`);
      if (payload.phone) topics.push(`phone:${normalizePhone(payload.phone)}`);
    } else {
      if (payload.shopId) topics.push(`shop:${payload.shopId}`);
      if (payload.sub) topics.push(`user:${payload.sub}`);
      if (payload.role === "admin" || payload.role === "super_admin") {
        topics.push("admin:portal");
        topics.push("admin:chat");
      }
      if (
        (payload.role === "buyer" || payload.role === "merchant" || payload.role === "staff") &&
        payload.sub
      ) {
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { phone: true, shopId: true },
        });
        if (user?.phone) topics.push(`phone:${normalizePhone(user.phone)}`);
        if (!payload.shopId && user?.shopId) topics.push(`shop:${user.shopId}`);
      }
    }
  } catch (err) {
    console.error("realtime topics", err);
    return fail(res, 500, "Could not open realtime", "db_error");
  }

  if (topics.length === 0) {
    return fail(res, 403, "No realtime topics for this account");
  }

  subscribe(res, topics, req);
});

export default router;
