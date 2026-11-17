/**
 * Admin-controlled product badge / ribbon labels.
 * Seeds defaults, then imports any leftover free-text Product.badge values
 * so existing SKUs keep working under Admin control.
 */
import { prisma } from "./prisma.js";
import { ensureProductBadgeTable } from "./ensure-schema.js";

const DEFAULT_BADGES = [
  { id: "new", name: "NEW", nameMy: "အသစ်" },
  { id: "bestseller", name: "BESTSELLER", nameMy: "အရောင်းရဆုံး" },
  { id: "sale", name: "SALE", nameMy: "လျှော့ဈေး" },
  { id: "popular", name: "POPULAR", nameMy: "လူကြိုက်များ" },
];

function slugFromName(raw) {
  const ascii = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  if (ascii.length >= 2) return ascii;
  return `badge-${Date.now().toString(36)}`;
}

export async function ensureProductBadgesSeeded() {
  await ensureProductBadgeTable();
  const count = await prisma.productBadge.count();
  if (count === 0) {
    for (let i = 0; i < DEFAULT_BADGES.length; i++) {
      const b = DEFAULT_BADGES[i];
      await prisma.productBadge.upsert({
        where: { id: b.id },
        create: {
          id: b.id,
          name: b.name,
          nameMy: b.nameMy,
          sortOrder: i * 10,
          active: true,
        },
        update: {},
      });
    }
  }

  /** Import leftover free-text badges from products into the catalog. */
  const products = await prisma.product.findMany({
    where: { badge: { not: null } },
    select: { id: true, badge: true },
  });
  const catalog = await prisma.productBadge.findMany();
  const byLower = new Map(
    catalog.map((b) => [b.name.trim().toLowerCase(), b]),
  );

  let imported = 0;
  let normalized = 0;
  let sortBase =
    (await prisma.productBadge.aggregate({ _max: { sortOrder: true } }))._max
      .sortOrder ?? 0;

  for (const p of products) {
    const raw = String(p.badge || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    let match = byLower.get(key);
    if (!match) {
      sortBase += 10;
      let id = slugFromName(raw);
      const idTaken = await prisma.productBadge.findUnique({ where: { id } });
      if (idTaken) id = `${id}-${Date.now().toString(36).slice(-4)}`;
      match = await prisma.productBadge.create({
        data: {
          id,
          name: raw,
          nameMy: null,
          sortOrder: sortBase,
          active: true,
        },
      });
      byLower.set(key, match);
      imported += 1;
    }
    if (match.name !== raw) {
      await prisma.product.update({
        where: { id: p.id },
        data: { badge: match.name },
      });
      normalized += 1;
    }
  }

  const after = await prisma.productBadge.count();
  return { count: after, imported, normalized };
}

export async function listActiveProductBadges() {
  await ensureProductBadgesSeeded();
  return prisma.productBadge.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Resolve a free-text badge to a catalog name, or null if empty/invalid. */
export async function resolveProductBadgeName(raw, { allowInactive = false } = {}) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  await ensureProductBadgesSeeded();
  const rows = await prisma.productBadge.findMany({
    where: allowInactive ? undefined : { active: true },
  });
  const hit = rows.find(
    (b) => b.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return hit ? hit.name : undefined;
}
