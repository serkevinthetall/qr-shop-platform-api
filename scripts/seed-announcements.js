/**
 * Seed a welcome announcement for Marketplace customers + all merchants.
 */
import "../src/lib/env.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const id = "ann-welcome";
  const row = await prisma.announcement.upsert({
    where: { id },
    create: {
      id,
      title: "Welcome to QR Shop",
      body: "Thanks for shopping with us. Browse the mall, save deals, and checkout with COD or wallet pay.",
      sendToCustomers: true,
      merchantScope: "all",
      merchantIdsJson: "[]",
      published: true,
      authorName: "QR Shop Admin",
    },
    update: {
      title: "Welcome to QR Shop",
      body: "Thanks for shopping with us. Browse the mall, save deals, and checkout with COD or wallet pay.",
      sendToCustomers: true,
      merchantScope: "all",
      published: true,
      authorName: "QR Shop Admin",
    },
  });
  console.log("Announcement seeded:", row.id, row.title, "published=", row.published);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
