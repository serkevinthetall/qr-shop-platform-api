/**
 * Shop platform subscription — Trial / Premium Member, 12-month periods.
 * signedUpAt (join date) is set once and never overwritten.
 */

export const SUB_PLANS = ["trial", "premium"];
export const SUB_STATUSES = ["none", "active", "due", "canceled"];

/** Period length when activating (months). */
export const SUB_PERIOD_MONTHS = 12;

function trim(v) {
  return String(v ?? "").trim();
}

export function normalizePlan(raw) {
  const p = trim(raw).toLowerCase();
  if (p === "premium" || p === "premium_member") return "premium";
  if (p === "trial") return "trial";
  return null;
}

export function normalizeStatus(raw) {
  const s = trim(raw).toLowerCase();
  if (s === "past_due" || s === "past-due" || s === "expired") return "due";
  if (s === "cancelled") return "canceled";
  if (SUB_STATUSES.includes(s)) return s;
  return "none";
}

export function addMonthsIso(from, months = SUB_PERIOD_MONTHS) {
  const base = from ? new Date(from) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const end = new Date(base);
  end.setMonth(end.getMonth() + months);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

/**
 * Derive live status: active past expiry → due.
 * Never mutates signedUpAt.
 */
export function resolveSubscription(shop) {
  const signedUpAt =
    shop?.subSignedUpAt instanceof Date
      ? shop.subSignedUpAt.toISOString()
      : shop?.subSignedUpAt
        ? String(shop.subSignedUpAt)
        : shop?.createdAt instanceof Date
          ? shop.createdAt.toISOString()
          : shop?.createdAt
            ? String(shop.createdAt)
            : null;

  let plan = normalizePlan(shop?.subPlan);
  let status = normalizeStatus(shop?.subStatus);
  const expiresAt =
    shop?.subExpiresAt instanceof Date
      ? shop.subExpiresAt.toISOString()
      : shop?.subExpiresAt
        ? String(shop.subExpiresAt)
        : null;

  if (status === "active" && expiresAt) {
    const end = new Date(expiresAt).getTime();
    if (!Number.isNaN(end) && end < Date.now()) {
      status = "due";
    }
  }

  /** Days left (ceil); negative when overdue. */
  let daysLeft = null;
  if (expiresAt) {
    const end = new Date(expiresAt).getTime();
    if (!Number.isNaN(end)) {
      daysLeft = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
    }
  }

  const canActivate =
    status === "none" || status === "due" || (expiresAt != null && daysLeft != null && daysLeft < 0);

  return {
    merchantId: shop?.id || shop?.merchantId || "",
    plan,
    status,
    signedUpAt,
    expiresAt,
    daysLeft,
    canActivate,
    periodMonths: SUB_PERIOD_MONTHS,
  };
}

/** Public payload for Admin / Merchant clients. */
export function subscriptionPayload(shop) {
  return resolveSubscription(shop);
}

/**
 * Build Prisma update for activate — keeps signedUpAt.
 * @param {object} shop current shop row
 * @param {{ plan?: string }} [opts]
 */
export function activateSubscriptionData(shop, opts = {}) {
  const current = resolveSubscription(shop);
  const plan = normalizePlan(opts.plan) || current.plan || "trial";
  const now = new Date();
  const signedUpAt =
    shop.subSignedUpAt instanceof Date
      ? shop.subSignedUpAt
      : shop.subSignedUpAt
        ? new Date(shop.subSignedUpAt)
        : shop.createdAt instanceof Date
          ? shop.createdAt
          : now;

  const data = {
    subPlan: plan,
    subStatus: "active",
    subExpiresAt: new Date(addMonthsIso(now, SUB_PERIOD_MONTHS)),
  };
  /** Only set join date if missing — never overwrite. */
  if (!shop.subSignedUpAt) {
    data.subSignedUpAt = Number.isNaN(signedUpAt.getTime()) ? now : signedUpAt;
  }
  return data;
}

/**
 * Admin sets plan/status without necessarily starting a period.
 * signedUpAt never overwritten if already set.
 */
export function patchSubscriptionData(shop, body = {}) {
  const data = {};
  if (body.plan !== undefined) {
    data.subPlan = normalizePlan(body.plan);
  }
  if (body.status !== undefined) {
    data.subStatus = normalizeStatus(body.status);
  }
  if (body.expiresAt !== undefined) {
    if (body.expiresAt == null || body.expiresAt === "") {
      data.subExpiresAt = null;
    } else {
      const d = new Date(body.expiresAt);
      data.subExpiresAt = Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (!shop.subSignedUpAt) {
    data.subSignedUpAt =
      shop.createdAt instanceof Date ? shop.createdAt : new Date();
  }
  return data;
}
