/**
 * QR App buyer notifications + Expo push (product badges on sellOnApp SKUs).
 * Replaces the old Odoo ribbon → Vercel webhook path.
 */
import { prisma } from "./prisma.js";
import { sendExpoPushMessages, withDeliveryDefaults } from "./expo-push.js";
import { ensureBuyerNotifyTables } from "./ensure-schema.js";

const ANDROID_CHANNEL_ID = "default";
const PRODUCT_PUSH_DEDUPE_MS = Number(process.env.PRODUCT_PUSH_DEDUPE_MS || 120000);
const recentProductPushes = new Map();

const BLOCKED_BADGE_SUBSTRINGS = [
  "sold out",
  "soldout",
  "out of stock",
  "outofstock",
  "out-of-stock",
];

export function isBlockedBuyerBadge(name) {
  const normalized = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return true;
  return BLOCKED_BADGE_SUBSTRINGS.some((blocked) => {
    const needle = blocked.replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    return (
      normalized.includes(needle) ||
      normalized.replace(/\s+/g, "").includes(needle.replace(/\s+/g, ""))
    );
  });
}

function shouldSkipDuplicateProductPush(productId, ribbonName) {
  const key = `${productId}|${String(ribbonName || "").trim().toLowerCase()}`;
  const now = Date.now();
  const previous = recentProductPushes.get(key) || 0;
  if (recentProductPushes.size > 200) {
    for (const [k, ts] of recentProductPushes) {
      if (now - ts > PRODUCT_PUSH_DEDUPE_MS) recentProductPushes.delete(k);
    }
  }
  if (previous && now - previous < PRODUCT_PUSH_DEDUPE_MS) return true;
  recentProductPushes.set(key, now);
  return false;
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function buyerPushTokens() {
  await ensureBuyerNotifyTables();
  const buyers = await prisma.user.findMany({
    where: { role: "buyer", active: true },
    select: { id: true },
  });
  if (!buyers.length) return [];
  const idList = buyers
    .map((u) => `'${String(u.id).replace(/'/g, "")}'`)
    .join(",");
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT id, userId, token, language
    FROM DevicePushToken
    WHERE userId IN (${idList})
    `,
  );
  return rows || [];
}

async function insertBuyerNotification(row) {
  await ensureBuyerNotifyTables();
  const id = row.id || newId("bn");
  const dataJson = row.data ? JSON.stringify(row.data) : null;
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO BuyerNotification
      (id, kind, title, body, titleMy, bodyMy, productId, productName, ribbonName,
       couponCode, amount, dataJson, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
    `,
    id,
    row.kind,
    row.title,
    row.body,
    row.titleMy || null,
    row.bodyMy || null,
    row.productId || null,
    row.productName || null,
    row.ribbonName || null,
    row.couponCode || null,
    row.amount == null ? null : Number(row.amount),
    dataJson,
  );
  return id;
}

async function pushToBuyerTokens(tokens, { title, body, titleMy, bodyMy, data, imageUrl }) {
  if (!tokens.length) return { sent: 0 };
  const messages = tokens.map((row) => {
    const lang = String(row.language || "my").toLowerCase();
    const useMy = lang.startsWith("my");
    return withDeliveryDefaults({
      to: row.token,
      title: useMy ? titleMy || title : title,
      body: useMy ? bodyMy || body : body,
      data: data || {},
      channelId: ANDROID_CHANNEL_ID,
      ...(imageUrl
        ? {
            mutableContent: true,
            richContent: { image: imageUrl },
          }
        : null),
    });
  });
  try {
    const result = await sendExpoPushMessages(messages);
    const tickets = result.data || [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (
        ticket?.status === "error" &&
        (ticket?.details?.error === "DeviceNotRegistered" ||
          /not.?registered/i.test(String(ticket?.message || "")))
      ) {
        const token = tokens[i]?.token;
        if (token) {
          await prisma.$executeRawUnsafe(
            `DELETE FROM DevicePushToken WHERE token = ?`,
            token,
          );
        }
      }
    }
    return { sent: messages.length };
  } catch (err) {
    console.warn("buyer push", String(err?.message || err).slice(0, 240));
    return { sent: 0, error: String(err?.message || err) };
  }
}

/**
 * Fire when a sellOnApp product gets a notifiable badge (or is published to App with one).
 */
export function notifyBuyersProductBadge(
  product,
  { previousBadge, previousSellOnApp } = {},
) {
  void notifyBuyersProductBadgeAsync(product, {
    previousBadge,
    previousSellOnApp,
  }).catch((e) =>
    console.warn("notify buyer product", String(e?.message || e).slice(0, 200)),
  );
}

async function notifyBuyersProductBadgeAsync(
  product,
  { previousBadge, previousSellOnApp } = {},
) {
  if (!product?.id) return;
  if (!product.active || !product.sellOnApp) return;

  const ribbon = String(product.badge || "").trim();
  if (!ribbon || isBlockedBuyerBadge(ribbon)) return;

  const prev = String(previousBadge || "").trim();
  const newlyOnApp = previousSellOnApp !== true;
  // Only notify when badge newly set / changed, or product newly listed on App.
  if (
    !newlyOnApp &&
    prev &&
    prev.toLowerCase() === ribbon.toLowerCase()
  ) {
    return;
  }

  if (shouldSkipDuplicateProductPush(product.id, ribbon)) return;

  const name = String(product.name || "Product").trim() || "Product";
  const title = `${ribbon}`;
  const body = `${name} — new on QR App`;
  const titleMy = ribbon;
  const bodyMy = `${name} — QR App တွင် ရရှိပါပြီ`;
  const imageUrl = product.imageUrl || product.image_url || null;
  const data = {
    type: "product",
    productId: product.id,
    ribbonName: ribbon,
    imageUrl: imageUrl || undefined,
  };

  const notificationId = await insertBuyerNotification({
    kind: "product",
    title,
    body,
    titleMy,
    bodyMy,
    productId: product.id,
    productName: name,
    ribbonName: ribbon,
    data,
  });

  const tokens = await buyerPushTokens();
  await pushToBuyerTokens(tokens, {
    title,
    body,
    titleMy,
    bodyMy,
    data: { ...data, id: notificationId },
    imageUrl,
  });
}

export async function sendBuyerTestPush(userId) {
  await ensureBuyerNotifyTables();
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, userId, token, language FROM DevicePushToken WHERE userId = ?`,
    userId,
  );
  if (!rows?.length) {
    return { ok: false, error: "No Expo push token registered for this account" };
  }
  const result = await pushToBuyerTokens(rows, {
    title: "QR Shop test",
    body: "Background push is working.",
    titleMy: "QR Shop စမ်းသပ်ချက်",
    bodyMy: "Background push အလုပ်လုပ်နေပါသည်။",
    data: { type: "test" },
  });
  return { ok: true, ...result };
}
