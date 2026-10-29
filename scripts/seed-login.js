/**
 * Seed demo accounts + B2C/B2B sample (Supabase Postgres).
 * Run: npm run db:seed   (needs DATABASE_URL)
 */
import "../src/lib/env.js";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertUser({
  role,
  name,
  email,
  phone,
  password,
  shopId,
  address,
}) {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
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

async function main() {
  if (
    !process.env.DATABASE_URL ||
    process.env.DATABASE_URL.includes("USER:PASSWORD") ||
    process.env.DATABASE_URL.includes("[YOUR-PASSWORD]")
  ) {
    throw new Error(
      "Set a real Supabase DATABASE_URL in .env before seeding (see .env.example)",
    );
  }

  let shop = await prisma.shop.findUnique({ where: { slug: "shop-nova" } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        id: "shop-nova",
        slug: "shop-nova",
        name: "Nova Living",
        email: "admin@gmail.com",
        phone: "09777100200",
        status: "approved",
        listed: true,
        tagline: "Sample merchant shop",
        features: {
          create: {
            listingMode: "both",
            b2cEnabled: true,
            b2bEnabled: true,
            staffEnabled: true,
            deliveryModuleEnabled: true,
          },
        },
        delivery: { create: { pickupEnabled: true, deliveryEnabled: true } },
      },
    });
  } else {
    shop = await prisma.shop.update({
      where: { id: shop.id },
      data: { status: "approved", listed: true },
    });
    await prisma.shopFeatures.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        listingMode: "both",
        b2cEnabled: true,
        b2bEnabled: true,
        staffEnabled: true,
      },
      update: {
        listingMode: "both",
        b2cEnabled: true,
        b2bEnabled: true,
        staffEnabled: true,
      },
    });
  }

  const superAdmin = await upsertUser({
    role: "super_admin",
    name: "Super Admin",
    email: "super@qrshop.com",
    phone: null,
    password: "11111",
  });

  const admin = await upsertUser({
    role: "admin",
    name: "Platform Admin",
    email: "qrshop@gmail.com",
    phone: null,
    password: "11111",
  });

  const merchant = await upsertUser({
    role: "merchant",
    name: "Nova Owner",
    email: "admin@gmail.com",
    phone: "09777100200",
    password: "1111",
    shopId: shop.id,
  });

  const staff = await upsertUser({
    role: "staff",
    name: "Nova Staff",
    email: null,
    phone: "09777100201",
    password: "1234",
    shopId: shop.id,
  });

  // QR Shop township catalog (data/townships.json) + publish demo areas
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  const seedTw = spawnSync(process.execPath, ["scripts/seed-townships.js"], {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8",
  });
  if (seedTw.status !== 0) {
    console.warn(seedTw.stdout || "");
    console.warn(seedTw.stderr || "");
    throw new Error("db:seed:townships failed — run npm run db:seed:townships");
  }
  console.log(seedTw.stdout || "");

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
  await prisma.buyerAddress.deleteMany({ where: { userId: buyer.id } });
  await prisma.buyerAddress.create({
    data: {
      userId: buyer.id,
      label: "Home",
      street: "No. 12, Example Street",
      townshipId: "yangon-hlaing-11051",
      location: "No. 12, Example Street, Hlaing, Yangon 11051",
      isDefault: true,
    },
  });

  // One-time / QR phone open for B2B
  await prisma.guestPhoneAccess.upsert({
    where: {
      shopId_phone: { shopId: shop.id, phone: "09998887766" },
    },
    create: {
      shopId: shop.id,
      phone: "09998887766",
      b2bAllowed: true,
      note: "Sample one-time B2B phone",
    },
    update: { b2bAllowed: true },
  });

  const product = await prisma.product.upsert({
    where: { id: "prod-nova-chair" },
    create: {
      id: "prod-nova-chair",
      shopId: shop.id,
      name: "Nova Chair",
      priceKs: 85000,
      priceB2bKs: 65000,
      stock: 40,
      active: true,
      showOnWebsite: true,
    },
    update: {
      priceKs: 85000,
      priceB2bKs: 65000,
      active: true,
    },
  });

  console.log("Seeded:");
  console.log("  Super admin  super@qrshop.com / 11111     →", superAdmin.id);
  console.log("  Admin        qrshop@gmail.com / 11111     →", admin.id);
  console.log("  Merchant     admin@gmail.com  / 1111      →", merchant.id, "shop", shop.id);
  console.log("  Staff        09777100201      / 1234      →", staff.id);
  console.log("  Buyer        09111222333      / 1111      →", buyer.id, "(has address)");
  // Merchant Delivery zones — fee per township (postal shown in UI)
  await prisma.shopDelivery.upsert({
    where: { shopId: shop.id },
    create: {
      shopId: shop.id,
      deliveryEnabled: true,
      pickupEnabled: true,
      zonesJson: [
        { townshipId: "yangon-hlaing-11051", feeKs: 2000 },
        { townshipId: "yangon-thingangyun-11071", feeKs: 2500 },
      ],
    },
    update: {
      deliveryEnabled: true,
      pickupEnabled: true,
      zonesJson: [
        { townshipId: "yangon-hlaing-11051", feeKs: 2000 },
        { townshipId: "yangon-thingangyun-11071", feeKs: 2500 },
      ],
    },
  });

  console.log("  Guest phone  09998887766  B2B allowed on shop-nova");
  console.log("  Product      ", product.name, "B2C", product.priceKs, "B2B", product.priceB2bKs);
  console.log("  Delivery     Hlaing 11051 → 2000 Ks · Thingangyun 11071 → 2500 Ks");
  console.log("");
  console.log("Merchant zones: GET/PUT /api/merchant/delivery");
  console.log("Create a guest QR after login as merchant:");
  console.log('  POST /api/merchant/guest-qr  { "phone":"09998887766", "b2bAllowed":true }');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
