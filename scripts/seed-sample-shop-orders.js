/**
 * Seed Sample Shop (demo-shop) with 30 demo marketplace orders —
 * Burmese buyer names + Myanmar mobile numbers.
 *
 *   node --env-file=.env.local scripts/seed-sample-shop-orders.js
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { allocateOrderCode } from "../src/lib/order-code.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

const ORDER_COUNT = 30;

const TOWNSHIP = {
  id: "yangon-thaketa-11231",
  name: "သာကေတ",
  feeKs: 2000,
};

/** 30 demo guests — Burmese names + 09… mobiles. */
const BUYERS = [
  { name: "ဦးမောင်မောင်", phone: "09123456701", street: "အမှတ် ၁၂၊ သီရိလမ်း" },
  { name: "ဒေါ်အေးအေးမြင့်", phone: "09987654321", street: "အမှတ် ၄၅၊ ပုဇွန်တောင်လမ်း" },
  { name: "ကိုဇော်မင်း", phone: "09420111222", street: "အမှတ် ၈၊ ဗိုလ်ချုပ်လမ်း" },
  { name: "မစုစုဝင်း", phone: "09795123456", street: "အမှတ် ၂၂၊ ကမ်းနားလမ်း" },
  { name: "ဦးသန်းထွန်း", phone: "09254321098", street: "အမှတ် ၃၊ ဘုရားလမ်း" },
  { name: "ဒေါ်ခင်မျိုးချစ်", phone: "09691234567", street: "အမှတ် ၁၇၊ ကျောင်းလမ်း" },
  { name: "ကိုအောင်ကိုကို", phone: "09450011233", street: "အမှတ် ၉၊ မြို့မလမ်း" },
  { name: "မမြင့်မြင့်ခိုင်", phone: "09770099881", street: "အမှတ် ၅၅၊ ရေကျော်လမ်း" },
  { name: "ဦးကျော်စိုး", phone: "09321112233", street: "အမှတ် ၁၄၊ ပန်းလမ်း" },
  { name: "ဒေါ်တင်တင်အေး", phone: "09887766554", street: "အမှတ် ၂၇၊ ဘူတာလမ်း" },
  { name: "ကိုထက်အောင်", phone: "09442223344", street: "အမှတ် ၃၁၊ ပင်လယ်လမ်း" },
  { name: "မနှင်းနှင်းဦး", phone: "09911223344", street: "အမှတ် ၆၊ ဈေးလမ်း" },
  { name: "ဦးဝင်းနိုင်", phone: "09771234567", street: "အမှတ် ၄၁၊ ရွှေလမ်း" },
  { name: "ဒေါ်စန်းစန်းဝင်း", phone: "09456789012", street: "အမှတ် ၁၉၊ သံလျင်လမ်း" },
  { name: "ကိုမျိုးမင်း", phone: "09933445566", street: "အမှတ် ၇၊ ကန်တော်လမ်း" },
  { name: "မဖြူဖြူမြင့်", phone: "09677889900", street: "အမှတ် ၂၃၊ မြစ်ကမ်းလမ်း" },
  { name: "ဦးလှမြင့်", phone: "09345678901", street: "အမှတ် ၅၊ ရန်ကုန်လမ်း" },
  { name: "ဒေါ်နီနီအောင်", phone: "09812345678", street: "အမှတ် ၃၃၊ ဘုရားကြီးလမ်း" },
  { name: "ကိုစည်သူ", phone: "09488990011", street: "အမှတ် ၁၁၊ သီတာလမ်း" },
  { name: "မချိုချိုလှ", phone: "09700112233", street: "အမှတ် ၂၈၊ ပန်းခြံလမ်း" },
  { name: "ဦးတင်မောင်", phone: "09233445566", street: "အမှတ် ၁၆၊ အင်းယားလမ်း" },
  { name: "ဒေါ်မေသူဇာ", phone: "09955667788", street: "အမှတ် ၄၊ ရွှေတိဂုံလမ်း" },
  { name: "ကိုရန်နိုင်", phone: "09466778899", street: "အမှတ် ၃၈၊ ကမ်းခြေလမ်း" },
  { name: "မသင်းသင်းခင်", phone: "09660011223", street: "အမှတ် ၂၁၊ ဆေးရုံလမ်း" },
  { name: "ဦးအေးမြင့်", phone: "09388990011", street: "အမှတ် ၁၃၊ ရေတွင်းလမ်း" },
  { name: "ဒေါ်ခင်ခင်စိုး", phone: "09833445566", street: "အမှတ် ၂၉၊ ဘူတာရုံလမ်း" },
  { name: "ကိုဇင်မင်း", phone: "09411223344", street: "အမှတ် ၄၇၊ ပန်းတောလမ်း" },
  { name: "မရွှေရွှေစန်း", phone: "09722334455", street: "အမှတ် ၂၊ ရန်ကြီးအောင်လမ်း" },
  { name: "ဦးဘိုဘိုဝင်း", phone: "09277889900", street: "အမှတ် ၃၅၊ မြို့သစ်လမ်း" },
  { name: "ဒေါ်လဲ့လဲ့ဝင်း", phone: "09900112233", street: "အမှတ် ၁၈၊ သီရိမင်္ဂလာလမ်း" },
];

