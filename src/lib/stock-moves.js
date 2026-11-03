import { prisma } from "./prisma.js";

/**
 * Record inventory OUT for an order’s lines (idempotent per orderId).
 * Always logs moves. Stock count can go negative if merchant never stocked in.
 */
export async function recordOrderStockOut(order, { adjustStock = true } = {}) {
  if (!order?.id || !order.shopId) return { created: 0 };
  const reason = order.source === "pos" ? "pos" : "sale";
  const existing = await prisma.stockMove.count({
    where: { orderId: order.id, direction: "out", reason: { in: ["sale", "pos"] } },
  });
  if (existing > 0) return { created: 0 };

  const lines = order.lines || [];
  let created = 0;
  for (const line of lines) {
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    if (qty <= 0) continue;
    const productId = line.productId || null;
    const productName = String(line.productName || "Item").trim() || "Item";

    let stockAfter = null;
    if (adjustStock && productId) {
      const product = await prisma.product.findFirst({
        where: { id: productId, shopId: order.shopId },
      });
      if (product) {
        /** Allow minus — sold without prior IN / stock count */
        stockAfter = product.stock - qty;
        await prisma.product.update({
          where: { id: product.id },
          data: { stock: stockAfter },
        });
      }
    }

    await prisma.stockMove.create({
      data: {
        shopId: order.shopId,
        productId,
        productName,
        qty,
        direction: "out",
        reason,
        orderId: order.id,
        note: order.code
          ? `Order ${order.code}${stockAfter != null ? ` · stock ${stockAfter}` : ""}`
          : `Order ${order.id.slice(-6)}${stockAfter != null ? ` · stock ${stockAfter}` : ""}`,
      },
    });
    created += 1;
  }
  return { created };
}

/**
 * Manual stock adjust → in/out ledger row.
 * @param {{ shopId: string, product: { id: string, name: string, stock: number }, prevStock: number, nextStock: number }}
 */
export async function recordStockAdjustMove({ shopId, product, prevStock, nextStock }) {
  const delta = nextStock - prevStock;
  if (!delta) return null;
  const direction = delta > 0 ? "in" : "out";
  const qty = Math.abs(delta);
  return prisma.stockMove.create({
    data: {
      shopId,
      productId: product.id,
      productName: product.name,
      qty,
      direction,
      reason: "adjust",
      note: `Stock ${prevStock} → ${nextStock}`,
    },
  });
}
