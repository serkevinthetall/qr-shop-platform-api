/**
 * Seed Sample Shop (demo-shop) with 50 grocery products + size/pack variants.
 * Photos = TheMealDB ingredient shots + Wikimedia Commons (name-matched).
 * Prices in Myanmar kyats.
 *
 *   node --env-file=.env.local scripts/seed-sample-shop-grocery.js
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/** Prefer Hostinger URL from .env.local (local .env often points at 127.0.0.1). */
function loadDatabaseUrl() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(resolve(root, file), "utf8");
      const m = text.match(/^DATABASE_URL=(.+)$/m);
      if (!m) continue;
      const url = m[1].trim().replace(/^["']|["']$/g, "");
      if (!url) continue;
      if (file === ".env" && /127\.0\.0\.1|localhost/.test(url)) continue;
      process.env.DATABASE_URL = url;
      return;
    } catch {
      /* try next */
    }
  }
}
loadDatabaseUrl();

const prisma = new PrismaClient();

/** Name-matched product photos (TheMealDB ingredient packs + Wikimedia Commons). */
const meal = (name) =>
  `https://www.themealdb.com/images/ingredients/${encodeURIComponent(name)}.png`;
const wiki = (file) =>
  `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(file)}&width=800`;
const IMG = {
  rice: meal("Basmati Rice"),
  oil: meal("Sunflower Oil"),
  sesameOil: meal("Sesame Seed Oil"),
  oliveOil: meal("Olive Oil"),
  noodles: wiki("Five_packs_of_shrimp-flavoured_instant_noodles.jpg"),
  vermicelli: meal("Vermicelli"),
  eggs: meal("Egg"),
  milk: meal("Milk"),
  condensed: wiki("Condensed_and_evaporated_milk.jpg"),
  bread: meal("Bread"),
  coffee: meal("Coffee"),
  teaBags: meal("Tea"),
  lahpet: wiki("Pickled_tea_leaves_salad,_Myanmar.jpg"),
  whiteSugar: meal("Sugar"),
  brownSugar: meal("Brown Sugar"),
  salt: meal("Salt"),
  chili: meal("Chilli Powder"),
  turmeric: meal("Turmeric"),
  onion: meal("Onion"),
  garlic: meal("Garlic"),
  potato: meal("Potato"),
  tomato: meal("Tomato"),
  banana: meal("Banana"),
  apple: meal("Apple"),
  orange: meal("Orange"),
  fish: wiki("Dried_and_salted_cod.jpg"),
  chicken: wiki("Raw_chicken_drumsticks_(3312851753).jpg"),
  beans: wiki("Green_gram_gs.jpg"),
  lentils: meal("Red Lentils"),
  flour: meal("Flour"),
  chips: wiki("Potato-Chips.jpg"),
  biscuits: meal("Digestive Biscuits"),
  soda: meal("Coca-Cola"),
  water: meal("Water"),
  juice: meal("Orange Juice"),
  yogurt: meal("Yogurt"),
  butter: meal("Butter"),
  cheese: meal("Cheese"),
  fishSauce: meal("Fish Sauce"),
  soySauce: meal("Soy Sauce"),
  soap: wiki("Decorative_Soaps.jpg"),
  detergent: wiki("Oxydol_Soap_Powder_-_TWCMS-G3776_(16507577399).jpg"),
  tissue: wiki("Box_tissue.jpg"),
  honey: meal("Honey"),
  peanut: meal("Peanut Butter"),
  coconut: meal("Coconut Milk"),
};

/**
 * 50 grocery product families. Each expands to size/pack variants.
 * Prices are retail MMK (ကျပ်).
 */
