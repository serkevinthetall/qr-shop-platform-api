/**
 * Ensure mall Category rows exist in DB (from mall-meta defaults).
 * Admin lists DB only; catalog used to fall back to JSON when empty —
 * that mismatch left Admin blank while Merchant still saw defaults.
 */
import { prisma } from "./prisma.js";
import { defaultCategories } from "./mall-meta.js";

export async function ensureCategoriesSeeded() {
  const count = await prisma.category.count();
  if (count > 0) return { seeded: false, count };
  const cats = defaultCategories();
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i];
    if (!c?.id || !c?.name) continue;
    await prisma.category.upsert({
      where: { id: String(c.id) },
      create: {
        id: String(c.id),
        name: String(c.name),
        nameMy: c.nameMy ? String(c.nameMy) : null,
        icon: c.icon ? String(c.icon) : null,
        imageUrl: c.imageUrl ? String(c.imageUrl) : null,
        sortOrder: i * 10,
        active: true,
      },
      update: {},
    });
  }
  const after = await prisma.category.count();
  return { seeded: true, count: after };
}
