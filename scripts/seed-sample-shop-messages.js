/**
 * Seed Sample Shop (demo-shop) with 20 buyer↔merchant chat threads —
 * Burmese buyer names, 09… phones, Burmese message text.
 *
 *   node --env-file=.env.local scripts/seed-sample-shop-messages.js
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

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

const THREAD_COUNT = 20;

const BUYERS = [
  { name: "ဦးမောင်မောင်", phone: "09123456701" },
  { name: "ဒေါ်အေးအေးမြင့်", phone: "09987654321" },
  { name: "ကိုဇော်မင်း", phone: "09420111222" },
  { name: "မစုစုဝင်း", phone: "09795123456" },
  { name: "ဦးသန်းထွန်း", phone: "09254321098" },
  { name: "ဒေါ်ခင်မျိုးချစ်", phone: "09691234567" },
  { name: "ကိုအောင်ကိုကို", phone: "09450011233" },
  { name: "မမြင့်မြင့်ခိုင်", phone: "09770099881" },
  { name: "ဦးကျော်စိုး", phone: "09321112233" },
  { name: "ဒေါ်တင်တင်အေး", phone: "09887766554" },
  { name: "ကိုထက်အောင်", phone: "09442223344" },
  { name: "မနှင်းနှင်းဦး", phone: "09911223344" },
  { name: "ဦးဝင်းနိုင်", phone: "09771234567" },
  { name: "ဒေါ်စန်းစန်းဝင်း", phone: "09456789012" },
  { name: "ကိုမျိုးမင်း", phone: "09933445566" },
  { name: "မဖြူဖြူမြင့်", phone: "09677889900" },
  { name: "ဦးလှမြင့်", phone: "09345678901" },
  { name: "ဒေါ်နီနီအောင်", phone: "09812345678" },
  { name: "ကိုစည်သူ", phone: "09488990011" },
  { name: "မချိုချိုလှ", phone: "09700112233" },
];

/** Conversation scripts: buyer opens, merchant may reply. */
const SCRIPTS = [
  [
    { from: "buyer", text: "မင်္ဂလာပါ ဆရာ၊ ပေါ်ဆန်မွှေး ဆန် ၅ ကီလို ရှိပါသေးလား။" },
    { from: "merchant", text: "မင်္ဂလာပါခင်ဗျာ။ ရှိပါသေးတယ်။ မှာပေးရင် ပို့ပေးပါမယ်။" },
    { from: "buyer", text: "ကောင်းပါပြီ၊ သာကေတကို ပို့ပေးပါ။" },
  ],
  [
    { from: "buyer", text: "ကြက်ခြေထောက် တစ်ကီလို ဘယ်လောက်လဲ။" },
    { from: "merchant", text: "၅၅၀၀ ကျပ် / ၅၀၀ ဂရမ် ဖြစ်ပါတယ်။" },
  ],
  [
    { from: "buyer", text: "ဒီနေ့ကောက်ယူလို့ ရမလား။" },
    { from: "merchant", text: "ရပါတယ်။ ညနေ ၅ နာရီအထိ ဆိုင်ဖွင့်ပါတယ်။" },
    { from: "buyer", text: "ကျေးဇူးတင်ပါတယ်။" },
  ],
  [
    { from: "buyer", text: "ငါးပိယဲ့ (ငံပြာရည်) ပုလင်းကြီး ရှိလား။" },
  ],
  [
    { from: "buyer", text: "အော်ဒါကို မနက်ဖြန် ပို့ပေးနိုင်မလား။" },
    { from: "merchant", text: "ပို့ပေးနိုင်ပါတယ်။ လိပ်စာ အတည်ပြုပေးပါ။" },
  ],
  [
    { from: "buyer", text: "နို့မှုန့် / UHT နို့ ကုန်နေလား။" },
    { from: "merchant", text: "ရှိသေးတယ်ခင်ဗျာ။ ၁ လီတာနဲ့ ၅၀၀ မီလီ ရှိပါတယ်။" },
  ],
  [
    { from: "buyer", text: "ပန်းသီး တစ်ကီလို ပို့ပေးပါ။ COD နဲ့ယူမယ်။" },
    { from: "merchant", text: "ရပါပြီ။ မနက်ဖြန် မနက်ပိုင်း ပို့ပေးပါမယ်။" },
  ],
  [
    { from: "buyer", text: "ဆပ်ပြာနဲ့ အဝတ်လျှော်မှုန့် ရောရောင်းသလား။" },
  ],
  [
    { from: "buyer", text: "အော်ဒါနံပါတ် ရှာမရဘူး။ ဖုန်းနဲ့ စစ်ပေးပါ။" },
    { from: "merchant", text: "စစ်ပေးပါမယ်။ နာမည်နဲ့ ဖုန်းနံပါတ် ပြန်ပို့ပေးပါ။" },
    { from: "buyer", text: "မစုစုဝင်း၊ ၀၉၇၉၅၁၂၃၄၅၆" },
  ],
  [
    { from: "buyer", text: "ဟင်းခတ်မှုန့် (နနွင်း၊ ငရုတ်) စုံရှိလား။" },
    { from: "merchant", text: "ရှိပါတယ်။ ၅၀ ဂရမ် / ၁၀၀ ဂရမ် ရပါတယ်။" },
  ],
  [
    { from: "buyer", text: "ရေသန့် ၂၀ လီတာ ပုလင်း ရှိသေးလား။" },
    { from: "merchant", text: "၂၀ လီတာ မရှိသေးဘူး။ ၁ လီတာ / ၅၀၀ မီလီ ရှိပါတယ်။" },
  ],
  [
    { from: "buyer", text: "လက်ဖက်သုပ် အဆာသင့် ပို့ပေးနိုင်မလား။" },
    { from: "merchant", text: "လက်ဖက်သုပ် ရောင်းပါတယ်။ အော်ဒါတင်ပေးပါ။" },
  ],
  [
    { from: "buyer", text: "ပို့ခ သာကေတ ဘယ်လောက်လဲ။" },
    { from: "merchant", text: "သာကေတ ပို့ခ ၂၀၀၀ ကျပ် ဖြစ်ပါတယ်။" },
  ],
  [
    { from: "buyer", text: "မုန့်ခြောက် (ဘီစကွတ်) မိသားစုအထုပ် ရှိလား။" },
  ],
  [
    { from: "buyer", text: "ဆီနှစ်မျိုး (နေကြာ + နှမ်း) ရောမှာချင်တယ်။" },
    { from: "merchant", text: "ရပါတယ်။ အရွယ်အစား ရွေးပေးပါ။" },
    { from: "buyer", text: "တစ်လီတာ တစ်ပုလင်းစီ ပေးပါ။" },
  ],
  [
    { from: "buyer", text: "မနေ့ပို့တဲ့အော်ဒါ မရောက်သေးဘူး။" },
    { from: "merchant", text: "စစ်ပေးနေပါတယ်။ မိနစ် ၂၀ အတွင်း ပြန်ပြောပါမယ်။" },
  ],
  [
    { from: "buyer", text: "ကြက်ဥ တစ်လုံး ဘယ်လောက်လဲ။" },
    { from: "merchant", text: "တစ်လုံးချင်း မရောင်းပါ။ ၆ လုံး / ၁၂ လုံး အထုပ် ရှိပါတယ်။" },
  ],
  [
    { from: "buyer", text: "ကော်ဖီမစ် ၃-in-1 အိတ်ကြီး ရှိလား။" },
  ],
  [
    { from: "buyer", text: "ပျားရည် သဘာဝ ၅၀၀ ဂရမ် မှာချင်တယ်။" },
    { from: "merchant", text: "ရှိပါတယ်။ ၁၅၅၀၀ ကျပ်။ မှာပေးရင် ပို့ပေးပါမယ်။" },
  ],
  [
    { from: "buyer", text: "ကောက်ယူချိန် ညနေ ၇ နာရီထိ ရမလား။" },
    { from: "merchant", text: "၆ နာရီအထိသာ ဖွင့်ပါတယ်။ ၆ မတိုင်ခင် လာယူပေးပါ။" },
    { from: "buyer", text: "ရပါပြီ၊ ကျေးဇူးတင်ပါတယ်။" },
  ],
];