const DELIVERY_STAGES = ["request", "approved", "out_for_delivery", "completed"];
const PICKUP_STAGES = ["request", "approved", "ready_pickup", "completed"];
const PAYMENTS = ["cod", "kpay", "uabpay", "ayapay", "cbpay", "mmqr"];

const BASKETS = [
  ["ပေါ်ဆန်မွှေး", "စားအုန်းဆီ", "ကြက်ဥ"],
  ["အသင့်စားခေါက်ဆွဲ", "ငံပြာရည်", "ကြက်သွန်နီ"],
  ["ကြက်ခြေထောက်", "ခရမ်းချဉ်သီး", "အာလူး"],
  ["သကြားဖြူ", "ဆား", "ငရုတ်မှုန့်"],
  ["UHT နို့", "ပေါင်မုန့်", "ထောပတ်"],
  ["လက်ဖက်စိမ်းအိတ်", "မုန့်ခြောက်", "ကိုလာအချိုရည်"],
  ["ငှက်ပျောသီး", "ပန်းသီး", "လိမ္မော်သီး"],
  ["အုန်းနို့", "မြေပဲထောပတ်", "ပျားရည်"],
  ["ကောက်ညှင်း", "နှမ်းဆီ"],
  ["အဝတ်လျှော်မှုန့်", "ရေချိုးဆပ်ပြာ", "တစ်ရှူး"],
  ["ငါးခြောက်", "ပဲထောပတ်", "ဂျုံမှုန့်"],
  ["အာလူးကြော်", "ဒိန်ချဉ်", "လိမ္မော်ရည်", "သောက်ရေသန့်"],
  ["ဇီးယားဆန်", "နေကြာဆီ", "ကြက်သွန်ဖြူ"],
  ["နို့ဆီ", "ကော်ဖီမစ် ၃-in-1", "မုန့်ခြောက်"],
  ["သကြားညို", "နနွင်းမှုန့်", "ပဲငံပြာရည်"],
  ["ပဲတီ", "ကြာဇံ", "လက်ဖက်သုပ်"],
  ["ချိစ်", "ထောပတ်", "ပေါင်မုန့်"],
  ["ကော်ဖီမှုန့်", "သကြားဖြူ", "UHT နို့"],
  ["မြေပဲဆီ", "ကြက်သွန်နီ", "အာလူး"],
  ["ရေချိုးဆပ်ပြာ", "တစ်ရှူး", "အဝတ်လျှော်မှုန့်"],
  ["ကြက်ဥ", "ခရမ်းချဉ်သီး", "ကြက်သွန်ဖြူ"],
  ["ကိုလာအချိုရည်", "အာလူးကြော်", "မုန့်ခြောက်"],
  ["ပျားရည်", "ဒိန်ချဉ်", "ပန်းသီး"],
  ["ပေါ်ဆန်မွှေး", "ငံပြာရည်"],
  ["ကြက်ခြေထောက်", "အသင့်စားခေါက်ဆွဲ", "ငရုတ်မှုန့်"],
  ["လိမ္မော်ရည်", "ငှက်ပျောသီး", "သောက်ရေသန့်"],
  ["ဂျုံမှုန့်", "သကြားဖြူ", "ထောပတ်"],
  ["အုန်းနို့", "ငါးခြောက်", "ကြာဇံ"],
  ["မြေပဲထောပတ်", "ပေါင်မုန့်", "ကိုလာအချိုရည်"],
  ["ဆား", "နနွင်းမှုန့်", "စားအုန်းဆီ", "ခရမ်းချဉ်သီး"],
];

