/**
 * Merchant push token + notification inbox.
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail } from "../lib/merchant-auth.js";
import { ensureMerchantNotifyTables } from "../lib/ensure-schema.js";
import { sendMerchantTestPush } from "../lib/merchant-notify.js";

const router = Router();
router.use(requireAuth, requireRole("merchant", "staff"));

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function userIdOf(req) {
  return String(req.user?.sub || req.user?.id || "").trim();
}

/** PUT /api/merchant/push-token — register / update Expo token + prefs */
router.put("/push-token", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    await ensureMerchantNotifyTables();

    const token = String(req.body?.token || "").trim();
    const clear = req.body?.clear === true || req.body?.enabled === false;
    const userId = String(req.user?.sub || req.user?.id || "").trim();
    if (!userId) return fail(res, 401, "Unauthorized");

    if (clear || !token) {
      if (token) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM DevicePushToken WHERE token = ? OR userId = ?`,
          token,
          userId,
        );
      } else {
        await prisma.$executeRawUnsafe(
          `DELETE FROM DevicePushToken WHERE userId = ?`,
          userId,
        );
      }
      return ok(res, { cleared: true });
    }

    if (!token.startsWith("ExponentPushToken")) {
      return fail(res, 400, "Invalid Expo push token");
    }

    const platform = String(req.body?.platform || "").slice(0, 32) || null;
    const notifyOrders =
      req.body?.notifyOrders === false || req.body?.notifyOrders === 0 ? 0 : 1;
    const notifyMessages =
      req.body?.notifyMessages === false || req.body?.notifyMessages === 0
        ? 0
        : 1;

    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM DevicePushToken WHERE token = ? OR userId = ? LIMIT 1`,
      token,
      userId,
    );
    const row = Array.isArray(existing) ? existing[0] : null;
    if (row?.id) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE DevicePushToken
        SET userId = ?, token = ?, platform = ?, notifyOrders = ?, notifyMessages = ?, updatedAt = NOW(3)
        WHERE id = ?
        `,
        userId,
        token,
        platform,
        notifyOrders,
        notifyMessages,
        row.id,
      );
      return ok(res, { id: row.id, updated: true });
    }

    const id = newId("dpt");
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO DevicePushToken
        (id, userId, token, platform, notifyOrders, notifyMessages, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
      `,
      id,
      userId,
      token,
      platform,
      notifyOrders,
      notifyMessages,
    );
    return ok(res, { id, created: true });
  } catch (err) {
    console.error("push-token", err);
    return fail(res, 500, "Could not save push token", "db_error");
  }
});

/** GET /api/merchant/push-status — is an Expo token saved for this login? */
router.get("/push-status", async (req, res) => {
  try {
    const userId = userIdOf(req);
    if (!userId) return fail(res, 401, "Unauthorized");
    await ensureMerchantNotifyTables();
    const rows = await prisma.$queryRawUnsafe(
      `SELECT token, platform, notifyOrders, notifyMessages, updatedAt FROM DevicePushToken WHERE userId = ?`,
      userId,
    );
    const token = rows?.[0]?.token || null;
    return ok(res, {
      registered: Boolean(token),
      tokenCount: rows?.length || 0,
      tokenPreview: token ? `${String(token).slice(0, 28)}…` : null,
      platform: rows?.[0]?.platform || null,
      updatedAt: rows?.[0]?.updatedAt || null,
    });
  } catch (err) {
    console.error("merchant push-status", err);
    return fail(res, 500, "Could not load push status", "db_error");
  }
});

/** POST /api/merchant/notifications/test-push — closed-app banner smoke test */
router.post("/notifications/test-push", async (req, res) => {
  try {
    const userId = userIdOf(req);
    if (!userId) return fail(res, 401, "Unauthorized");
    const result = await sendMerchantTestPush(userId);
    if (!result.ok) {
      return fail(res, 400, result.error || "Test push failed");
    }
    return ok(res, { message: "Test push sent", ...result });
  } catch (err) {
    console.error("merchant test-push", err);
    return fail(res, 500, "Could not send test push", "db_error");
  }
});

/** GET /api/merchant/notifications */
router.get("/notifications", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    await ensureMerchantNotifyTables();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT id, shopId, kind, title, body, titleMy, bodyMy, dataJson, readAt, createdAt
      FROM MerchantNotification
      WHERE shopId = ?
      ORDER BY createdAt DESC
      LIMIT ${limit}
      `,
      shopId,
    );
    const list = (rows || []).map((r) => {
      let data = null;
      try {
        data = r.dataJson ? JSON.parse(r.dataJson) : null;
      } catch {
        data = null;
      }
      return {
        id: r.id,
        shopId: r.shopId,
        kind: r.kind,
        title: r.title,
        body: r.body,
        titleMy: r.titleMy,
        bodyMy: r.bodyMy,
        data,
        readAt: r.readAt,
        createdAt: r.createdAt,
      };
    });
    const unread = list.filter((n) => !n.readAt).length;
    return ok(res, { notifications: list, unread });
  } catch (err) {
    console.error("notifications list", err);
    return fail(res, 500, "Could not load notifications", "db_error");
  }
});

/** POST /api/merchant/notifications/mark-read */
router.post("/notifications/mark-read", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    await ensureMerchantNotifyTables();
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const all = req.body?.all === true;

    if (all) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE MerchantNotification
        SET readAt = NOW(3)
        WHERE shopId = ? AND readAt IS NULL
        `,
        shopId,
      );
      return ok(res, { marked: "all" });
    }

    if (!ids.length) return fail(res, 400, "ids required");
    const idList = ids
      .slice(0, 100)
      .map((id) => `'${String(id).replace(/'/g, "")}'`)
      .join(",");
    await prisma.$executeRawUnsafe(
      `
      UPDATE MerchantNotification
      SET readAt = NOW(3)
      WHERE shopId = ? AND id IN (${idList}) AND readAt IS NULL
      `,
      shopId,
    );
    return ok(res, { marked: ids.length });
  } catch (err) {
    console.error("notifications mark-read", err);
    return fail(res, 500, "Could not mark read", "db_error");
  }
});

export default router;
