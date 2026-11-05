/**
 * Ensure 3 approved sample merchants + mall products + orders for
 * Marketplace / Merchant / Admin (Supabase).
 *
 * Run: node scripts/seed-three-merchants.js
 * (Also invoked from npm run db:seed)
 */
import "../src/lib/env.js";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const IMG = {
  chair:
    "https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&w=800&q=80",
  lamp: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80",
  phone:
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80",
  earbuds:
    "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80",
  rice: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80",
  oil: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=800&q=80",
};

async function upsertUser({ role, name, email, phone, password, shopId, address }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findFirst({
    where: {
      OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { role, name, email, phone, passwordHash, shopId, address },
    });
  }
  return prisma.user.create({
    data: { role, name, email, phone, passwordHash, shopId, address },
  });
}

async function ensureShop(def) {
  let shop = await prisma.shop.findUnique({ where: { id: def.id } });
  if (!shop) {
    shop = await prisma.shop.findUnique({ where: { slug: def.slug } });
  }
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        id: def.id,
        slug: def.slug,
        name: def.name,
        email: def.email,
        phone: def.phone,
        location: def.location,
        status: "approved",
        listed: true,
        tagline: def.tagline,
        aboutText: def.aboutText || "",
        features: {
          create: {
            listingMode: "both",
            b2cEnabled: true,
            b2bEnabled: true,
            deliveryModuleEnabled: true,
            ratingsReviewsEnabled: true,
          },
        },
        delivery: {
          create: {
            pickupEnabled: true,
            deliveryEnabled: true,
            zonesJson: def.zones,
          },
        },
      },
    });
  } else {
    shop = await prisma.shop.update({
      where: { id: shop.id },
      data: {
        name: def.name,
        email: def.email,
        phone: def.phone,
        location: def.location,
        status: "approved",
        listed: true,
        tagline: def.tagline,
        aboutText: def.aboutText || "",
      },
    });
    await prisma.shopFeatures.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        listingMode: "both",
        b2cEnabled: true,
        b2bEnabled: true,
        deliveryModuleEnabled: true,
        ratingsReviewsEnabled: true,
      },
      update: {
        listingMode: "both",
        b2cEnabled: true,
        b2bEnabled: true,
        deliveryModuleEnabled: true,
      },
    });
    await prisma.shopDelivery.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        pickupEnabled: true,
        deliveryEnabled: true,
        zonesJson: def.zones,
      },
      update: {
        pickupEnabled: true,
        deliveryEnabled: true,
        zonesJson: def.zones,
      },
    });
  }

  await prisma.shopPaymentMethod.upsert({
    where: { shopId_method: { shopId: shop.id, method: "cod" } },
    create: { shopId: shop.id, method: "cod", enabled: true },
    update: { enabled: true },
  });
  await prisma.shopPaymentMethod.upsert({
    where: { shopId_method: { shopId: shop.id, method: "kpay" } },
    create: { shopId: shop.id, method: "kpay", enabled: true },
    update: { enabled: true },
  });

  await upsertUser({
    role: "merchant",
    name: def.ownerName,
    email: def.email,
    phone: def.phone,
    password: def.password,
    shopId: shop.id,
  });

  const products = [];
  for (const p of def.products) {
    const row = await prisma.product.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        shopId: shop.id,
        name: p.name,
        priceKs: p.priceKs,
        priceB2bKs: p.priceB2bKs ?? null,
        stock: p.stock ?? 30,
        active: true,
        showOnWebsite: true,
        sellOnOwnPage: true,
        sellOnMarketplace: true,
        sellOnApp: true,
        imageUrl: p.imageUrl,
        categoryId: p.categoryId ?? null,
        badge: p.badge ?? null,
      },
      update: {
        shopId: shop.id,
        name: p.name,
        priceKs: p.priceKs,
        priceB2bKs: p.priceB2bKs ?? null,
        stock: p.stock ?? 30,
        active: true,
        showOnWebsite: true,
        sellOnOwnPage: true,
        sellOnMarketplace: true,
        sellOnApp: true,
        imageUrl: p.imageUrl,
        categoryId: p.categoryId ?? null,
        badge: p.badge ?? null,
      },
    });
    products.push(row);
  }

  return { shop, products };
}

