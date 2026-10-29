/**
 * Quick connectivity check for Supabase.
 * Usage: node scripts/check-db.js
 */
import "../src/lib/env.js";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL || "";
const host = (url.match(/@([^:/?]+)/) || [])[1] || "(none)";
console.log("Using host:", host);

if (!url || url.includes("[YOUR-PASSWORD]") || url.includes("USER:PASSWORD")) {
  console.error("DATABASE_URL missing or still a placeholder");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const r = await prisma.$queryRawUnsafe(
    "SELECT current_database() AS db, current_user AS usr, NOW() AS now",
  );
  console.log("CONNECT_OK", r);
  process.exitCode = 0;
} catch (e) {
  console.error("CONNECT_FAIL", String(e.message || e).split("\n").slice(0, 4).join(" "));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
