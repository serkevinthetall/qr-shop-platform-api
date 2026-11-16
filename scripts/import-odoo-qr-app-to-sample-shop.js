/**
 * Import Odoo QR App external buyers + catalog + order history into the
 * sample Platform shop "QR Shop" (merchant@qrshop.com).
 *
 * Buyer passwords are reset to: qrshop123
 * (Odoo passwords cannot be exported.)
 *
 * Required env:
 *   DATABASE_URL          — Platform API MySQL
 *   ODOO_URL              — e.g. https://your-odoo.example
 *   ODOO_DB
 *   ODOO_SERVICE_LOGIN    — Odoo admin / service user
 *   ODOO_SERVICE_PASSWORD
 *
 * Optional:
 *   ODOO_ENV_FILE         — path to qr-shop-api .env.production.local
 *   DRY_RUN=1             — export counts only, no DB writes
 *   BUYER_PASSWORD        — default qrshop123
 *   MERCHANT_EMAIL        — default merchant@qrshop.com
 *   SHOP_NAME             — default QR Shop
 *   SHOP_SLUG             — default qr-shop
 *
 * Run:
 *   node scripts/import-odoo-qr-app-to-sample-shop.js
 */
import "../src/lib/env.js";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { allocateOrderCode } from "../src/lib/order-code.js";

const prisma = new PrismaClient();

const BUYER_PASSWORD = process.env.BUYER_PASSWORD || "qrshop123";
const MERCHANT_EMAIL = (process.env.MERCHANT_EMAIL || "merchant@qrshop.com").toLowerCase();
const SHOP_NAME = process.env.SHOP_NAME || "QR Shop";
const SHOP_SLUG = process.env.SHOP_SLUG || "qr-shop";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const APP_PRODUCT_TAG = "QR App";

if (process.env.ODOO_ENV_FILE) {
  dotenv.config({ path: process.env.ODOO_ENV_FILE, override: true });
}

function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("95") && digits.length >= 10) digits = `0${digits.slice(2)}`;
  if (digits.length === 9 && digits.startsWith("9")) digits = `0${digits}`;
  return digits.length >= 8 ? digits : null;
}

function normalizeEmail(raw) {
  const e = String(raw || "").trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return e;
}

function kyats(n) {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? v : 0;
}

function mapStage(state) {
  const s = String(state || "").toLowerCase();
  if (s === "cancel" || s === "cancelled") return "cancelled";
  if (s === "done") return "completed";
  if (s === "sale") return "approved";
  return "request";
}

function mapFulfillment(order) {
  const raw = String(order.x_studio_fulfillment || order.fulfillment || "").toLowerCase();
  if (raw.includes("pick")) return "pickup";
  return "delivery";
}

/** Minimal Odoo JSON-RPC session client (same shape as qr-shop-api). */
function createOdooClient() {
  const baseUrl = String(process.env.ODOO_URL || "").trim().replace(/\/$/, "");
  const db = String(process.env.ODOO_DB || "").trim();
  const login = String(process.env.ODOO_SERVICE_LOGIN || "").trim();
  const password = String(process.env.ODOO_SERVICE_PASSWORD || "").trim();

  if (!baseUrl.startsWith("http") || baseUrl.includes("[SENSITIVE]")) {
    throw new Error(
      "ODOO_URL missing or placeholder. Set ODOO_* env or ODOO_ENV_FILE to a real qr-shop-api env file.",
    );
  }
  if (!db || !login || !password || [db, login, password].some((v) => v.includes("[SENSITIVE]"))) {
    throw new Error("ODOO_DB / ODOO_SERVICE_LOGIN / ODOO_SERVICE_PASSWORD missing or placeholder.");
  }

  let cookie = null;

  async function ensureSession() {
    if (cookie) return cookie;
    const response = await fetch(`${baseUrl}/web/session/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", params: { db, login, password } }),
    });
    const data = await response.json();
    if (!data?.result?.uid) {
      throw new Error("Odoo service login failed — check admin credentials");
    }
    const raw = response.headers.getSetCookie?.() || [];
    const fromHeader = response.headers.get("set-cookie");
    const cookies = raw.length
      ? raw
      : fromHeader
        ? [fromHeader]
        : [];
    if (!cookies.length) throw new Error("Odoo session cookie missing");
    cookie = cookies.map((c) => String(c).split(";")[0]).join("; ");
    return cookie;
  }

  async function call(model, method, params = {}) {
    const session = await ensureSession();
    let args = [];
    let kwargs = {};
    if (method === "search_read") {
      args = [params.domain || []];
      kwargs = { fields: params.fields || [] };
      if (params.limit != null) kwargs.limit = params.limit;
      if (params.offset != null) kwargs.offset = params.offset;
      if (params.order) kwargs.order = params.order;
    } else if (method === "read") {
      args = [params.ids || [], params.fields || []];
    } else {
      args = params.args || [];
      kwargs = params.kwargs || {};
    }
    const response = await fetch(`${baseUrl}/web/dataset/call_kw/${model}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: session,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { model, method, args, kwargs },
      }),
    });
    const data = await response.json();
    if (data?.error) {
      const msg =
        data.error?.data?.message || data.error?.message || "Odoo call failed";
      throw new Error(msg);
    }
    return data.result;
  }

  function productImageUrl(templateId) {
    return `${baseUrl}/web/image/product.template/${templateId}/image_1024`;
  }

  return { call, productImageUrl, baseUrl };
}

