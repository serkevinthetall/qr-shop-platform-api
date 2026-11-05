import { prisma } from "./prisma.js";
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

export async function getExpressSettings(shopId) {
  const delivery = await prisma.shopDelivery.findUnique({ where: { shopId } });
  return {
    expressEnabled: Boolean(delivery?.expressEnabled),
    expressFeeKs: Math.max(0, Math.floor(Number(delivery?.expressFeeKs) || 0)),
  };
}

/**
 * Resolve what Marketplace may offer for a buyer township.
 */
export async function resolveDeliveryOptions(shopId, buyerTownshipId) {
  const delivery = await prisma.shopDelivery.findUnique({ where: { shopId } });
  const pickupEnabled = delivery?.pickupEnabled !== false;
  const deliveryEnabled = Boolean(delivery?.deliveryEnabled);
  const expressEnabled = Boolean(delivery?.expressEnabled);
  const expressFeeKs = Math.max(0, Math.floor(Number(delivery?.expressFeeKs) || 0));
  const homeState = await getShopHomeState(shopId);

  let buyerState = null;
  let townshipActive = false;
  if (buyerTownshipId) {
    const t = await prisma.township.findUnique({ where: { id: buyerTownshipId } });
    townshipActive = Boolean(t?.active);
    buyerState = t?.state || null;
  }

  const sameState =
    homeState && buyerState ? statesMatch(homeState, buyerState) : null;
  const zoneFee =
    deliveryEnabled && buyerTownshipId
      ? await getDeliveryFeeForTownship(shopId, buyerTownshipId)
      : null;
  const inZone = zoneFee != null;

  /** Local delivery only when same state (or home unknown) and in zone. */
  const canDelivery =
    deliveryEnabled && inZone && (sameState === true || sameState === null);
  /**
   * Express when merchant enabled it, township published, and buyer is
   * clearly out of the shop's home state.
   */
  const canExpress =
    expressEnabled &&
    townshipActive &&
    Boolean(buyerTownshipId) &&
    sameState === false;

  return {
    homeState,
    buyerState,
    sameState,
    inZone,
    pickupEnabled,
    deliveryEnabled,
    expressEnabled,
    canPickup: pickupEnabled,
    canDelivery,
    canExpress,
    deliveryFeeKs: canDelivery ? zoneFee : null,
    expressFeeKs: canExpress ? expressFeeKs : null,
    /** Same-state but outside zones → contact shop (still offer pickup). */
    contactShop: sameState === true && deliveryEnabled && !inZone,
  };
}
