import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

/**
 * Supabase Session pooler (:5432) caps ~15 clients — Vercel serverless blows past that
 * (EMAXCONNSESSION) and catalog/chat die. Prefer Transaction pooler (:6543) + one
 * connection per isolate for Prisma + PgBouncer.
 */
function datasourceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const pooler = /pooler\.supabase\.com$/i.test(u.hostname);
    if (pooler && (u.port === "5432" || u.port === "")) {
      u.port = "6543";
    }
    if (pooler || u.searchParams.get("pgbouncer") === "true") {
      u.searchParams.set("pgbouncer", "true");
      if (!u.searchParams.has("connection_limit")) {
        u.searchParams.set("connection_limit", "1");
      }
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl() } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

/** Always reuse across warm serverless invocations (not only in development). */
globalForPrisma.prisma = prisma;
