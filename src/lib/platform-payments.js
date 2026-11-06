/**
 * Platform payment catalog helpers (Admin-owned).
 */
import { prisma } from "./prisma.js";

export const BUILTIN_PLATFORM_PAYMENTS = [
  {
    id: "cod",
    label: "Cash on delivery",
    shortLabel: "COD",
    subtitle: "Buyer pays when they receive the order",
    needsQr: false,
    active: true,
    builtin: true,
    sort: 10,
  },
  {
    id: "kpay",
    label: "KBZ Pay",
    shortLabel: "KBZ Pay",
    subtitle: "KBZ Pay — merchants upload their shop QR",
    needsQr: true,
    active: true,
    builtin: true,
    sort: 20,
  },
  {
    id: "uabpay",
    label: "UAB Pay",
    shortLabel: "UAB Pay",
    subtitle: "Merchants upload their UAB Pay QR",
    needsQr: true,
    active: true,
    builtin: true,
    sort: 30,
  },
  {
    id: "ayapay",
    label: "AYA Pay",
    shortLabel: "AYA Pay",
    subtitle: "Merchants upload their AYA Pay QR",
    needsQr: true,
    active: true,
    builtin: true,
    sort: 40,
  },
  {
    id: "cbpay",
    label: "CB Pay",
    shortLabel: "CB Pay",
    subtitle: "Merchants upload their CB Pay QR",
    needsQr: true,
    active: true,
    builtin: true,
    sort: 50,
  },
  {
    id: "mmqr",
    label: "MMQR",
    shortLabel: "MMQR",
    subtitle: "National QR — merchants upload their MMQR image",
    needsQr: true,
    active: true,
    builtin: true,
    sort: 60,
  },
  {
    id: "cash",
    label: "Cash (in-store)",
    shortLabel: "Cash",
    subtitle: "POS / in-store cash",
    needsQr: false,
    active: true,
    builtin: true,
    sort: 70,
  },
];

export function mapPlatformPayment(row) {
  return {
    id: row.id,
    label: row.label,
    shortLabel: row.shortLabel,
    subtitle: row.subtitle || "",
    needsQr: Boolean(row.needsQr),
    active: Boolean(row.active),
    builtin: Boolean(row.builtin),
    sort: row.sort ?? 0,
    createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
  };
}

/** Ensure built-in rows exist (idempotent). */
export async function ensureBuiltinPlatformPayments() {
  for (const b of BUILTIN_PLATFORM_PAYMENTS) {
    await prisma.platformPaymentMethod.upsert({
      where: { id: b.id },
      create: { ...b },
      update: {
        label: b.label,
        shortLabel: b.shortLabel,
        subtitle: b.subtitle,
        needsQr: b.needsQr,
        builtin: true,
        // keep active/sort as Admin set them
      },
    });
  }
}

export async function listPlatformPayments({ activeOnly = false } = {}) {
  await ensureBuiltinPlatformPayments();
  const rows = await prisma.platformPaymentMethod.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ sort: "asc" }, { label: "asc" }],
  });
  return rows.map(mapPlatformPayment);
}

export async function isPlatformPaymentActive(methodId) {
  const id = String(methodId || "").trim().toLowerCase();
  if (!id) return false;
  await ensureBuiltinPlatformPayments();
  const row = await prisma.platformPaymentMethod.findUnique({ where: { id } });
  return Boolean(row?.active);
}