const FAMILIES = [
  { key: "rice-paw-san", name: "ပေါ်ဆန်မွှေး", img: IMG.rice, attr: "size", variants: [
    { value: "၁ ကီလို", priceKs: 4500, stock: 120 },
    { value: "၅ ကီလို", priceKs: 21000, stock: 80 },
    { value: "၁၀ ကီလို", priceKs: 40000, stock: 40 },
  ]},
  { key: "rice-zee-yar", name: "ဇီးယားဆန်", img: IMG.rice, attr: "size", variants: [
    { value: "၁ ကီလို", priceKs: 3200, stock: 100 },
    { value: "၅ ကီလို", priceKs: 15000, stock: 60 },
  ]},
  { key: "rice-sticky", name: "ကောက်ညှင်း", img: IMG.rice, attr: "size", variants: [
    { value: "၁ ကီလို", priceKs: 3800, stock: 90 },
    { value: "၅ ကီလို", priceKs: 18000, stock: 45 },
  ]},
  { key: "oil-palm", name: "စားအုန်းဆီ", img: IMG.oliveOil, attr: "size", variants: [
    { value: "၁ လီတာ", priceKs: 5500, stock: 100 },
    { value: "၂ လီတာ", priceKs: 10500, stock: 70 },
    { value: "၅ လီတာ", priceKs: 25000, stock: 35 },
  ]},
  { key: "oil-peanut", name: "မြေပဲဆီ", img: IMG.oliveOil, attr: "size", variants: [
    { value: "၅၀၀ မီလီ", priceKs: 4500, stock: 80 },
    { value: "၁ လီတာ", priceKs: 8500, stock: 60 },
  ]},
  { key: "oil-sesame", name: "နှမ်းဆီ", img: IMG.sesameOil, attr: "size", variants: [
    { value: "၂၅၀ မီလီ", priceKs: 6000, stock: 70 },
    { value: "၅၀၀ မီလီ", priceKs: 11000, stock: 50 },
  ]},
  { key: "oil-sunflower", name: "နေကြာဆီ", img: IMG.oil, attr: "size", variants: [
    { value: "၁ လီတာ", priceKs: 7200, stock: 90 },
    { value: "၂ လီတာ", priceKs: 13500, stock: 40 },
  ]},
  { key: "instant-noodles", name: "အသင့်စားခေါက်ဆွဲ", img: IMG.noodles, attr: "pack", variants: [
    { value: "၁ ထုပ်", priceKs: 800, stock: 400 },
    { value: "၅ ထုပ်", priceKs: 3800, stock: 200 },
    { value: "ကတ်တွန် (၃၀)", priceKs: 22000, stock: 40 },
  ]},
  { key: "vermicelli", name: "ကြာဇံ", img: IMG.vermicelli, attr: "size", variants: [
    { value: "၂၀၀ ဂရမ်", priceKs: 1200, stock: 150 },
    { value: "၅၀၀ ဂရမ်", priceKs: 2800, stock: 100 },
  ]},
  { key: "eggs-farm", name: "ကြက်ဥ", img: IMG.eggs, attr: "pack", variants: [
    { value: "၁၀ လုံး", priceKs: 3500, stock: 80 },
    { value: "၃၀ လုံး", priceKs: 10000, stock: 50 },
  ]},
  { key: "milk-uht", name: "UHT နို့", img: IMG.milk, attr: "size", variants: [
    { value: "၁၈၀ မီလီ", priceKs: 900, stock: 200 },
    { value: "၁ လီတာ", priceKs: 4200, stock: 120 },
  ]},
  { key: "condensed-milk", name: "နို့ဆီ", img: IMG.condensed, attr: "size", variants: [
    { value: "၃၈၀ ဂရမ်", priceKs: 2800, stock: 100 },
    { value: "၁ ကီလို", priceKs: 6500, stock: 60 },
  ]},
  { key: "bread-sandwich", name: "ပေါင်မုန့်", img: IMG.bread, attr: "pack", variants: [
    { value: "အသေး", priceKs: 2500, stock: 60 },
    { value: "အကြီး", priceKs: 4000, stock: 40 },
  ]},
  { key: "coffee-mix", name: "ကော်ဖီမစ် ၃-in-1", img: IMG.coffee, attr: "pack", variants: [
    { value: "၂၀ အိတ်", priceKs: 4500, stock: 90 },
    { value: "၅၀ အိတ်", priceKs: 10500, stock: 50 },
  ]},
  { key: "coffee-beans", name: "ကော်ဖီမှုန့်", img: IMG.coffee, attr: "size", variants: [
    { value: "၂၀၀ ဂရမ်", priceKs: 8500, stock: 40 },
    { value: "၅၀၀ ဂရမ်", priceKs: 19000, stock: 25 },
  ]},
  { key: "green-tea", name: "လက်ဖက်စိမ်းအိတ်", img: IMG.teaBags, attr: "pack", variants: [
    { value: "၂၅ အိတ်", priceKs: 3500, stock: 70 },
    { value: "၁၀၀ အိတ်", priceKs: 12000, stock: 30 },
  ]},
  { key: "lahpet", name: "လက်ဖက်သုပ်", img: IMG.lahpet, attr: "size", variants: [
    { value: "၂၀၀ ဂရမ်", priceKs: 4500, stock: 55 },
    { value: "၅၀၀ ဂရမ်", priceKs: 10000, stock: 30 },
  ]},
  { key: "sugar-white", name: "သကြားဖြူ", img: IMG.whiteSugar, attr: "size", variants: [
    { value: "၁ ကီလို", priceKs: 2800, stock: 110 },
    { value: "၅ ကီလို", priceKs: 13000, stock: 50 },
  ]},
  { key: "sugar-brown", name: "သကြားညို", img: IMG.brownSugar, attr: "size", variants: [
    { value: "၅၀၀ ဂရမ်", priceKs: 2200, stock: 80 },
    { value: "၁ ကီလို", priceKs: 4000, stock: 45 },
  ]},
  { key: "salt-iodized", name: "ဆား", img: IMG.salt, attr: "size", variants: [
    { value: "၅၀၀ ဂရမ်", priceKs: 600, stock: 150 },
    { value: "၁ ကီလို", priceKs: 1000, stock: 100 },
  ]},
  { key: "chili-powder", name: "ငရုတ်မှုန့်", img: IMG.chili, attr: "size", variants: [
    { value: "၁၀၀ ဂရမ်", priceKs: 1500, stock: 90 },
    { value: "၅၀၀ ဂရမ်", priceKs: 6500, stock: 40 },
  ]},
  { key: "turmeric", name: "နနွင်းမှုန့်", img: IMG.turmeric, attr: "size", variants: [
    { value: "၁၀၀ ဂရမ်", priceKs: 1200, stock: 80 },
    { value: "၂၅၀ ဂရမ်", priceKs: 2800, stock: 50 },
  ]},
  { key: "onion-red", name: "ကြက်သွန်နီ", img: IMG.onion, attr: "size", variants: [
    { value: "၅၀၀ ဂရမ်", priceKs: 1800, stock: 70 },
    { value: "၁ ကီလို", priceKs: 3200, stock: 60 },
  ]},
  { key: "garlic", name: "ကြက်သွန်ဖြူ", img: IMG.garlic, attr: "size", variants: [
    { value: "၂၅၀ ဂရမ်", priceKs: 2200, stock: 65 },
    { value: "၅၀၀ ဂရမ်", priceKs: 4000, stock: 40 },
  ]},
  { key: "potato", name: "အာလူး", img: IMG.potato, attr: "size", variants: [
    { value: "၁ ကီလို", priceKs: 2500, stock: 80 },
    { value: "၅ ကီလို", priceKs: 11000, stock: 30 },
  ]},
  { key: "tomato", name: "ခရမ်းချဉ်သီး", img: IMG.tomato, attr: "size", variants: [
    { value: "၅၀၀ ဂရမ်", priceKs: 2000, stock: 55 },
    { value: "၁ ကီလို", priceKs: 3800, stock: 40 },
  ]},
  { key: "banana", name: "ငှက်ပျောသီး", img: IMG.banana, attr: "pack", variants: [
    { value: "၁ စည်း", priceKs: 2500, stock: 45 },
    { value: "၂ စည်း", priceKs: 4500, stock: 25 },
  ]},
  { key: "apple", name: "ပန်းသီး", img: IMG.apple, attr: "pack", variants: [
    { value: "၄ လုံး", priceKs: 6000, stock: 40 },
    { value: "၁ ကီလို", priceKs: 12000, stock: 30 },
  ]},
  { key: "orange", name: "လိမ္မော်သီး", img: IMG.orange, attr: "pack", variants: [
    { value: "၄ လုံး", priceKs: 4500, stock: 35 },
    { value: "၁ ကီလို", priceKs: 9000, stock: 25 },
  ]},
  { key: "dried-fish", name: "ငါးခြောက်", img: IMG.fish, attr: "size", variants: [
    { value: "၁၀၀ ဂရမ်", priceKs: 3500, stock: 50 },
    { value: "၂၅၀ ဂရမ်", priceKs: 8000, stock: 30 },
  ]},
  { key: "chicken-leg", name: "ကြက်ခြေထောက်", img: IMG.chicken, attr: "size", variants: [
    { value: "၅၀၀ ဂရမ်", priceKs: 5500, stock: 40 },
    { value: "၁ ကီလို", priceKs: 10500, stock: 30 },
  ]},
  { key: "beans-green", name: "ပဲတီ", img: IMG.beans, attr: "size", variants: [
    { value: "၅၀၀ ဂရမ်", priceKs: 3200, stock: 70 },
    { value: "၁ ကီလို", priceKs: 6000, stock: 45 },
  ]},
  { key: "lentils-toor", name: "ပဲထောပတ်", img: IMG.lentils, attr: "size", variants: [
    { value: "၅၀၀ ဂရမ်", priceKs: 3800, stock: 60 },
    { value: "၁ ကီလို", priceKs: 7200, stock: 35 },
  ]},
  { key: "flour-wheat", name: "ဂျုံမှုန့်", img: IMG.flour, attr: "size", variants: [
    { value: "၁ ကီလို", priceKs: 2500, stock: 90 },
    { value: "၅ ကီလို", priceKs: 11500, stock: 40 },
  ]},
  { key: "potato-chips", name: "အာလူးကြော်", img: IMG.chips, attr: "pack", variants: [
    { value: "အသေး", priceKs: 1500, stock: 120 },
    { value: "မိသားစု", priceKs: 4500, stock: 60 },
  ]},
  { key: "biscuits", name: "မုန့်ခြောက်", img: IMG.biscuits, attr: "pack", variants: [
    { value: "၁ ထုပ်", priceKs: 1200, stock: 150 },
    { value: "မိသားစုထုပ်", priceKs: 4500, stock: 70 },
  ]},
  { key: "cola", name: "ကိုလာအချိုရည်", img: IMG.soda, attr: "size", variants: [
    { value: "၃၃၀ မီလီ", priceKs: 1200, stock: 200 },
    { value: "၁.၅ လီတာ", priceKs: 2800, stock: 100 },
  ]},
  { key: "water-purified", name: "သောက်ရေသန့်", img: IMG.water, attr: "size", variants: [
    { value: "၅၀၀ မီလီ", priceKs: 400, stock: 300 },
    { value: "၁ လီတာ", priceKs: 700, stock: 200 },
    { value: "၂၀ လီတာ", priceKs: 2500, stock: 40 },
  ]},
  { key: "orange-juice", name: "လိမ္မော်ရည်", img: IMG.juice, attr: "size", variants: [
    { value: "၂၅၀ မီလီ", priceKs: 1500, stock: 80 },
    { value: "၁ လီတာ", priceKs: 4500, stock: 50 },
  ]},
  { key: "yogurt", name: "ဒိန်ချဉ်", img: IMG.yogurt, attr: "pack", variants: [
    { value: "၁ ခွက်", priceKs: 1800, stock: 70 },
    { value: "၄ ခွက်", priceKs: 6500, stock: 35 },
  ]},
  { key: "butter", name: "ထောပတ်", img: IMG.butter, attr: "size", variants: [
    { value: "၁၀၀ ဂရမ်", priceKs: 3500, stock: 45 },
    { value: "၂၀၀ ဂရမ်", priceKs: 6500, stock: 30 },
  ]},
  { key: "cheese-slices", name: "ချိစ်", img: IMG.cheese, attr: "pack", variants: [
    { value: "၁၀ ချပ်", priceKs: 5500, stock: 40 },
    { value: "၂၀ ချပ်", priceKs: 10000, stock: 25 },
  ]},
  { key: "fish-sauce", name: "ငံပြာရည်", img: IMG.fishSauce, attr: "size", variants: [
    { value: "၃၀၀ မီလီ", priceKs: 2200, stock: 80 },
    { value: "၇၀၀ မီလီ", priceKs: 4500, stock: 50 },
  ]},
  { key: "soy-sauce", name: "ပဲငံပြာရည်", img: IMG.soySauce, attr: "size", variants: [
    { value: "၃၀၀ မီလီ", priceKs: 2500, stock: 70 },
    { value: "၇၀၀ မီလီ", priceKs: 5000, stock: 40 },
  ]},
  { key: "soap-bar", name: "ရေချိုးဆပ်ပြာ", img: IMG.soap, attr: "pack", variants: [
    { value: "၁ တုံး", priceKs: 1200, stock: 100 },
    { value: "၃ တုံး", priceKs: 3300, stock: 60 },
  ]},
  { key: "detergent", name: "အဝတ်လျှော်မှုန့်", img: IMG.detergent, attr: "size", variants: [
    { value: "၅၀၀ ဂရမ်", priceKs: 3500, stock: 70 },
    { value: "၁ ကီလို", priceKs: 6500, stock: 45 },
  ]},
  { key: "tissue", name: "တစ်ရှူး", img: IMG.tissue, attr: "pack", variants: [
    { value: "၁ ဘူး", priceKs: 2500, stock: 80 },
    { value: "၃ ဘူး", priceKs: 7000, stock: 40 },
  ]},
  { key: "honey", name: "ပျားရည်", img: IMG.honey, attr: "size", variants: [
    { value: "၂၅၀ ဂရမ်", priceKs: 8500, stock: 35 },
    { value: "၅၀၀ ဂရမ်", priceKs: 15500, stock: 20 },
  ]},
  { key: "peanut-butter", name: "မြေပဲထောပတ်", img: IMG.peanut, attr: "size", variants: [
    { value: "၂၅၀ ဂရမ်", priceKs: 6500, stock: 40 },
    { value: "၅၀၀ ဂရမ်", priceKs: 12000, stock: 25 },
  ]},
  { key: "coconut-milk", name: "အုန်းနို့", img: IMG.coconut, attr: "size", variants: [
    { value: "၄၀၀ မီလီ", priceKs: 2800, stock: 70 },
    { value: "၁ လီတာ", priceKs: 6000, stock: 35 },
  ]},
];

