/**
 * Shop platform subscription — Trial / Premium Member, 12-month periods.
 * Approved shops are Premium Member; join date is the period start (already active).
 * Activate renews only when Due. signedUpAt (join date) is never overwritten.
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
  if (p === "trial" || p === "free") return "trial";
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

/** Join / registration date — subSignedUpAt, else createdAt. */
export function joinDateOf(shop) {
  if (shop?.subSignedUpAt instanceof Date) return shop.subSignedUpAt;
  if (shop?.subSignedUpAt) {
    const d = new Date(shop.subSignedUpAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (shop?.createdAt instanceof Date) return shop.createdAt;
  if (shop?.createdAt) {
    const d = new Date(shop.createdAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Prisma fields when a shop becomes approved:
 * Premium Member, Active, period starts at join date.
 * Does not overwrite an existing in-period expiry.
 */
export function approvalSubscriptionData(shop) {
  const joinAt = joinDateOf(shop) || new Date();
  const signedUpAt = shop?.subSignedUpAt
    ? shop.subSignedUpAt instanceof Date
      ? shop.subSignedUpAt
      : new Date(shop.subSignedUpAt)
    : joinAt;
  const start = Number.isNaN(signedUpAt.getTime()) ? joinAt : signedUpAt;
  const data = {
    subPlan: "premium",
    subStatus: "active",
  };
  if (!shop?.subSignedUpAt) {
    data.subSignedUpAt = start;
  }

  const currentStatus = normalizeStatus(shop?.subStatus);
  const hasExpires = Boolean(shop?.subExpiresAt);
  const expiresMs = hasExpires
    ? new Date(shop.subExpiresAt).getTime()
    : NaN;
  const inPeriod =
    currentStatus === "active" &&
    hasExpires &&
    !Number.isNaN(expiresMs) &&
    expiresMs >= Date.now();

  if (!inPeriod) {
    data.subExpiresAt = new Date(
      addMonthsIso(start, SUB_PERIOD_MONTHS) || addMonthsIso(new Date(), SUB_PERIOD_MONTHS),
    );
  }
  return data;
}

/** Approved shop missing Premium / Active / period from join. */
export function needsApprovalSubscriptionHeal(shop) {
  if (String(shop?.status || "").toLowerCase() !== "approved") return false;
  const plan = normalizePlan(shop?.subPlan);
  const status = normalizeStatus(shop?.subStatus);
  if (plan !== "premium") return true;
  if (status === "none" || status === "canceled") return true;
  if (!shop?.subExpiresAt) return true;
  return false;
}

/**
 * Derive live status: active past expiry → due.
 * Approved shops resolve as Premium Active from join when not yet set.
 * Never mutates signedUpAt.
 */
export function resolveSubscription(shop) {
  const joinAt = joinDateOf(shop);
  const signedUpAt = joinAt ? joinAt.toISOString() : null;

  let plan = normalizePlan(shop?.subPlan);
  let status = normalizeStatus(shop?.subStatus);
  let expiresAt =
    shop?.subExpiresAt instanceof Date
      ? shop.subExpiresAt.toISOString()
      : shop?.subExpiresAt
        ? String(shop.subExpiresAt)
        : null;

  const shopStatus = String(shop?.status || "").toLowerCase();
  if (
    shopStatus === "approved" &&
    (status === "none" || status === "canceled" || !expiresAt || plan !== "premium")
  ) {
    plan = "premium";
    status = "active";
    if (!expiresAt && signedUpAt) {
      expiresAt = addMonthsIso(signedUpAt, SUB_PERIOD_MONTHS);
    } else if (!expiresAt) {
      expiresAt = addMonthsIso(new Date(), SUB_PERIOD_MONTHS);
    }
  }

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

  /** Activate renews when due / expired — approval already activates new shops. */
  const canActivate =
    status === "due" || (expiresAt != null && daysLeft != null && daysLeft < 0);

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
 * Build Prisma update for activate / renew — keeps signedUpAt.
 * Period starts from now (renewal). Approved shops default to Premium.
 * @param {object} shop current shop row
 * @param {{ plan?: string }} [opts]
 */
export function activateSubscriptionData(shop, opts = {}) {
  const current = resolveSubscription(shop);
  const approved = String(shop?.status || "").toLowerCase() === "approved";
  const plan =
    normalizePlan(opts.plan) ||
    current.plan ||
    (approved ? "premium" : "trial");
  const now = new Date();
  const signedUpAt = joinDateOf(shop) || now;

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
    data.subSignedUpAt = joinDateOf(shop) || new Date();
  }
  return data;
}
