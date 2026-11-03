/**
 * Create only three login users (no catalog / township / mall seed).
 * Run: node scripts/create-three-users.js
 *
 *   admin@qrshop.com     / password123  (admin)
 *   merchant@qrshop.com  / password123  (merchant)
 *   customer@qrshop.com  / password123  (buyer)
 */
import "../src/lib/env.js";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PASSWORD = "password123";

async function upsertUser({ role, name, email, phone, shopId }) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { role, name, email, phone, passwordHash, shopId, active: true },
    });
  }
  return prisma.user.create({
    data: { role, name, email, phone, passwordHash, shopId, active: true },
  });
}

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("mysql://")) {
    throw new Error("DATABASE_URL must be a mysql:// URL");
  }

  // Bare shop so merchant login has a shopId (no products / sample data).
  let shop = await prisma.shop.findUnique({ where: { slug: "demo-shop" } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        slug: "demo-shop",
        name: "Demo Shop",
        email: "merchant@qrshop.com",
        status: "approved",
        listed: true,
        features: { create: {} },
        delivery: { create: {} },
      },
    });
  }

  const admin = await upsertUser({
    role: "admin",
    name: "Platform Admin",
    email: "admin@qrshop.com",
    phone: null,
  });

  const merchant = await upsertUser({
    role: "merchant",
    name: "Demo Merchant",
    email: "merchant@qrshop.com",
    phone: "09100000001",
    shopId: shop.id,
  });

  const customer = await upsertUser({
    role: "buyer",
    name: "Demo Customer",
    email: "customer@qrshop.com",
    phone: "09100000002",
  });

  console.log("OK — three users ready (password: password123)");
  console.log({
    admin: admin.email,
    merchant: merchant.email,
    customer: customer.email,
    shopId: shop.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