function cuidLike(prefix) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

async function main() {
  if (BUYERS.length !== THREAD_COUNT || SCRIPTS.length !== THREAD_COUNT) {
    throw new Error(`Expected ${THREAD_COUNT} buyers and scripts`);
  }

  const shop = await prisma.shop.findFirst({
    where: { OR: [{ slug: "demo-shop" }, { name: "Sample Shop" }] },
  });
  if (!shop) throw new Error("Sample Shop (demo-shop) not found");

  const products = await prisma.product.findMany({
    where: { shopId: shop.id, active: true },
    select: { id: true, name: true, imageUrl: true, priceKs: true },
    take: 30,
  });

  const existing = await prisma.chatThread.count({ where: { shopId: shop.id } });
  if (existing > 0) {
    console.log(`Clearing ${existing} existing Sample Shop chat threads…`);
    await prisma.chatThread.deleteMany({ where: { shopId: shop.id } });
  }

  let created = 0;
  for (let i = 0; i < THREAD_COUNT; i++) {
    const buyer = BUYERS[i];
    const script = SCRIPTS[i];
    const channel = i % 3 === 0 ? "website" : "app";
    const threadId = cuidLike("chat");
    const baseMs = Date.now() - (THREAD_COUNT - i) * 3_600_000 - i * 90_000;

    const messageRows = script.map((m, mi) => {
      const product =
        mi === 0 && products.length
          ? products[(i + mi) % products.length]
          : null;
      return {
        id: cuidLike("msg"),
        threadId,
        from: m.from,
        text: m.text,
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        productImageUrl: product?.imageUrl ?? null,
        productPriceLabel: product ? `${product.priceKs.toLocaleString()} Ks` : null,
        createdAt: new Date(baseMs + mi * 120_000),
      };
    });

    const last = messageRows[messageRows.length - 1];

    await prisma.chatThread.create({
      data: {
        id: threadId,
        shopId: shop.id,
        buyerId: null,
        buyerName: buyer.name,
        buyerPhone: buyer.phone,
        channel,
        lastMessage: last.text,
        lastAt: last.createdAt,
        createdAt: messageRows[0].createdAt,
        updatedAt: last.createdAt,
        messages: { create: messageRows.map(({ threadId: _t, ...rest }) => rest) },
      },
    });

    console.log(
      `  ${buyer.name}  ${buyer.phone}  (${messageRows.length} msgs)  ${last.text.slice(0, 28)}…`
    );
    created += 1;
  }

  console.log(`Created ${created} message threads for ${shop.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
