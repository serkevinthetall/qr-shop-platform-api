import { prisma } from "./prisma.js";
import { ensureExpressZonesColumn } from "./ensure-schema.js";
import { townshipLabel } from "./township.js";

/**
 * Merchant zone fee for a published township.
 * Same rule as Marketplace getDeliveryFeeForTownship().
 */
export async function getDeliveryFeeForTownship(shopId, townshipId) {
  if (!shopId || !townshipId) return null;
  const delivery = await prisma.shopDelivery.findUnique({ where: { shopId } });
  if (!delivery?.deliveryEnabled) return null;
  const zones = Array.isArray(delivery.zonesJson) ? delivery.zonesJson : [];
  const hit = zones.find((z) => z && z.townshipId === townshipId);
  if (!hit) return null;
  const township = await prisma.township.findUnique({ where: { id: townshipId } });
  if (!township?.active) return null;
  return Math.max(0, Math.floor(Number(hit.feeKs) || 0));
}

export async function enrichZones(zonesJson) {
  const zones = Array.isArray(zonesJson) ? zonesJson : [];
  const out = [];
  for (const z of zones) {
    if (!z?.townshipId) continue;
    const t = await prisma.township.findUnique({ where: { id: z.townshipId } });
    out.push({
      townshipId: z.townshipId,
      feeKs: Math.max(0, Math.floor(Number(z.feeKs) || 0)),
      name: t ? townshipLabel(t) : z.townshipId,
      nameMm: t?.nameMm || undefined,
      state: t?.state || undefined,
      postalCode: t?.postalCode || undefined,
      active: Boolean(t?.active),
    });
  }
  return out;
}

function normalizeStateKey(state) {
  return String(state || "")
    .trim()
    .toLowerCase()
    .replace(/\s*\(mm\)\s*$/i, "")
    .replace(/\s+/g, " ");
}

export function statesMatch(a, b) {
  const na = normalizeStateKey(a);
  const nb = normalizeStateKey(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Shop "home" state for same-state vs Express:
 * 1) Majority state among delivery zones
 * 2) Else match Shop.township against published townships
 * 3) Else null (Express / local delivery gating soft-fails)
 */
export async function getShopHomeState(shopId) {
  if (!shopId) return null;
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { delivery: true },
  });
  if (!shop) return null;

  const zones = Array.isArray(shop.delivery?.zonesJson) ? shop.delivery.zonesJson : [];
  const counts = new Map();
  for (const z of zones) {
    if (!z?.townshipId) continue;
    const t = await prisma.township.findUnique({ where: { id: z.townshipId } });
    if (!t?.state) continue;
    counts.set(t.state, (counts.get(t.state) || 0) + 1);
  }
  if (counts.size > 0) {
    let best = null;
    let bestN = -1;
    for (const [state, n] of counts) {
      if (n > bestN) {
        best = state;
        bestN = n;
      }
    }
    if (best) return best;
  }

  const tip = String(shop.township || "").trim();
  if (tip) {
    const byState = await prisma.township.findFirst({
      where: { state: tip },
      select: { state: true },
    });
    if (byState?.state) return byState.state;

    const all = await prisma.township.findMany({
      where: { active: true },
      select: { state: true, name: true, nameEn: true, nameMm: true },
      take: 800,
    });
    const tipNorm = normalizeStateKey(tip);
    for (const t of all) {
      if (statesMatch(t.state, tip)) return t.state;
      const names = [t.name, t.nameEn, t.nameMm].filter(Boolean);
      if (names.some((n) => normalizeStateKey(n) === tipNorm)) return t.state;
      if (names.some((n) => tipNorm.includes(normalizeStateKey(n)) && normalizeStateKey(n).length > 3)) {
        return t.state;
      }
    }
  }
  return null;
}

/** Normalize Express state rows: [{ state, feeKs }]. */
export function parseExpressStates(expressZonesJson) {
  const rows = Array.isArray(expressZonesJson) ? expressZonesJson : [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const state = String(row?.state || "").trim();
    if (!state) continue;
    const key = normalizeStateKey(state);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      state,
      feeKs: Math.max(0, Math.floor(Number(row.feeKs) || 0)),
    });
  }
  return out;
}

/**
 * Express fee by buyer state (merchant must add that CRM state).
 */
export async function getExpressFeeForState(shopId, buyerState) {
  if (!shopId || !buyerState) return null;
  await ensureExpressZonesColumn();
  const delivery = await prisma.shopDelivery.findUnique({ where: { shopId } });
  if (!delivery?.expressEnabled) return null;
  const states = parseExpressStates(delivery.expressZonesJson);
  const hit = states.find((s) => statesMatch(s.state, buyerState));
  if (!hit) return null;
  return hit.feeKs;
}

/**
 * Resolve what Marketplace may offer for a buyer township.
 */
export async function resolveDeliveryOptions(shopId, buyerTownshipId) {
  await ensureExpressZonesColumn();
  const delivery = await prisma.shopDelivery.findUnique({ where: { shopId } });
  const pickupEnabled = delivery?.pickupEnabled !== false;
  const deliveryEnabled = Boolean(delivery?.deliveryEnabled);
  const expressEnabled = Boolean(delivery?.expressEnabled);
  const homeState = await getShopHomeState(shopId);

  let buyerState = null;
  if (buyerTownshipId) {
    const t = await prisma.township.findUnique({ where: { id: buyerTownshipId } });
    buyerState = t?.state || null;
  }

  const sameState =
    homeState && buyerState ? statesMatch(homeState, buyerState) : null;
  const zoneFee =
    deliveryEnabled && buyerTownshipId
      ? await getDeliveryFeeForTownship(shopId, buyerTownshipId)
      : null;
  const inZone = zoneFee != null;
  const expressFee =
    expressEnabled && buyerState
      ? await getExpressFeeForState(shopId, buyerState)
      : null;
  const inExpressState = expressFee != null;

  /** Local delivery only when same state (or home unknown) and in zone. */
  const canDelivery =
    deliveryEnabled && inZone && (sameState === true || sameState === null);
  /**
   * Express: merchant enabled + buyer state listed + out of home state.
   */
  const canExpress =
    expressEnabled && inExpressState && sameState === false;

  return {
    homeState,
    buyerState,
    sameState,
    inZone,
    inExpressState,
    pickupEnabled,
    deliveryEnabled,
    expressEnabled,
    canPickup: pickupEnabled,
    canDelivery,
    canExpress,
    deliveryFeeKs: canDelivery ? zoneFee : null,
    expressFeeKs: canExpress ? expressFee : null,
    /** Same-state but outside zones → contact shop (still offer pickup). */
    contactShop: sameState === true && deliveryEnabled && !inZone,
  };
}
