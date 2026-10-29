/**
 * Assign short codes (d… / p…) to legacy orders missing `code`.
 * Run: node scripts/backfill-order-codes.mjs
 */
import { prisma } from "../src/lib/prisma.js";
import { allocateOrderCode } from "../src/lib/order-code.js";

async function main() {
  const missing = await prisma.order.findMany({
    where: { OR: [{ code: null }, { code: "" }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, fulfillment: true },
  });
  console.log(`Backfilling ${missing.length} orders…`);
  for (const row of missing) {
    const fulfillment = row.fulfillment === "delivery" ? "delivery" : "pickup";
    const code = await prisma.$transaction((tx) => allocateOrderCode(tx, fulfillment));
    await prisma.order.update({ where: { id: row.id }, data: { code } });
    console.log(`  ${row.id} → ${code}`);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
