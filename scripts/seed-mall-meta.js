/**
 * Seed Category + MallHero + platform payments + sample ads from mall-meta.json
 */
import "../src/lib/env.js";
import { prisma } from "../src/lib/prisma.js";
import { defaultCategories, defaultHero } from "../src/lib/mall-meta.js";
import { ensureBuiltinPlatformPayments } from "../src/lib/platform-payments.js";

async function main() {
  const cats = defaultCategories();
  let n = 0;
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i];
    await prisma.category.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        name: c.name,
        nameMy: c.nameMy ?? null,
        icon: c.icon ?? null,
        imageUrl: c.imageUrl ?? null,
        sortOrder: i,
        active: true,
      },
      update: {
        name: c.name,
        nameMy: c.nameMy ?? null,
        icon: c.icon ?? null,
        imageUrl: c.imageUrl ?? null,
        sortOrder: i,
        active: true,
      },
    });
    n += 1;
  }

  const hero = defaultHero();
  await prisma.mallHero.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      imageUrl: hero.imageUrl || "",
      eyebrow: hero.eyebrow || "",
      title: hero.title || "Shop Myanmar",
      subtitle: hero.subtitle || "",
      cta: hero.cta || "Browse",
      href: "/products",
    },
    update: {},
  });

  await prisma.platformSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });

  await ensureBuiltinPlatformPayments();

  const adCount = await prisma.ad.count();
  if (adCount === 0) {
    await prisma.ad.createMany({
      data: [
        {
          title: "Weekend mall deals",
          subtitle: "Save on groceries, home, and beauty from local shops.",
          cta: "Shop deals",
          imageUrl:
            "https://images.unsplash.com/photo-1607083206869-4c79793e3030?auto=format&fit=crop&w=1600&q=90",
          href: "/products?deal=1",
          sortOrder: 0,
        },
        {
          title: "New shops this week",
          subtitle: "Discover fresh sellers joining QR Shop Myanmar.",
          cta: "Browse",
          imageUrl:
            "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=90",
          href: "/products",
          sortOrder: 1,
        },
      ],
    });
  }

  console.log(`Categories seeded: ${n}`);
  console.log("MallHero: default");
  console.log("PlatformSettings: default");
  console.log(`Platform payments: ${await prisma.platformPaymentMethod.count()}`);
  console.log(`Ads: ${await prisma.ad.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