function cuidLike(prefix) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

async function main() {
  if (FAMILIES.length !== 50) {
    throw new Error(`Expected 50 product families, got ${FAMILIES.length}`);
  }

  const shop = await prisma.shop.findFirst({
    where: { OR: [{ slug: "demo-shop" }, { name: "Sample Shop" }] },
  });
  if (!shop) throw new Error("Sample Shop (demo-shop) not found");

  console.log(`Shop: ${shop.name} (${shop.id})`);

  const existing = await prisma.product.count({ where: { shopId: shop.id } });
  if (existing > 0) {
    console.log(`Clearing ${existing} existing products…`);
    await prisma.$transaction([
      prisma.orderLine.updateMany({
        where: { product: { shopId: shop.id } },
        data: { productId: null },
      }),
      prisma.productView.deleteMany({ where: { shopId: shop.id } }),
      prisma.stockMove.deleteMany({ where: { shopId: shop.id } }),
      prisma.review.deleteMany({ where: { shopId: shop.id } }),
      prisma.product.deleteMany({ where: { shopId: shop.id } }),
    ]);
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      tagline: "Neighborhood grocery — rice, oil, fresh & daily essentials",
      websitePublished: true,
      listed: true,
      status: "approved",
    },
  });

  let skuCount = 0;
  const rows = [];

  for (const fam of FAMILIES) {
    const templateId = cuidLike(`tmpl-${fam.key}`);
    for (const v of fam.variants) {
      const wholesale = Math.round(v.priceKs * 0.88);
      rows.push({
        id: cuidLike(`sku-${fam.key}`),
        shopId: shop.id,
        name: fam.name,
        priceKs: v.priceKs,
        priceB2bKs: wholesale,
        wholesaleMinQty: 10,
        costKs: Math.round(v.priceKs * 0.7),
        stock: v.stock,
        categoryId: "grocery",
        imageUrl: fam.img,
        uom: "piece",
        purchaseUom: "piece",
        uomFactor: 1,
        templateId,
        attributesJson: JSON.stringify({ [fam.attr]: v.value }),
        active: true,
        showOnWebsite: true,
        sellOnOwnPage: true,
        sellOnMarketplace: false,
        sellOnApp: false,
        lowStockAlertEnabled: true,
        lowStockThreshold: 10,
      });
      skuCount += 1;
    }
  }

  // Prisma createMany — MySQL supports it
  const chunk = 40;
  for (let i = 0; i < rows.length; i += chunk) {
    await prisma.product.createMany({ data: rows.slice(i, i + chunk) });
  }

  const after = await prisma.product.count({ where: { shopId: shop.id } });
  const templates = await prisma.product.findMany({
    where: { shopId: shop.id },
    select: { templateId: true },
    distinct: ["templateId"],
  });

  console.log(`Created ${after} SKUs across ${templates.length} product families`);
  console.log(`SKU lines written: ${skuCount}`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