async function ensureOrder(def) {
  const existing = await prisma.order.findUnique({ where: { id: def.id } });
  if (existing) {
    await prisma.order.update({
      where: { id: def.id },
      data: {
        stage: def.stage,
        totalKs: def.totalKs,
        subtotalKs: def.subtotalKs,
      },
    });
    return existing;
  }
  return prisma.order.create({
    data: {
      id: def.id,
      shopId: def.shopId,
      buyerId: def.buyerId,
      buyerName: def.buyerName,
      buyerPhone: def.buyerPhone,
      address: def.address,
      channel: "b2c",
      fulfillment: def.fulfillment,
      payment: def.payment,
      source: "marketplace",
      stage: def.stage,
      townshipId: def.townshipId,
      townshipName: def.townshipName,
      deliveryFeeKs: def.deliveryFeeKs,
      subtotalKs: def.subtotalKs,
      totalKs: def.totalKs,
      lines: {
        create: def.lines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          qty: l.qty,
          unitKs: l.unitKs,
          lineTotalKs: l.lineTotalKs,
        })),
      },
    },
  });
}

async function main() {
  if (
    !process.env.DATABASE_URL ||
    process.env.DATABASE_URL.includes("USER:PASSWORD") ||
    process.env.DATABASE_URL.includes("[YOUR-PASSWORD]")
  ) {
    throw new Error("Set a real DATABASE_URL in .env before seeding");
  }

  const zones = [
    { townshipId: "yangon-hlaing-11051", feeKs: 2000 },
    { townshipId: "yangon-thingangyun-11071", feeKs: 2500 },
  ];

  const shops = [
    {
      id: "shop-nova",
      slug: "shop-nova",
      name: "Nova Living",
      email: "admin@gmail.com",
      phone: "09777100200",
      password: "1111",
      ownerName: "Nova Owner",
      location: "Hlaing, Yangon",
      tagline: "Home & living sample shop",
      aboutText:
        "Nova Living brings thoughtfully chosen home & living products to Yangon. From furniture and lighting to everyday household essentials, we curate quality pieces that fit real homes — with clear pricing, careful packing, and friendly local service.",
      zones,
      products: [
        {
          id: "prod-nova-chair",
          name: "Nova Chair",
          priceKs: 85000,
          priceB2bKs: 65000,
          imageUrl: IMG.chair,
          categoryId: "home",
          badge: "Popular",
          stock: 40,
        },
        {
          id: "prod-nova-lamp",
          name: "Nova Desk Lamp",
          priceKs: 45000,
          priceB2bKs: 36000,
          imageUrl: IMG.lamp,
          categoryId: "home",
          stock: 25,
        },
        {
          id: "prod-nova-sofa",
          name: "Nova Lounge Sofa",
          priceKs: 450000,
          priceB2bKs: 380000,
          imageUrl:
            "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80",
          categoryId: "home",
          badge: "New",
          stock: 8,
        },
        {
          id: "prod-nova-shelf",
          name: "Nova Oak Shelf",
          priceKs: 125000,
          priceB2bKs: 99000,
          imageUrl:
            "https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=800&q=80",
          categoryId: "home",
          stock: 15,
        },
        {
          id: "prod-nova-vase",
          name: "Nova Ceramic Vase",
          priceKs: 28000,
          priceB2bKs: 22000,
          imageUrl:
            "https://images.unsplash.com/photo-1581783898377-1c85bf937427?auto=format&fit=crop&w=800&q=80",
          categoryId: "home",
          badge: "Deal",
          stock: 30,
        },
        {
          id: "prod-nova-table",
          name: "Nova Coffee Table",
          priceKs: 185000,
          priceB2bKs: 149000,
          imageUrl:
            "https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?auto=format&fit=crop&w=800&q=80",
          categoryId: "home",
          badge: "Popular",
          stock: 12,
        },
      ],
    },
    {
      id: "shop-irrawaddy",
      slug: "shop-irrawaddy",
      name: "Irrawaddy Tech",
      email: "irrawaddy@gmail.com",
      phone: "09777100300",
      password: "1111",
      ownerName: "Aye Chan",
      location: "Kamayut, Yangon",
      tagline: "Phones & gadgets",
      zones,
      products: [
        {
          id: "prod-irra-phone",
          name: "Pulse Phone Case",
          priceKs: 12000,
          priceB2bKs: 9000,
          imageUrl: IMG.phone,
          categoryId: "electronics",
          badge: "New",
          stock: 80,
        },
        {
          id: "prod-irra-buds",
          name: "River Buds",
          priceKs: 55000,
          priceB2bKs: 42000,
          imageUrl: IMG.earbuds,
          categoryId: "electronics",
          stock: 35,
        },
      ],
    },
    {
      id: "shop-golden",
      slug: "shop-golden",
      name: "Golden Basket",
      email: "golden@gmail.com",
      phone: "09777100400",
      password: "1111",
      ownerName: "Su Myat",
      location: "Thingangyun, Yangon",
      tagline: "Daily groceries",
      zones,
      products: [
        {
          id: "prod-golden-rice",
          name: "Paw San Rice 5kg",
          priceKs: 18000,
          priceB2bKs: 15000,
          imageUrl: IMG.rice,
          categoryId: "grocery",
          stock: 100,
        },
        {
          id: "prod-golden-oil",
          name: "Sunflower Oil 1L",
          priceKs: 8500,
          priceB2bKs: 7000,
          imageUrl: IMG.oil,
          categoryId: "grocery",
          badge: "Deal",
          stock: 60,
        },
      ],
    },
  ];

  const created = [];
  for (const def of shops) {
    created.push(await ensureShop(def));
  }

  // Platform admin + buyer (shared across apps)
  await upsertUser({
    role: "admin",
    name: "Platform Admin",
    email: "qrshop@gmail.com",
    phone: null,
    password: "11111",
  });
  await upsertUser({
    role: "super_admin",
    name: "Super Admin",
    email: "super@qrshop.com",
    phone: null,
    password: "11111",
  });

  const buyer = await upsertUser({
    role: "buyer",
    name: "Tester Buyer",
    email: "tester@gmail.com",
    phone: "09111222333",
    password: "1111",
    address: "No. 12, Example Street, Hlaing, Yangon 11051",
  });
  await prisma.user.update({
    where: { id: buyer.id },
    data: { townshipId: "yangon-hlaing-11051" },
  });

  const [nova, irra, golden] = created;

  // Nova staff PIN login
  await upsertUser({
    role: "staff",
    name: "Nova Staff",
    email: null,
    phone: "09777100201",
    password: "1234",
    shopId: nova.shop.id,
  });

  await ensureOrder({
    id: "ord-sample-nova-1",
    shopId: nova.shop.id,
    buyerId: buyer.id,
    buyerName: "Tester Buyer",
    buyerPhone: "09111222333",
    address: "No. 12, Example Street, Hlaing, Yangon 11051",
    fulfillment: "delivery",
    payment: "cod",
    stage: "request",
    townshipId: "yangon-hlaing-11051",
    townshipName: "Hlaing",
    deliveryFeeKs: 2000,
    subtotalKs: 130000,
    totalKs: 132000,
    lines: [
      {
        productId: "prod-nova-chair",
        productName: "Nova Chair",
        qty: 1,
        unitKs: 85000,
        lineTotalKs: 85000,
      },
      {
        productId: "prod-nova-lamp",
        productName: "Nova Desk Lamp",
        qty: 1,
        unitKs: 45000,
        lineTotalKs: 45000,
      },
    ],
  });

  await ensureOrder({
    id: "ord-sample-irra-1",
    shopId: irra.shop.id,
    buyerId: buyer.id,
    buyerName: "Tester Buyer",
    buyerPhone: "09111222333",
    address: "No. 12, Example Street, Hlaing, Yangon 11051",
    fulfillment: "delivery",
    payment: "kpay",
    stage: "out_for_delivery",
    townshipId: "yangon-hlaing-11051",
    townshipName: "Hlaing",
    deliveryFeeKs: 2000,
    subtotalKs: 55000,
    totalKs: 57000,
    lines: [
      {
        productId: "prod-irra-buds",
        productName: "River Buds",
        qty: 1,
        unitKs: 55000,
        lineTotalKs: 55000,
      },
    ],
  });

  await ensureOrder({
    id: "ord-sample-golden-1",
    shopId: golden.shop.id,
    buyerId: buyer.id,
    buyerName: "Tester Buyer",
    buyerPhone: "09111222333",
    address: "Pickup at Golden Basket",
    fulfillment: "pickup",
    payment: "cod",
    stage: "ready_pickup",
    townshipId: null,
    townshipName: null,
    deliveryFeeKs: 0,
    subtotalKs: 26500,
    totalKs: 26500,
    lines: [
      {
        productId: "prod-golden-rice",
        productName: "Paw San Rice 5kg",
        qty: 1,
        unitKs: 18000,
        lineTotalKs: 18000,
      },
      {
        productId: "prod-golden-oil",
        productName: "Sunflower Oil 1L",
        qty: 1,
        unitKs: 8500,
        lineTotalKs: 8500,
      },
    ],
  });

  await prisma.guide.upsert({
    where: { id: "guide-getting-started" },
    create: {
      id: "guide-getting-started",
      title: "Getting started on QR Shop",
      body:
        "Approve your shop listing, add products with https images, turn on Delivery zones, then publish SKUs to the mall.\n\nUse Modules to enable Staff, POS, and Ratings when you need them.",
      published: true,
    },
    update: {
      title: "Getting started on QR Shop",
      published: true,
    },
  });

  await prisma.guide.upsert({
    where: { id: "guide-delivery-fees" },
    create: {
      id: "guide-delivery-fees",
      title: "Set township delivery fees",
      body:
        "Open Delivery, pick Admin-published townships, and set a fee in kyats. Marketplace checkout uses those fees automatically.",
      published: true,
    },
    update: { published: true },
  });

  // Mall meta + welcome announcement
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  for (const script of ["scripts/seed-mall-meta.js", "scripts/seed-announcements.js"]) {
    const r = spawnSync(process.execPath, [script], {
      cwd: rootDir,
      env: process.env,
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.warn(r.stdout || "");
      console.warn(r.stderr || "");
      console.warn(`Warn: ${script} exited ${r.status}`);
    } else if (r.stdout) {
      console.log(r.stdout.trim());
    }
  }

  const shopCount = await prisma.shop.count({ where: { status: "approved" } });
  const productCount = await prisma.product.count({
    where: { active: true, showOnWebsite: true },
  });
  const orderCount = await prisma.order.count();

  console.log("");
  console.log("Sample platform ready for Marketplace · Merchant · Admin");
  console.log(`  Shops (approved): ${shopCount}`);
  console.log(`  Mall products:    ${productCount}`);
  console.log(`  Orders:           ${orderCount}`);
  console.log("");
  console.log("Merchant logins (password 1111):");
  console.log("  admin@gmail.com      → Nova Living");
  console.log("  irrawaddy@gmail.com  → Irrawaddy Tech");
  console.log("  golden@gmail.com     → Golden Basket");
  console.log("Admin:  qrshop@gmail.com / 11111");
  console.log("Buyer:  09111222333 / 1111");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