async function fetchAllSearchRead(odoo, model, params, pageSize = 200) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const batch = await odoo.call(model, "search_read", {
      ...params,
      limit: pageSize,
      offset,
    });
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function ensureSampleShop() {
  let shop =
    (await prisma.shop.findFirst({ where: { email: MERCHANT_EMAIL } })) ||
    (await prisma.shop.findUnique({ where: { slug: SHOP_SLUG } }));

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        slug: SHOP_SLUG,
        name: SHOP_NAME,
        email: MERCHANT_EMAIL,
        status: "approved",
        listed: true,
        websitePublished: true,
        tagline: "Imported from Odoo QR App",
        features: {
          create: {
            listingMode: "both",
            b2cEnabled: true,
            b2bEnabled: true,
          },
        },
        delivery: { create: {} },
      },
    });
  } else {
    shop = await prisma.shop.update({
      where: { id: shop.id },
      data: {
        name: SHOP_NAME,
        email: MERCHANT_EMAIL,
        status: "approved",
        listed: true,
        websitePublished: true,
      },
    });
    await prisma.shopFeatures.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        listingMode: "both",
        b2cEnabled: true,
        b2bEnabled: true,
      },
      update: { listingMode: "both", b2cEnabled: true, b2bEnabled: true },
    });
  }

  const passwordHash = await bcrypt.hash(BUYER_PASSWORD, 10);
  const merchantExisting = await prisma.user.findFirst({
    where: { OR: [{ email: MERCHANT_EMAIL }, { shopId: shop.id, role: "merchant" }] },
  });
  if (merchantExisting) {
    await prisma.user.update({
      where: { id: merchantExisting.id },
      data: {
        role: "merchant",
        name: merchantExisting.name || "QR Shop Merchant",
        email: MERCHANT_EMAIL,
        shopId: shop.id,
        active: true,
        // Keep merchant password unless it was never set for this email — do not force buyer password on merchant.
      },
    });
  } else {
    await prisma.user.create({
      data: {
        role: "merchant",
        name: "QR Shop Merchant",
        email: MERCHANT_EMAIL,
        phone: "09100000001",
        passwordHash,
        shopId: shop.id,
        active: true,
      },
    });
  }

  return shop;
}

