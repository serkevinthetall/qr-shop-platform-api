/**
 * ChatThread read receipts — merchantLastReadAt / buyerLastReadAt.
 */

function toMs(v) {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

/** Thread unread for merchant inbox badge (1 or 0). */
export function unreadForMerchant(row) {
  const last = toMs(row.lastAt);
  if (last == null) return 0;
  const seen = toMs(row.merchantLastReadAt);
  if (seen == null) return 1;
  return last > seen ? 1 : 0;
}

/** Thread unread for buyer inbox. */
export function unreadForBuyer(row) {
  const last = toMs(row.lastAt);
  if (last == null) return 0;
  const seen = toMs(row.buyerLastReadAt);
  if (seen == null) return 1;
  return last > seen ? 1 : 0;
}

/** Outbound message was seen by the other party. */
export function messageIsReadByPeer(createdAt, peerLastReadAt) {
  const created = toMs(createdAt);
  const seen = toMs(peerLastReadAt);
  if (created == null || seen == null) return false;
  return created <= seen;
}

export function isoOrNull(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
