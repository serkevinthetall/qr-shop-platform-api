/**
 * Merchant in-app notifications + Expo push (orders / buyer messages).
 */
import { prisma } from "./prisma.js";
import { sendExpoPushMessages, withDeliveryDefaults } from "./expo-push.js";
import { ensureMerchantNotifyTables } from "./ensure-schema.js";

function formatKs(n) {
  return `${Math.max(0, Math.floor(Number(n) || 0)).toLocaleString()} Ks`;
}

async function tokensForShop(shopId, kind) {
  await ensureMerchantNotifyTables();
  const users = await prisma.user.findMany({
    where: {
      shopId,
      active: true,
      role: { in: ["merchant", "staff"] },
    },
    select: { id: true },
  });
  if (!users.length) return [];
  const userIds = users.map((u) => u.id);
  const idList = userIds
    .map((id) => `'${String(id).replace(/'/g, "")}'`)
    .join(",");
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT id, userId, token, notifyOrders, notifyMessages
    FROM DevicePushToken
    WHERE userId IN (${idList})
    `,
  );
  return (rows || []).filter((r) => {
    if (kind === "order") return Number(r.notifyOrders) !== 0;
    if (kind === "message") return Number(r.notifyMessages) !== 0;
    return true;
  });
}

async function insertNotification({
  shopId,
  kind,
  title,
  body,
  titleMy,
  bodyMy,
  data,
}) {
  await ensureMerchantNotifyTables();
  const id = `mn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const dataJson = data ? JSON.stringify(data) : null;
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO MerchantNotification
      (id, shopId, kind, title, body, titleMy, bodyMy, dataJson, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
    `,
    id,
    shopId,
    kind,
    title,
    body,
    titleMy || null,
    bodyMy || null,
    dataJson,
  );
  return id;
}

async function pushToTokens(tokens, { title, body, data, imageUrl }) {
  if (!tokens.length) return;
  const messages = tokens.map((row) =>
    withDeliveryDefaults({
      to: row.token,
      title,
      body,
      data: data || {},
      ...(imageUrl
        ? {
            mutableContent: true,
            richContent: { image: imageUrl },
          }
        : null),
    }),
  );
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
  } catch (err) {
    console.warn(
      "merchant push",
      String(err?.message || err).slice(0, 240),
    );
  }
}

/** Fire-and-forget safe wrapper. */
export function notifyShopNewOrder(order) {
  void notifyShopNewOrderAsync(order).catch((e) =>
    console.warn("notify order", String(e?.message || e).slice(0, 200)),
  );
}

async function notifyShopNewOrderAsync(order) {
  if (!order?.shopId) return;
  const code = order.code || order.id;
  const total = formatKs(order.totalKs);
  const buyer = String(order.buyerName || "").trim() || "Buyer";
  const title = "New Order";
  const body = `Order #${code} · ${total} · ${buyer}`;
  const titleMy = "အော်ဒါအသစ်ရရှိပါသည်";
  const bodyMy = `#${code} · ${total} · အတည်ပြုရန် စောင့်နေသည်`;
  const imageUrl =
    order.lines?.[0]?.productImageUrl ||
    order.lines?.[0]?.imageUrl ||
    null;
  const data = {
    kind: "order",
    orderId: order.id,
    shopId: order.shopId,
    imageUrl: imageUrl || undefined,
  };
  await insertNotification({
    shopId: order.shopId,
    kind: "order",
    title,
    body,
    titleMy,
    bodyMy,
    data,
  });
  const tokens = await tokensForShop(order.shopId, "order");
  await pushToTokens(tokens, { title: titleMy, body: bodyMy, data, imageUrl });
}

export function notifyShopNewMessage({
  shopId,
  threadId,
  buyerName,
  text,
  productImageUrl,
}) {
  void notifyShopNewMessageAsync({
    shopId,
    threadId,
    buyerName,
    text,
    productImageUrl,
  }).catch((e) =>
    console.warn("notify message", String(e?.message || e).slice(0, 200)),
  );
}

async function notifyShopNewMessageAsync({
  shopId,
  threadId,
  buyerName,
  text,
  productImageUrl,
}) {
  if (!shopId || !threadId) return;
  const who = String(buyerName || "").trim() || "Buyer";
  const preview = String(text || "").trim().slice(0, 120);
  const title = "New Message";
  const body = preview ? `${who}: ${preview}` : who;
  const titleMy = "မက်ဆေ့ချ်အသစ်ရရှိပါသည်";
  const bodyMy = preview ? `${who} — ${preview}` : who;
  const data = {
    kind: "message",
    threadId,
    shopId,
    imageUrl: productImageUrl || undefined,
  };
  await insertNotification({
    shopId,
    kind: "message",
    title,
    body,
    titleMy,
    bodyMy,
    data,
  });
  const tokens = await tokensForShop(shopId, "message");
  await pushToTokens(tokens, {
    title: titleMy,
    body: bodyMy,
    data,
    imageUrl: productImageUrl,
  });
}

/** Send a test banner to this merchant/staff user's registered Expo token(s). */
export async function sendMerchantTestPush(userId) {
  await ensureMerchantNotifyTables();
  const id = String(userId || "").trim();
  if (!id) return { ok: false, error: "Missing user id" };
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, userId, token, notifyOrders, notifyMessages FROM DevicePushToken WHERE userId = ?`,
    id,
  );
  if (!rows?.length) {
    return {
      ok: false,
      error: "No Expo push token registered for this account",
      tokenCount: 0,
    };
  }
  const result = await pushToTokens(rows, {
    title: "အသိပေးချက် စမ်းသပ်ချက်",
    body: "Merchant background push အလုပ်လုပ်နေပါသည်။",
    data: { kind: "test" },
  });
  return {
    ok: true,
    tokenCount: rows.length,
    tickets: result?.data || [],
  };
}
