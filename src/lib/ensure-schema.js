import { prisma } from "./prisma.js";

let expressColumnReady = false;
let wholesaleMinQtyReady = false;
let productBadgeTableReady = false;
let adminViewOtpTableReady = false;

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

/** Admin-controlled product badge catalog (Hostinger may lack prisma db push). */
export async function ensureProductBadgeTable() {
  if (productBadgeTableReady) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ProductBadge\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`nameMy\` VARCHAR(191) NULL,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`active\` BOOLEAN NOT NULL DEFAULT true,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`ProductBadge_name_key\` (\`name\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("ensure-schema: ensured ProductBadge table");
  } catch (err) {
    console.warn(
      "ensure-schema: ProductBadge",
      String(err?.message || err).slice(0, 240),
    );
    throw err;
  }
  productBadgeTableReady = true;
}

/** Admin OTP challenges for viewing buyer/merchant accounts. */
export async function ensureAdminViewOtpTable() {
  if (adminViewOtpTableReady) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`AdminViewOtp\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`adminUserId\` VARCHAR(191) NOT NULL,
        \`targetUserId\` VARCHAR(191) NOT NULL,
        \`codeHash\` VARCHAR(191) NOT NULL,
        \`expiresAt\` DATETIME(3) NOT NULL,
        \`consumedAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`AdminViewOtp_adminUserId_targetUserId_idx\` (\`adminUserId\`, \`targetUserId\`),
        INDEX \`AdminViewOtp_expiresAt_idx\` (\`expiresAt\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("ensure-schema: ensured AdminViewOtp table");
  } catch (err) {
    console.warn(
      "ensure-schema: AdminViewOtp",
      String(err?.message || err).slice(0, 240),
    );
    throw err;
  }
  adminViewOtpTableReady = true;
}

export async function ensureSchemaPatches() {
  await Promise.all([
    ensureExpressZonesColumn().catch(() => {}),
    ensureWholesaleMinQtyColumn().catch(() => {}),
    ensureProductBadgeTable().catch(() => {}),
    ensureAdminViewOtpTable().catch(() => {}),
  ]);
}
