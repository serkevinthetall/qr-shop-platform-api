/**
 * Import QR Shop delivery townships from data/townships.json
 * (name, state, postal code — for Admin / Merchant / Marketplace).
 *
 * Run: npm run db:seed:townships
 */
import "../src/lib/env.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = path.join(root, "data", "townships.json");

/** Demo: publish a few Yangon areas so Merchant can set fees immediately */
const AUTO_PUBLISH = new Set([
  "yangon-hlaing-11051",
  "yangon-thingangyun-11071",
  "yangon-kamayut-11041",
  "yangon-sanchaung-11111",
  "yangon-insein-11011",
]);

async function main() {
  if (
    !process.env.DATABASE_URL ||
    process.env.DATABASE_URL.includes("USER:PASSWORD") ||
    process.env.DATABASE_URL.includes("[YOUR-PASSWORD]")
  ) {
    throw new Error("Set Supabase DATABASE_URL in .env first");
  }

  const payload = JSON.parse(readFileSync(seedPath, "utf8"));
  const list = Array.isArray(payload.townships) ? payload.townships : [];
  if (!list.length) throw new Error("No townships in data/townships.json");

  let upserted = 0;
  for (const t of list) {
    const active = AUTO_PUBLISH.has(t.id) ? true : Boolean(t.active);
    await prisma.township.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        name: t.name,
        nameEn: t.nameEn || null,
        nameMm: t.nameMm || null,
        state: t.state || "Yangon (MM)",
        postalCode: String(t.postalCode || ""),
        country: t.country || "Myanmar",
        active,
        sortOrder: Number(t.sortOrder) || 0,
        sequence: t.sequence != null ? Number(t.sequence) : null,
      },
      update: {
        name: t.name,
        nameEn: t.nameEn || null,
        nameMm: t.nameMm || null,
        state: t.state || "Yangon (MM)",
        postalCode: String(t.postalCode || ""),
        country: t.country || "Myanmar",
        sortOrder: Number(t.sortOrder) || 0,
        sequence: t.sequence != null ? Number(t.sequence) : null,
        // keep existing active unless this id is in AUTO_PUBLISH
        ...(AUTO_PUBLISH.has(t.id) ? { active: true } : {}),
      },
    });
    upserted += 1;
  }

  const published = await prisma.township.count({ where: { active: true } });
  console.log(
    `Townships: upserted ${upserted} from Excel seed; ${published} published (active).`,
  );
  console.log("Postal codes included (e.g. Hlaing 11051, Thingangyun 11071).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
