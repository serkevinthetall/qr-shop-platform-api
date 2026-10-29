/**
 * In-process pub/sub for live order + message (enquiry) updates.
 * Clients subscribe via SSE GET /api/realtime/stream
 */
import { normalizePhone } from "./phone.js";

/** @typedef {{ res: import('express').Response, topics: Set<string>, ping?: ReturnType<typeof setInterval> }} RealtimeClient */

/** @type {Set<RealtimeClient>} */
const clients = new Set();

/**
 * @param {import('express').Response} res
 * @param {string[]} topics
 * @param {import('express').Request} req
 */
export function subscribe(res, topics, req) {
  const client = {
    res,
    topics: new Set(topics.filter(Boolean)),
  };
  clients.add(client);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ topics: [...client.topics] })}\n\n`);

  client.ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      cleanup(client);
    }
  }, 20000);

  const onClose = () => cleanup(client);
  req.on("close", onClose);
  req.on("aborted", onClose);
}

/** @param {RealtimeClient} client */
function cleanup(client) {
  if (client.ping) clearInterval(client.ping);
  clients.delete(client);
  try {
    client.res.end();
  } catch {
    /* ignore */
  }
}

/**
 * @param {string|string[]} topics
 * @param {{ type: string, action?: string, [k: string]: unknown }} payload
 */
export function publish(topics, payload) {
  const list = Array.isArray(topics) ? topics : [topics];
  const topicSet = new Set(list.filter(Boolean));
  if (topicSet.size === 0) return;

  const body = `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of [...clients]) {
    let match = false;
    for (const t of topicSet) {
      if (client.topics.has(t)) {
        match = true;
        break;
      }
    }
    if (!match) continue;
    try {
      client.res.write(body);
    } catch {
      cleanup(client);
    }
  }
}

/** @param {{ id: string, shopId: string, buyerId?: string|null, buyerPhone?: string|null, stage?: string }} order */
export function publishOrderEvent(order, action = "updated") {
  const topics = [`shop:${order.shopId}`, `order:${order.id}`];
  if (order.buyerId) topics.push(`user:${order.buyerId}`);
  if (order.buyerPhone) topics.push(`phone:${normalizePhone(order.buyerPhone)}`);
  publish(topics, {
    type: "order",
    action,
    orderId: order.id,
    shopId: order.shopId,
    stage: order.stage,
  });
}

/**
 * Chat / enquiry / portal live events.
 * @param {{ id: string, shopId?: string|null, buyerContact?: string|null, threadId?: string|null, buyerId?: string|null, channel?: string|null }} enquiry
 */
export function publishMessageEvent(enquiry, action = "updated") {
  const topics = [];
  if (enquiry.shopId) topics.push(`shop:${enquiry.shopId}`);
  if (enquiry.buyerContact) {
    topics.push(`phone:${normalizePhone(enquiry.buyerContact)}`);
  }
  if (enquiry.buyerId) topics.push(`user:${enquiry.buyerId}`);
  if (enquiry.threadId) topics.push(`thread:${enquiry.threadId}`);
  const channel = enquiry.channel || "chat";
  if (channel === "portal") {
    topics.push("admin:portal");
  } else {
    // Admins watching platform inbox can see buyer↔shop chat activity too
    topics.push("admin:chat");
  }
  // Event name "chat" (not "message") — avoids clashing with SSE default message channel
  publish(topics, {
    type: "chat",
    action,
    channel,
    enquiryId: enquiry.id,
    threadId: enquiry.threadId || null,
    shopId: enquiry.shopId || null,
  });
}

export function realtimeClientCount() {
  return clients.size;
}
