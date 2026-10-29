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