function pickQty(name) {
  if (/ဆန်|ဆီ|သကြား|မှုန့်|ဂျုံ/.test(name)) return 1;
  if (/ဥ|ခေါက်ဆွဲ|မုန့်|ကြော်/.test(name)) return 2;
  return 1 + (name.length % 2);
}

function buildSpecs() {
  if (BUYERS.length !== ORDER_COUNT || BASKETS.length !== ORDER_COUNT) {
    throw new Error(`Expected ${ORDER_COUNT} buyers and baskets`);
  }
  const specs = [];
  for (let i = 0; i < ORDER_COUNT; i++) {
    const fulfillment = i % 2 === 0 ? "delivery" : "pickup";
    const stages = fulfillment === "delivery" ? DELIVERY_STAGES : PICKUP_STAGES;
    specs.push({
      buyer: i,
      fulfillment,
      stage: stages[i % stages.length],
      payment: PAYMENTS[i % PAYMENTS.length],
      daysAgo: i % 8,
      productNames: BASKETS[i],
    });
  }
  return specs;
}

async function main() {
  const shop = await prisma.shop.findFirst({
    where: { OR: [{ slug: "demo-shop" }, { name: "Sample Shop" }] },
  });
  if (!shop) throw new Error("Sample Shop (demo-shop) not found");

  const products = await prisma.product.findMany({
    where: { shopId: shop.id, active: true },
    select: { id: true, name: true, priceKs: true },
    orderBy: { priceKs: "asc" },
  });
  if (!products.length) throw new Error("No products — run seed-sample-shop-grocery.js first");

  const byName = new Map();
  for (const p of products) {
    if (!byName.has(p.name)) byName.set(p.name, p);
  }

  const existing = await prisma.order.count({ where: { shopId: shop.id } });
  if (existing > 0) {
    console.log(`Clearing ${existing} existing Sample Shop orders…`);
    await prisma.order.deleteMany({ where: { shopId: shop.id } });
  }

  const specs = buildSpecs();
  let created = 0;
  for (const spec of specs) {
    const buyer = BUYERS[spec.buyer];
    const lines = [];
    for (const name of spec.productNames) {
      const product = byName.get(name);
      if (!product) {
        console.warn(`  skip missing product: ${name}`);
        continue;
      }
      const qty = pickQty(name);
      lines.push({
        productId: product.id,
        productName: product.name,
        qty,
        unitKs: product.priceKs,
        lineTotalKs: product.priceKs * qty,
      });
    }
    if (!lines.length) continue;

    const subtotalKs = lines.reduce((s, l) => s + l.lineTotalKs, 0);
    const isDelivery = spec.fulfillment === "delivery";
    const deliveryFeeKs = isDelivery ? TOWNSHIP.feeKs : 0;
    const totalKs = subtotalKs + deliveryFeeKs;
    const createdAt = new Date(Date.now() - spec.daysAgo * 24 * 60 * 60 * 1000 - created * 45_000);

    await prisma.$transaction(async (tx) => {
      const code = await allocateOrderCode(tx, spec.fulfillment);
      await tx.order.create({
        data: {
          code,
          shopId: shop.id,
          buyerId: null,
          buyerName: buyer.name,
          buyerPhone: buyer.phone,
          address: isDelivery
            ? `${buyer.street || "လိပ်စာမရှိ"}၊ ${TOWNSHIP.name}`
            : "ဆိုင်ကောက်ယူရန်",
          channel: "b2c",
          fulfillment: spec.fulfillment,
          payment: spec.payment,
          source: "marketplace",
          clientSurface: "website",
          stage: spec.stage,
          townshipId: isDelivery ? TOWNSHIP.id : null,
          townshipName: isDelivery ? TOWNSHIP.name : null,
          deliveryFeeKs,
          subtotalKs,
          totalKs,
          pickupReserved: spec.fulfillment === "pickup",
          createdAt,
          updatedAt: createdAt,
          lines: { create: lines },
        },
      });
      console.log(
        `  ${code}  ${spec.stage.padEnd(18)}  ${buyer.name}  ${buyer.phone}  ${totalKs.toLocaleString()} Ks`
      );
    });
    created += 1;
  }

  console.log(`Created ${created} orders for ${shop.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
