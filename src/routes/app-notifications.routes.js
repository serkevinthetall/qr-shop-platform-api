/**
 * QR App buyer push token + notification inbox (Platform — not Odoo).
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { ensureBuyerNotifyTables } from "../lib/ensure-schema.js";
import { sendBuyerTestPush } from "../lib/buyer-notify.js";

const router = Router();
router.use(requireAuth, requireRole("buyer"));

function userIdOf(req) {
  return String(req.user?.sub || req.user?.id || "").trim();
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapRow(r) {
  let data = {};
  try {
    data = r.dataJson ? JSON.parse(r.dataJson) : {};
  } catch {
    data = {};
  }
  const kind = String(r.kind || "");
  const when =
    r.createdAt instanceof Date
      ? r.createdAt.toISOString()
      : String(r.createdAt || "");
  if (kind === "message") {
    return {
      id: r.id,
      type: "message",
      title: r.title || undefined,
      body: r.body || undefined,
      thread_id: data.threadId || undefined,
      shop_id: data.shopId || undefined,
      date: when,
      create_date: when,
    };
  }
  if (kind === "order") {
    return {
      id: r.id,
      type: "order",
      title: r.title || undefined,
      body: r.body || undefined,
      order_id: data.orderId || undefined,
      order_code: data.orderCode || undefined,
      date: when,
      create_date: when,
    };
  }
  return {
    id: r.id,
    type: kind === "coupon" ? "coupon" : "product",
    product_id: r.productId || undefined,
    product_name: r.productName || undefined,
    ribbon_name: r.ribbonName || undefined,
    coupon_code: r.couponCode || undefined,
    amount: r.amount == null ? undefined : Number(r.amount),
    date: when,
    create_date: when,
  };
}

/** GET /api/app/notifications — inbox for in-app list + polling */
router.get("/", async (req, res) => {
  try {
    await ensureBuyerNotifyTables();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 40));
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT id, kind, title, body, titleMy, bodyMy, productId, productName, ribbonName,
             couponCode, amount, dataJson, createdAt
      FROM BuyerNotification
      ORDER BY createdAt DESC
      LIMIT ${limit}
      `,
    );
    return ok(res, {
      notifications: (rows || []).map(mapRow),
      success: true,
    });
  } catch (err) {
    console.error("app notifications list", err);
    return fail(res, 500, "Could not load notifications", "db_error");
  }
});

/** POST /api/app/notifications/register-token */
router.post("/register-token", async (req, res) => {
  try {
    const userId = userIdOf(req);
    if (!userId) return fail(res, 401, "Unauthorized");
    await ensureBuyerNotifyTables();

    const expoPushToken = String(
      req.body?.expo_push_token || req.body?.token || "",
    ).trim();
    const language = String(req.body?.language || "my").trim().slice(0, 8) || "my";
    const platform = String(req.body?.platform || "").slice(0, 32) || null;

    if (!expoPushToken.startsWith("ExponentPushToken")) {
      return fail(res, 400, "Invalid Expo push token");
    }

    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM DevicePushToken WHERE token = ? OR userId = ? LIMIT 1`,
      expoPushToken,
      userId,
    );
    const row = Array.isArray(existing) ? existing[0] : null;
    if (row?.id) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE DevicePushToken
        SET userId = ?, token = ?, platform = ?, language = ?, updatedAt = NOW(3)
        WHERE id = ?
        `,
        userId,
        expoPushToken,
        platform,
        language,
        row.id,
      );
      return ok(res, { id: row.id, updated: true, success: true });
    }

    const id = newId("dpt");
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO DevicePushToken
        (id, userId, token, platform, language, notifyOrders, notifyMessages, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 1, 1, NOW(3), NOW(3))
      `,
      id,
      userId,
      expoPushToken,
      platform,
      language,
    );
    return ok(res, { id, created: true, success: true });
  } catch (err) {
    console.error("app register-token", err);
    return fail(res, 500, "Could not save push token", "db_error");
  }
});

/** DELETE /api/app/notifications/register-token */
router.delete("/register-token", async (req, res) => {
  try {
    const userId = userIdOf(req);
    if (!userId) return fail(res, 401, "Unauthorized");
    await ensureBuyerNotifyTables();
    const expoPushToken = String(
      req.body?.expo_push_token || req.query?.expo_push_token || "",
    ).trim();
    if (expoPushToken) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM DevicePushToken WHERE token = ? AND userId = ?`,
        expoPushToken,
        userId,
      );
    } else {
      await prisma.$executeRawUnsafe(
        `DELETE FROM DevicePushToken WHERE userId = ?`,
        userId,
      );
    }
    return ok(res, { cleared: true, success: true });
  } catch (err) {
    console.error("app unregister-token", err);
    return fail(res, 500, "Could not remove push token", "db_error");
  }
});

/** GET /api/app/notifications/push-status */
router.get("/push-status", async (req, res) => {
  try {
    const userId = userIdOf(req);
    if (!userId) return fail(res, 401, "Unauthorized");
    await ensureBuyerNotifyTables();
    const rows = await prisma.$queryRawUnsafe(
      `SELECT token FROM DevicePushToken WHERE userId = ?`,
      userId,
    );
    const token = rows?.[0]?.token || null;
    return ok(res, {
      registered: Boolean(token),
      partner_id: 0,
      token_count: rows?.length || 0,
      token_preview: token ? `${String(token).slice(0, 28)}…` : null,
      success: true,
    });
  } catch (err) {
    console.error("app push-status", err);
    return fail(res, 500, "Could not load push status", "db_error");
  }
});

/** POST /api/app/notifications/test-push */
router.post("/test-push", async (req, res) => {
  try {
    const userId = userIdOf(req);
    if (!userId) return fail(res, 401, "Unauthorized");
    const result = await sendBuyerTestPush(userId);
    if (!result.ok) {
      return fail(res, 400, result.error || "Test push failed");
    }
    return ok(res, { message: "Test push sent", success: true, ...result });
  } catch (err) {
    console.error("app test-push", err);
    return fail(res, 500, "Could not send test push", "db_error");
  }
});

export default router;