async function upsertBuyer({ name, email, phone, address }, passwordHash) {
  const or = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  if (!or.length) return null;

  const existing = await prisma.user.findFirst({ where: { OR: or } });
  const data = {
    role: "buyer",
    name: name || email || phone || "Buyer",
    email: email || existing?.email || null,
    phone: phone || existing?.phone || null,
    address: address || existing?.address || null,
    passwordHash,
    active: true,
    shopId: null,
  };

  // Avoid unique collisions: if email belongs to a non-buyer (merchant/admin), skip.
  if (existing && existing.role !== "buyer") {
    console.warn(`skip partner (email/phone owned by ${existing.role}):`, email || phone);
    return null;
  }

  if (existing) {
    return prisma.user.update({ where: { id: existing.id }, data });
  }
  try {
    return await prisma.user.create({ data });
  } catch (e) {
    console.warn("buyer create failed", email || phone, e.message);
    return null;
  }
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no Platform DB writes" : "IMPORT — writing to Platform API");
  console.log({ MERCHANT_EMAIL, SHOP_NAME, SHOP_SLUG, BUYER_PASSWORD: "(set)" });

  const odoo = createOdooClient();

  console.log("Fetching QR App products from Odoo…");
  const products = await fetchAllSearchRead(odoo, "product.template", {
    domain: [
      ["sale_ok", "=", true],
      ["website_published", "=", true],
      ["product_tag_ids.name", "=", APP_PRODUCT_TAG],
    ],
    fields: [
      "id",
      "name",
      "list_price",
      "compare_list_price",
      "default_code",
      "barcode",
      "qty_available",
      "write_date",
      "categ_id",
    ],
    order: "name asc",
  });
  console.log(`  products: ${products.length}`);

  console.log("Fetching sale orders…");
  let orders = [];
  try {
    orders = await fetchAllSearchRead(odoo, "sale.order", {
      domain: [["state", "in", ["sale", "done"]]],
      fields: [
        "id",
        "name",
        "partner_id",
        "partner_shipping_id",
        "amount_total",
        "amount_untaxed",
        "state",
        "date_order",
        "x_studio_fulfillment",
        "note",
      ],
      order: "date_order desc",
    });
  } catch (e) {
    // Retry without Studio field
    orders = await fetchAllSearchRead(odoo, "sale.order", {
      domain: [["state", "in", ["sale", "done"]]],
      fields: [
        "id",
        "name",
        "partner_id",
        "partner_shipping_id",
        "amount_total",
        "amount_untaxed",
        "state",
        "date_order",
        "note",
      ],
      order: "date_order desc",
    });
    console.warn("  (x_studio_fulfillment unavailable — defaulting delivery)", e.message);
  }
  console.log(`  orders: ${orders.length}`);

  const partnerIds = [
    ...new Set(
      orders
        .map((o) => (Array.isArray(o.partner_id) ? o.partner_id[0] : null))
        .filter(Boolean),
    ),
  ];
  console.log(`  unique partners on orders: ${partnerIds.length}`);

  const partners = [];
  for (let i = 0; i < partnerIds.length; i += 80) {
    const chunk = partnerIds.slice(i, i + 80);
    const rows = await odoo.call("res.partner", "read", {
      ids: chunk,
      fields: ["id", "name", "email", "phone", "mobile", "street", "street2", "city", "zip"],
    });
    partners.push(...(rows || []));
  }

  const buyers = partners
    .map((p) => {
      const email = normalizeEmail(p.email);
      const phone = normalizePhone(p.phone) || normalizePhone(p.mobile);
      if (!email && !phone) return null;
      const address = [p.street, p.street2, p.city, p.zip].filter(Boolean).join(", ") || null;
      return {
        odooId: p.id,
        name: String(p.name || "").trim() || email || phone,
        email,
        phone,
        address,
      };
    })
    .filter(Boolean);
  console.log(`  importable buyers (email and/or phone): ${buyers.length}`);

  const orderIds = orders.map((o) => o.id);
  const lines = [];
  for (let i = 0; i < orderIds.length; i += 50) {
    const chunk = orderIds.slice(i, i + 50);
    const rows = await odoo.call("sale.order.line", "search_read", {
      domain: [["order_id", "in", chunk], ["display_type", "=", false]],
      fields: [
        "id",
        "order_id",
        "product_id",
        "product_template_id",
        "name",
        "product_uom_qty",
        "price_unit",
        "price_subtotal",
      ],
      limit: 5000,
    });
    lines.push(...(rows || []));
  }
  console.log(`  order lines: ${lines.length}`);

  if (DRY_RUN) {
    console.log("Dry run complete — re-run without DRY_RUN=1 to import.");
    return;
  }

  if (!process.env.DATABASE_URL?.startsWith("mysql")) {
    throw new Error("DATABASE_URL must be a mysql:// URL for Platform API");
  }

  const shop = await ensureSampleShop();
  console.log(`Shop ready: ${shop.name} (${shop.id}) · ${shop.email}`);

  const passwordHash = await bcrypt.hash(BUYER_PASSWORD, 10);

  /** odoo template id → platform product id */
  const productMap = new Map();
  for (const p of products) {
    const externalKey = `odoo-tmpl-${p.id}`;
    const priceKs = kyats(p.list_price);
    const compareAtKs = kyats(p.compare_list_price) || null;
    const stock = Math.max(0, Math.floor(Number(p.qty_available) || 0));
    const imageUrl = odoo.productImageUrl(p.id);
    const barcode = p.barcode ? String(p.barcode) : externalKey;

    let row = await prisma.product.findFirst({
      where: { shopId: shop.id, OR: [{ barcode }, { barcode: externalKey }] },
    });
    const data = {
      shopId: shop.id,
      name: String(p.name || `Product ${p.id}`).trim(),
      priceKs: priceKs || 100,
      priceB2bKs: null,
      compareAtKs: compareAtKs && compareAtKs > priceKs ? compareAtKs : null,
      stock,
      imageUrl,
      barcode,
      categoryId: Array.isArray(p.categ_id) ? String(p.categ_id[1] || "").slice(0, 64) : null,
      active: true,
      showOnWebsite: true,
      sellOnOwnPage: true,
      sellOnMarketplace: true,
      sellOnApp: true,
      attributesJson: JSON.stringify({ odooTemplateId: p.id, sku: p.default_code || null }),
    };
    if (row) {
      row = await prisma.product.update({ where: { id: row.id }, data });
    } else {
      row = await prisma.product.create({ data });
    }
    productMap.set(p.id, row.id);
  }
  console.log(`  products upserted: ${productMap.size}`);

  /** odoo partner id → platform user id */
  const buyerMap = new Map();
  for (const b of buyers) {
    const user = await upsertBuyer(b, passwordHash);
    if (user) buyerMap.set(b.odooId, user.id);
  }
  console.log(`  buyers upserted: ${buyerMap.size} (password: ${BUYER_PASSWORD})`);

  const linesByOrder = new Map();
  for (const line of lines) {
    const oid = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id;
    if (!oid) continue;
    if (!linesByOrder.has(oid)) linesByOrder.set(oid, []);
    linesByOrder.get(oid).push(line);
  }

  let ordersCreated = 0;
  let ordersSkipped = 0;
  for (const order of orders) {
    const odooOrderName = String(order.name || "");
    const existing = await prisma.order.findFirst({
      where: {
        shopId: shop.id,
        // mark via address snapshot prefix
        address: { startsWith: `[Odoo ${odooOrderName}]` },
      },
    });
    if (existing) {
      ordersSkipped += 1;
      continue;
    }

    const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : null;
    const buyerId = partnerId ? buyerMap.get(partnerId) || null : null;
    const buyerMeta = buyers.find((b) => b.odooId === partnerId);
    const buyerName =
      (Array.isArray(order.partner_id) ? order.partner_id[1] : null) ||
      buyerMeta?.name ||
      "Buyer";
    const buyerPhone = buyerMeta?.phone || "09000000000";

    const orderLines = linesByOrder.get(order.id) || [];
    if (!orderLines.length) {
      ordersSkipped += 1;
      continue;
    }

    const fulfillment = mapFulfillment(order);
    const stage = mapStage(order.state);
    const mappedLines = orderLines.map((l) => {
      const tmplId = Array.isArray(l.product_template_id)
        ? l.product_template_id[0]
        : null;
      const productId = tmplId ? productMap.get(tmplId) || null : null;
      const qty = Math.max(1, Math.floor(Number(l.product_uom_qty) || 1));
      const unitKs = kyats(l.price_unit) || 0;
      return {
        productId,
        productName: String(l.name || "Item").slice(0, 240),
        qty,
        unitKs,
        lineTotalKs: kyats(l.price_subtotal) || unitKs * qty,
      };
    });
    const subtotalKs = mappedLines.reduce((s, l) => s + l.lineTotalKs, 0);
    const totalKs = kyats(order.amount_total) || subtotalKs;
    const deliveryFeeKs = Math.max(0, totalKs - subtotalKs);
    const addressNote = `[Odoo ${odooOrderName}] ${buyerMeta?.address || ""}`.trim();

    await prisma.$transaction(async (tx) => {
      const code = await allocateOrderCode(tx, fulfillment);
      await tx.order.create({
        data: {
          code,
          shopId: shop.id,
          buyerId,
          buyerName: String(buyerName).slice(0, 120),
          buyerPhone,
          address: addressNote.slice(0, 500),
          channel: "b2c",
          fulfillment,
          payment: "cod",
          source: "marketplace",
          clientSurface: "app",
          stage,
          deliveryFeeKs,
          subtotalKs,
          totalKs,
          createdAt: order.date_order ? new Date(order.date_order) : undefined,
          lines: { create: mappedLines },
        },
      });
    });
    ordersCreated += 1;
  }

  console.log(
    JSON.stringify(
      {
        shopId: shop.id,
        shop: shop.name,
        merchantEmail: MERCHANT_EMAIL,
        products: productMap.size,
        buyers: buyerMap.size,
        buyerPassword: BUYER_PASSWORD,
        ordersCreated,
        ordersSkipped,
      },
      null,
      2,
    ),
  );
  console.log("Done. Buyers can sign in with their phone/email and password:", BUYER_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
