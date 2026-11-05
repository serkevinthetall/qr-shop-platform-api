/**
 * Human-readable order codes: d1214 (delivery), p12431 (pickup).
 * CUID stays the DB primary key; `code` is what Admin / Merchant / buyer see.
 */

/**
 * @param {import("@prisma/client").Prisma.TransactionClient | import("@prisma/client").PrismaClient} tx
 * @param {"delivery" | "pickup" | "express"} fulfillment
 * @returns {Promise<string>}
 */
export async function allocateOrderCode(tx, fulfillment) {
  const prefix =
    fulfillment === "express" ? "e" : fulfillment === "delivery" ? "d" : "p";
  await tx.orderCodeCounter.upsert({
    where: { prefix },
    create: { prefix, next: 1000 },
    update: {},
  });
  const counter = await tx.orderCodeCounter.update({
    where: { prefix },
    data: { next: { increment: 1 } },
  });
  return `${prefix}${counter.next}`.toLowerCase();
}

/** True for short codes like d1214 / p12431 / e1201 (not cuid). */
export function looksLikeOrderCode(value) {
  return typeof value === "string" && /^[dpe]\d{3,8}$/i.test(value.trim());
}
