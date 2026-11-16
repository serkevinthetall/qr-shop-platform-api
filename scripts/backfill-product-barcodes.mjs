/**
 * Assign unique 12-digit Code 128 barcodes to products missing one.
 * Run: node scripts/backfill-product-barcodes.mjs
 * Optional: SHOP_ID=xxx node scripts/backfill-product-barcodes.mjs
 */
import { prisma } from "../src/lib/prisma.js";

function digitsOnly(raw) {
  return String(raw ?? "").replace(/\D/g, "");
}

function isCompleteBarcode(raw) {
  const d = digitsOnly(raw);
  return d.length === 12 || d.length === 13;
}

/** Stable 12-digit body from product id (collision-checked by caller). */
function candidateFromId(productId, salt = 0) {
  let h = 2166136261 ^ salt;
  const s = String(productId || "sku");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = (h >>> 0) % 1_000_000_000_000;
  return String(n).padStart(12, "0");
}

async function main() {
  const shopId = String(process.env.SHOP_ID || "").trim();
  const where = {
    OR: [{ barcode: null }, { barcode: "" }],
    ...(shopId ? { shopId } : {}),
  };

  const missing = await prisma.product.findMany({
    where,
    orderBy: [{ shopId: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, shopId: true, barcode: true },
  });

  const existing = await prisma.product.findMany({
    where: { barcode: { not: null } },
    select: { barcode: true },
  });
  const used = new Set(
    existing
      .map((p) => digitsOnly(p.barcode).slice(0, 12))
      .filter((d) => d.length === 12),
  );

  console.log(
    `Products missing barcode: ${missing.length}${shopId ? ` (shop ${shopId})` : ""}`,
  );

  let updated = 0;
  let skipped = 0;
  for (const row of missing) {
    if (isCompleteBarcode(row.barcode)) {
      skipped += 1;
      continue;
    }
    let code = "";
    for (let salt = 0; salt < 5000; salt++) {
      const c = candidateFromId(row.id, salt);
      if (!used.has(c)) {
        code = c;
        break;
      }
    }
    if (!code) {
      console.warn(`  SKIP ${row.id} (${row.name}) — could not allocate unique code`);
      skipped += 1;
      continue;
    }
    used.add(code);
    await prisma.product.update({
      where: { id: row.id },
      data: { barcode: code },
    });
    updated += 1;
    console.log(`  ${row.shopId} · ${row.name} → ${code}`);
  }

  console.log(`Done. Updated ${updated}, skipped ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
