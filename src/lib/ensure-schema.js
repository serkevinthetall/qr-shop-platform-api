import { prisma } from "./prisma.js";

let expressColumnReady = false;
let wholesaleMinQtyReady = false;

function isDupColumn(err) {
  const msg = String(err?.message || err);
  return (
    /Duplicate column/i.test(msg) ||
    /already exists/i.test(msg) ||
    err?.code === "ER_DUP_FIELDNAME"
  );
}

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
    if (isDupColumn(err)) {
      /* already migrated */
    } else {
      console.warn("ensure-schema: expressZonesJson", String(err?.message || err).slice(0, 240));
      throw err;
    }
  }
  expressColumnReady = true;
}

/** Qty-threshold wholesale on Product (Hostinger may lack prisma db push). */
export async function ensureWholesaleMinQtyColumn() {
  if (wholesaleMinQtyReady) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`Product\`
      ADD COLUMN \`wholesaleMinQty\` INT NULL
    `);
    console.log("ensure-schema: added Product.wholesaleMinQty");
  } catch (err) {
    if (isDupColumn(err)) {
      /* already migrated */
    } else {
      console.warn("ensure-schema: wholesaleMinQty", String(err?.message || err).slice(0, 240));
      throw err;
    }
  }
  wholesaleMinQtyReady = true;
}

export async function ensureSchemaPatches() {
  await Promise.all([
    ensureExpressZonesColumn().catch(() => {}),
    ensureWholesaleMinQtyColumn().catch(() => {}),
  ]);
}
