/**
 * Expo Push (FCM V1) — Merchant + QR App closed-app banners.
 * Optional EXPO_ACCESS_TOKEN improves delivery quotas.
 * Pass message.channelId — merchant_alerts (Merchant) or default (QR App).
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ANDROID_CHANNEL_ID = "merchant_alerts";

function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export async function sendExpoPushMessages(messages) {
  const valid = (messages || []).filter((m) => m && m.to);
  if (!valid.length) return { data: [] };

  const headers = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  const results = [];
  for (const batch of chunk(valid, 100)) {
    const response = await fetch(`${EXPO_PUSH_URL}?useFcmV1=true`, {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.errors?.[0]?.message || "Expo push request failed",
      );
    }
    if (Array.isArray(payload?.data)) results.push(...payload.data);
  }
  return { data: results };
}

export function withDeliveryDefaults(message) {
  return {
    ...message,
    priority: "high",
    channelId: message.channelId || ANDROID_CHANNEL_ID,
    sound: message.sound || "default",
    ttl: message.ttl ?? 3600,
    expiration: message.expiration ?? Math.floor(Date.now() / 1000) + 3600,
  };
}
