import { prisma } from "./prisma.js";

let expressColumnReady = false;

/**
 * Hostinger MySQL is not always synced via prisma db push.
 * Ensure Express state-fee column exists before ShopDelivery reads/writes.
 */
export async function ensureExpressZonesColumn() {
  if (expressColumnReady) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`ShopDelivery\`
      ADD COLUMN \`expressZonesJson\` JSON NULL
    `);
    console.log("ensure-schema: added ShopDelivery.expressZonesJson");
  } catch (err) {
    const msg = String(err?.message || err);
    if (
      /Duplicate column/i.test(msg) ||
      /already exists/i.test(msg) ||
      err?.code === "ER_DUP_FIELDNAME"
    ) {
      /* already migrated */
    } else {
      console.warn("ensure-schema: expressZonesJson", msg.slice(0, 240));
      throw err;
    }
  }
  expressColumnReady = true;
}
