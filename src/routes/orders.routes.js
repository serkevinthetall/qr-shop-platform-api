import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import {
  requireAuth,
  requireGuest,
  requireRole,
  requireUserOrGuest,
} from "../middlewares/auth.middleware.js";
import { normalizePhone } from "../lib/phone.js";
import { resolvePricingContext } from "../lib/pricing-context.js";
import { resolveDeliveryOptions } from "../lib/delivery-fee.js";
import { townshipLabel } from "../lib/township.js";
import { resolveUnitPrice } from "../lib/mall-product.js";
import {
  ensureOrderMerchantLastReadColumn,
  ensureWholesaleMinQtyColumn,
} from "../lib/ensure-schema.js";
import { publishOrderEvent } from "../lib/realtime.js";
import { notifyShopNewOrder } from "../lib/merchant-notify.js";
import { allocateOrderCode, looksLikeOrderCode } from "../lib/order-code.js";
import {
  normalizeOrderStage,
  shouldStockOutForStage,
  withNormalizedStage,
} from "../lib/order-stage.js";

const router = Router();

const WRITABLE_STAGES = new Set([
  "request",
  "approved",
  "out_for_delivery",
  "ready_pickup",
  "completed",
  "cancelled",
  /** legacy aliases accepted from older clients */
  "delivery",
  "pickup",
  "invoiced",
]);

function expandStageFilter(stage) {
  const s = String(stage || "").trim();
  if (!s) return null;
  if (s === "out_for_delivery") return { in: ["out_for_delivery", "delivery", "invoiced"] };
  if (s === "ready_pickup") return { in: ["ready_pickup", "pickup"] };
  if (s === "approved") return "approved";
  if (s === "request") return "request";
  if (s === "completed") return "completed";
  if (s === "cancelled") return "cancelled";
  return s;
}

const lineSchema = z.object({
  productId: z.string().optional(),
  productName: z.string().min(1).optional(),
  qty: z.number().int().positive(),
  /** Optional — server prices from Product when productId set */
  unitKs: z.number().int().nonnegative().optional(),
});

const placeSchema = z.object({
  shopId: z.string().min(1),
  buyerName: z.string().min(1),
  buyerPhone: z.string().min(6).optional(),
  address: z.string().optional(),
  channel: z.enum(["b2c", "b2b"]).default("b2c"),
  fulfillment: z.enum(["delivery", "pickup", "express"]),
  payment: z.string().min(2).max(24),
  /** Required for wallet methods (kpay, uabpay, …) — absolute or /uploads/… */
  paymentSlipUrl: z.string().min(8).max(2048).optional().nullable(),
  /** Optional note from buyer (QR App delivery notes). */
  buyerNote: z.string().max(1000).optional().nullable(),
  /** Soft preferred day YYYY-MM-DD (not an SLA). Empty → ignored. */
  preferredDeliveryDate: z.string().max(10).optional().nullable(),
  lines: z.array(lineSchema).min(1),
  deliveryFeeKs: z.number().int().nonnegative().optional(),
  townshipId: z.string().optional(),
  townshipName: z.string().optional(),
  source: z.enum(["marketplace", "pos", "shop_view", "qr_guest"]).optional(),
  /** website | app | qr | instore — where the buyer placed the order */
  clientSurface: z.enum(["website", "app", "qr", "instore"]).optional(),
});

const WALLET_PAYMENTS = new Set(["kpay", "uabpay", "ayapay", "cbpay", "mmqr"]);

function isWalletPayment(id) {
  return WALLET_PAYMENTS.has(String(id || "").toLowerCase());
}

const packageSchema = placeSchema.omit({ buyerName: true, buyerPhone: true }).extend({
  buyerName: z.string().min(1).optional(),
});

const checkoutSchema = z.object({
  buyerName: z.string().min(1).optional(),
  packages: z.array(packageSchema).min(1),
});

async function assertChannelAllowed(
  shopId,
  phone,
  channel,
  { requirePhoneB2bGate = false, allowQtyWholesale = false } = {},
) {
  const ctx = await resolvePricingContext(shopId, phone);
  if (!ctx) return { ok: false, message: "Shop not found" };
  if (ctx.portfolioOnly || !ctx.canOrder) {
    return {
      ok: false,
      message: "This shop is portfolio-only — ordering is disabled",
    };
  }
  if (channel === "b2c" && !ctx.shopOffersB2c) {
    return { ok: false, message: "B2C is not open for this shop" };
  }
  if (channel === "b2b") {
    /** Qty ≥ wholesaleMinQty unlocks wholesale without shop B2B listing / phone gate. */
    if (allowQtyWholesale) {
      return { ok: true, ctx };
    }
    if (!ctx.shopOffersB2b) {
      return { ok: false, message: "B2B is not open for this shop" };
    }
    if (requirePhoneB2bGate && !ctx.b2bEnabled) {
      return {
        ok: false,
        message: "This phone is not open for B2B at this shop",
      };
    }
  }
  return { ok: true, ctx };
}

async function resolveLines(shopId, channel, rawLines) {
  try {
    await ensureWholesaleMinQtyColumn();
  } catch {
    /* logged in ensure-schema */
  }
  const priced = [];
  for (const line of rawLines) {
    const qty = line.qty;
    if (line.productId) {
      const product = await prisma.product.findFirst({
        where: {
          id: line.productId,
          shopId,
          active: true,
        },
      });
      if (!product) {
        return {
          error: {
            status: 400,
            message: `Product not found: ${line.productId}`,
          },
        };
      }
      if (product.stock < qty) {
        return {
          error: {
            status: 400,
            message: `Not enough stock for ${product.name}`,
          },
        };
      }
      const resolved = resolveUnitPrice(product, qty, channel);
      if (resolved.unitKs == null) {
        return {
          error: {
            status: 400,
            message: `No price for ${product.name}`,
          },
        };
      }
      priced.push({
        productId: product.id,
        productName: product.name,
        qty,
        unitKs: resolved.unitKs,
        lineTotalKs: resolved.unitKs * qty,
        channel: resolved.channel,
        byQty: Boolean(resolved.byQty),
      });
    } else {
      if (line.unitKs == null || !line.productName) {
        return {
          error: {
            status: 400,
            message: "productId or (productName + unitKs) required per line",
          },
        };
      }
      priced.push({
        productId: null,
        productName: line.productName,
        qty,
        unitKs: line.unitKs,
        lineTotalKs: line.unitKs * qty,
        channel: channel === "b2b" ? "b2b" : "b2c",
        byQty: false,
      });
    }
  }
  return { lines: priced };
}

/** Map request + source → website | app | qr | instore */
function resolveClientSurface(req, source, bodySurface) {
  if (source === "pos") return "instore";
  if (source === "qr_guest") return "qr";
  if (
    bodySurface === "website" ||
    bodySurface === "app" ||
    bodySurface === "qr" ||
    bodySurface === "instore"
  ) {
    return bodySurface;
  }
  const h = String(req?.headers?.["x-qr-client"] || "").toLowerCase();
  if (h === "app" || h === "android" || h === "ios") return "app";
  if (h === "qr") return "qr";
  if (h === "web" || h === "website") return "website";
  if (source === "shop_view") return "website";
  return "website";
}

async function createOrderPayload(
  b,
  {
    buyerId,
    buyerPhone,
    source,
    requirePhoneB2bGate = false,
    clientSurface,
    profileAddress,
    profileTownshipId,
  },
) {
  const phone = normalizePhone(buyerPhone);
  const shop = await prisma.shop.findUnique({ where: { id: b.shopId } });
  if (!shop || shop.status !== "approved") {
    return { error: { status: 400, message: "Shop is not available for orders" } };
  }

  const pricedEarly = await resolveLines(b.shopId, b.channel, b.lines);
  if (pricedEarly.error) return { error: pricedEarly.error };
  const usedQtyWholesale = pricedEarly.lines.some((l) => l.byQty);
  const effectiveChannel = pricedEarly.lines.some((l) => l.channel === "b2b")
    ? "b2b"
    : "b2c";

  const channelCheck = await assertChannelAllowed(
    b.shopId,
    phone,
    effectiveChannel,
    {
      requirePhoneB2bGate,
      allowQtyWholesale: usedQtyWholesale,
    },
  );
  if (!channelCheck.ok) {
    return { error: { status: 403, message: channelCheck.message } };
  }

  const { isPlatformPaymentActive } = await import("../lib/platform-payments.js");
  if (!(await isPlatformPaymentActive(b.payment))) {
    return {
      error: { status: 400, message: `Payment ${b.payment} is not available` },
    };
  }
  const paymentOk = await prisma.shopPaymentMethod.findFirst({
    where: { shopId: b.shopId, method: b.payment, enabled: true },
  });
  // COD is always allowed if no payment rows configured yet
  const anyPayments = await prisma.shopPaymentMethod.count({
    where: { shopId: b.shopId },
  });
  if (anyPayments > 0 && !paymentOk && b.payment !== "cash") {
    return {
      error: { status: 400, message: `Payment ${b.payment} is not enabled` },
    };
  }

  const payId = String(b.payment || "").toLowerCase();
  const slipUrl = String(b.paymentSlipUrl || "").trim() || null;
  if (isWalletPayment(payId) && !slipUrl) {
    return {
      error: {
        status: 400,
        message: "Upload a payment slip for this wallet method",
      },
    };
  }
  const paymentSlipUrl = isWalletPayment(payId) ? slipUrl : null;
  const buyerNote = String(b.buyerNote || "").trim().slice(0, 1000) || null;
  const preferredRaw = String(b.preferredDeliveryDate || "").trim();
  const preferredDeliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(preferredRaw)
    ? preferredRaw
    : null;

  const profileAddressLine = String(profileAddress || "").trim();
  const profileTownship = String(profileTownshipId || "").trim() || null;

  let deliveryFeeKs = b.deliveryFeeKs ?? 0;
  let townshipId = b.townshipId ?? null;
  let townshipName = b.townshipName ?? null;
  let address = (b.address ?? "").trim();

  if (b.fulfillment === "delivery" || b.fulfillment === "express") {
    // Prefer cart township; else buyer's profile / default address township
    if (!townshipId && profileTownship) townshipId = profileTownship;
    if (!townshipId) {
      return {
        error: {
          status: 400,
          message:
            b.fulfillment === "express"
              ? "Express needs your township — update checkout location"
              : "Delivery needs your profile township — update Account → Addresses",
        },
      };
    }
    const township = await prisma.township.findUnique({ where: { id: townshipId } });
    if (!township?.active) {
      return { error: { status: 400, message: "Township is not published" } };
    }
    townshipName = townshipName || townshipLabel(township);
    const opts = await resolveDeliveryOptions(b.shopId, townshipId);
    if (b.fulfillment === "delivery") {
      if (!opts.canDelivery) {
        return {
          error: {
            status: 400,
            message: opts.contactShop
              ? "This township is outside the shop’s delivery zones — message the shop or choose pickup"
              : "This shop does not deliver to your area",
          },
        };
      }
      /** Server-authoritative — never trust client deliveryFeeKs. */
      deliveryFeeKs = opts.deliveryFeeKs ?? 0;
    } else {
      if (!opts.canExpress) {
        return {
          error: {
            status: 400,
            message: "Express is not available for this location",
          },
        };
      }
      /** Server-authoritative — never trust client deliveryFeeKs. */
      deliveryFeeKs = opts.expressFeeKs ?? 0;
    }
    if (!address) address = profileAddressLine;
  } else if (b.fulfillment === "pickup") {
    // Pickup: no delivery fee / township. Stamp profile address for merchant contact only.
    deliveryFeeKs = 0;
    townshipId = null;
    townshipName = null;
    if (!address || /pickup/i.test(address)) {
      address = profileAddressLine || address || "Pickup at shop";
    }
  }

  const priced = pricedEarly;

  const subtotalKs = priced.lines.reduce((s, l) => s + l.lineTotalKs, 0);
  const totalKs = subtotalKs + deliveryFeeKs;

  const order = await prisma.$transaction(async (tx) => {
    for (const line of priced.lines) {
      if (!line.productId) continue;
      const updated = await tx.product.updateMany({
        where: { id: line.productId, stock: { gte: line.qty } },
        data: { stock: { decrement: line.qty } },
      });
      if (updated.count !== 1) {
        throw new Error(`STOCK:${line.productName}`);
      }
    }
    const code = await allocateOrderCode(tx, b.fulfillment);
    return tx.order.create({
      data: {
        code,
        shopId: b.shopId,
        buyerId,
        buyerName: b.buyerName.trim(),
        buyerPhone: phone,
        address,
        buyerNote,
        preferredDeliveryDate,
        channel: effectiveChannel,
        fulfillment: b.fulfillment,
        payment: b.payment,
        paymentSlipUrl,
        source: source ?? "marketplace",
        clientSurface: clientSurface ?? "website",
        stage: "request",
        townshipId,
        townshipName,
        deliveryFeeKs,
        subtotalKs,
        totalKs,
        lines: {
          create: priced.lines.map((l) => ({
            productId: l.productId,
            productName: l.productName,
            qty: l.qty,
            unitKs: l.unitKs,
            lineTotalKs: l.lineTotalKs,
          })),
        },
      },
      include: { lines: true, shop: { select: { id: true, name: true } } },
    });
  });

  publishOrderEvent(order, "created");
  notifyShopNewOrder(order);
  return { order };
}

function canViewOrder(req, order) {
  if (req.authKind === "guest") {
    return (
      order.shopId === req.guest.shopId &&
      order.buyerPhone === normalizePhone(req.guest.phone) &&
      !order.buyerId
    );
  }
  const role = req.user.role;
  if (role === "buyer") return order.buyerId === req.user.sub;
  if (role === "merchant" || role === "staff") {
    return order.shopId === req.user.shopId;
  }
  if (role === "admin" || role === "super_admin") return true;
  return false;
}

/**
 * POST /api/checkout — Marketplace multi-shop cart
 * One Order per package (shop). Server prices + stock.
 */
router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid checkout payload");

    let buyerId = null;
    let buyerPhone = null;
    let defaultAddress = null;
    let defaultTownshipId = null;
    let defaultName = parsed.data.buyerName;

    if (req.user.role === "buyer") {
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        include: { addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } },
      });
      if (!user) return fail(res, 404, "User not found");
      buyerId = user.id;
      buyerPhone = user.phone;
      const defAddr = user.addresses.find((a) => a.isDefault) ?? user.addresses[0];
      defaultAddress = defAddr?.location || user.address || null;
      defaultTownshipId = defAddr?.townshipId || user.townshipId || null;
      defaultName = defaultName || user.name;
    }
    if (!buyerPhone) return fail(res, 400, "Buyer phone required — sign in as buyer");
    if (!defaultName) return fail(res, 400, "buyerName required");

    const created = [];
    for (const pkg of parsed.data.packages) {
      const src = pkg.source ?? "marketplace";
      const result = await createOrderPayload(
        {
          ...pkg,
          buyerName: pkg.buyerName || defaultName,
          address: pkg.address || defaultAddress || "",
          townshipId: pkg.townshipId || defaultTownshipId || undefined,
        },
        {
          buyerId,
          buyerPhone,
          source: src,
          clientSurface: resolveClientSurface(req, src, pkg.clientSurface),
          profileAddress: defaultAddress,
          profileTownshipId: defaultTownshipId,
        },
      );
      if (result.error) {
        return fail(res, result.error.status, result.error.message);
      }
      created.push(result.order);
    }

    return ok(
      res,
      {
        orders: created,
        orderIds: created.map((o) => o.id),
        totalKs: created.reduce((s, o) => s + o.totalKs, 0),
      },
      { created: true },
    );
  } catch (err) {
    if (String(err.message || "").startsWith("STOCK:")) {
      return fail(res, 400, `Not enough stock for ${err.message.slice(6)}`);
    }
    console.error("checkout", err);
    return fail(res, 500, "Checkout failed", "db_error");
  }
});

/**
 * POST /api/orders/guest — one-time buyer (guest JWT from QR)
 */
router.post("/guest", requireGuest, async (req, res) => {
  try {
    const parsed = placeSchema.safeParse({
      ...req.body,
      shopId: req.body.shopId || req.guest.shopId,
    });
    if (!parsed.success) return fail(res, 400, "Invalid guest order payload");

    if (parsed.data.shopId !== req.guest.shopId) {
      return fail(res, 403, "Guest session is for a different shop");
    }

    const src = parsed.data.source ?? "qr_guest";
    const result = await createOrderPayload(parsed.data, {
      buyerId: null,
      buyerPhone: req.guest.phone,
      source: src,
      clientSurface: resolveClientSurface(req, src, parsed.data.clientSurface),
      requirePhoneB2bGate: true,
    });
    if (result.error) {
      return fail(res, result.error.status, result.error.message);
    }
    return ok(res, withNormalizedStage(result.order), { created: true, guest: true });
  } catch (err) {
    if (String(err.message || "").startsWith("STOCK:")) {
      return fail(res, 400, `Not enough stock for ${err.message.slice(6)}`);
    }
    console.error("guest order", err);
    return fail(res, 500, "Could not place guest order", "db_error");
  }
});

/**
 * POST /api/orders — registered buyer only (single shop).
 * Guests use POST /api/orders/guest. Merchants/staff/admin cannot place marketplace orders here.
 */
router.post("/", requireAuth, requireRole("buyer"), async (req, res) => {
  try {
    const parsed = placeSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid order payload");

    let buyerPhone = parsed.data.buyerPhone;
    let buyerId = null;
    let address = parsed.data.address;
    let profileAddress = null;
    let profileTownshipId = null;

    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } },
    });
    if (!user) return fail(res, 404, "User not found");
    buyerId = user.id;
    buyerPhone = user.phone || buyerPhone;
    const defAddr = user.addresses.find((a) => a.isDefault) ?? user.addresses[0];
    profileAddress = defAddr?.location || user.address || null;
    profileTownshipId = defAddr?.townshipId || user.townshipId || null;
    if (!address) address = profileAddress;

    if (!buyerPhone) return fail(res, 400, "buyerPhone required");

    const src = parsed.data.source ?? "marketplace";
    const result = await createOrderPayload(
      {
        ...parsed.data,
        address,
        townshipId: parsed.data.townshipId || profileTownshipId || undefined,
      },
      {
        buyerId,
        buyerPhone,
        source: src,
        clientSurface: resolveClientSurface(req, src, parsed.data.clientSurface),
        profileAddress,
        profileTownshipId,
      },
    );
    if (result.error) {
      return fail(res, result.error.status, result.error.message);
    }
    return ok(res, withNormalizedStage(result.order), { created: true });
  } catch (err) {
    if (String(err.message || "").startsWith("STOCK:")) {
      return fail(res, 400, `Not enough stock for ${err.message.slice(6)}`);
    }
    console.error("place order", err);
    return fail(res, 500, "Could not place order", "db_error");
  }
});

const trackPhoneSchema = z.object({
  phone: z.string().min(6),
});

function publicTrackOrder(order) {
  const lines = order.lines ?? [];
  const itemCount = lines.reduce((s, l) => s + (l.qty || 0), 0) || 1;
  const productName =
    lines.map((l) => l.productName).filter(Boolean).join(", ") || "Order items";
  return withNormalizedStage({
    id: order.id,
    code: order.code,
    shopId: order.shopId,
    shop: order.shop
      ? { id: order.shop.id, name: order.shop.name }
      : undefined,
    buyerName: order.buyerName,
    buyerPhone: order.buyerPhone,
    address: order.address,
    buyerNote: order.buyerNote || null,
    preferredDeliveryDate: order.preferredDeliveryDate || null,
    fulfillment: order.fulfillment,
    payment: order.payment,
    stage: order.stage,
    subtotalKs: order.subtotalKs,
    deliveryFeeKs: order.deliveryFeeKs,
    totalKs: order.totalKs,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    lines: lines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      qty: l.qty,
      unitKs: l.unitKs,
      lineTotalKs: l.lineTotalKs,
    })),
    itemCount,
    productName,
  });
}

/**
 * POST /api/orders/track — public lookup by buyer phone (Marketplace Track order).
 * Must stay before /:id so "track" is not treated as an order id.
 */
router.post("/track", async (req, res) => {
  try {
    const parsed = trackPhoneSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Enter a valid phone number");
    const phone = normalizePhone(parsed.data.phone);
    if (phone.length < 6) return fail(res, 400, "Enter a valid phone number");

    const orders = await prisma.order.findMany({
      where: { buyerPhone: phone },
      include: {
        lines: true,
        shop: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return ok(res, orders.map(publicTrackOrder));
  } catch (err) {
    console.error("track orders by phone", err);
    return fail(res, 500, "Could not look up orders", "db_error");
  }
});

/**
 * POST /api/orders/track/:id — public order detail when phone matches the order.
 */
router.post("/track/:id", async (req, res) => {
  try {
    const parsed = trackPhoneSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Enter a valid phone number");
    const phone = normalizePhone(parsed.data.phone);
    const key = String(req.params.id || "").trim();
    if (!key) return fail(res, 404, "Order not found");

    const include = {
      lines: true,
      shop: { select: { id: true, name: true, slug: true } },
    };
    let order = await prisma.order.findUnique({ where: { id: key }, include });
    if (!order && looksLikeOrderCode(key)) {
      order = await prisma.order.findUnique({
        where: { code: key.toLowerCase() },
        include,
      });
    }
    if (!order) return fail(res, 404, "Order not found");
    if (normalizePhone(order.buyerPhone) !== phone) {
      return fail(res, 403, "Phone does not match this order");
    }
    return ok(res, publicTrackOrder(order));
  } catch (err) {
    console.error("track order detail", err);
    return fail(res, 500, "Could not load order", "db_error");
  }
});

/** GET /api/orders — list by role */
router.get("/", requireUserOrGuest, async (req, res) => {
  try {
    if (req.authKind === "guest") {
      const orders = await prisma.order.findMany({
        where: {
          shopId: req.guest.shopId,
          buyerPhone: normalizePhone(req.guest.phone),
          buyerId: null,
        },
        include: { lines: true, shop: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return ok(res, orders.map(withNormalizedStage));
    }

    const { shopId, stage, source } = req.query;
    const where = {};

    if (req.user.role === "merchant" || req.user.role === "staff") {
      if (!req.user.shopId) return fail(res, 403, "No shop on account");
      where.shopId = req.user.shopId;
    } else if (req.user.role === "buyer") {
      where.buyerId = req.user.sub;
    } else if (
      (req.user.role === "admin" || req.user.role === "super_admin") &&
      shopId
    ) {
      where.shopId = String(shopId);
    }

    const stageFilter = expandStageFilter(stage);
    if (stageFilter) where.stage = stageFilter;
    if (source) where.source = String(source);

    const orders = await prisma.order.findMany({
      where,
      include: { lines: true, shop: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(res, orders.map(withNormalizedStage));
  } catch (err) {
    console.error("list orders", err);
    return fail(res, 500, "Could not list orders", "db_error");
  }
});

/**
 * POST /api/orders/mark-read — merchant/staff mark orders opened (bulk).
 * Body: { ids: string[] }
 */
router.post(
  "/mark-read",
  requireAuth,
  requireRole("merchant", "staff"),
  async (req, res) => {
    try {
      await ensureOrderMerchantLastReadColumn().catch(() => {});
      const shopId = req.user.shopId;
      if (!shopId) return fail(res, 403, "No shop on account");
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      if (ids.length === 0) return fail(res, 400, "ids required");
      const now = new Date();
      const result = await prisma.order.updateMany({
        where: { shopId, id: { in: ids.slice(0, 200) } },
        data: { merchantLastReadAt: now },
      });
      return ok(res, { updated: result.count });
    } catch (err) {
      console.error("orders mark-read", err);
      return fail(res, 500, "Could not mark orders read", "db_error");
    }
  },
);

/** GET /api/orders/:id — order detail by cuid or short code (d1214 / p12431) */
router.get("/:id", requireUserOrGuest, async (req, res) => {
  try {
    if (
      req.params.id === "checkout" ||
      req.params.id === "guest" ||
      req.params.id === "track" ||
      req.params.id === "mark-read"
    ) {
      return fail(res, 404, "Not found");
    }
    const key = String(req.params.id || "").trim();
    const include = {
      lines: true,
      shop: { select: { id: true, name: true, slug: true } },
    };
    let order = await prisma.order.findUnique({
      where: { id: key },
      include,
    });
    if (!order && looksLikeOrderCode(key)) {
      order = await prisma.order.findUnique({
        where: { code: key.toLowerCase() },
        include,
      });
    }
    if (!order) return fail(res, 404, "Order not found");
    if (!canViewOrder(req, order)) {
      return fail(res, 403, "Not allowed to view this order");
    }

    const isMerchantSide =
      req.authKind !== "guest" &&
      (req.user?.role === "merchant" || req.user?.role === "staff") &&
      order.shopId === req.user?.shopId;
    if (isMerchantSide) {
      await ensureOrderMerchantLastReadColumn().catch(() => {});
      order = await prisma.order.update({
        where: { id: order.id },
        data: { merchantLastReadAt: new Date() },
        include,
      });
    }

    return ok(res, withNormalizedStage(order));
  } catch (err) {
    console.error("get order", err);
    return fail(res, 500, "Could not load order", "db_error");
  }
});

router.patch(
  "/:id/stage",
  requireAuth,
  requireRole("merchant", "staff", "admin"),
  async (req, res) => {
    const { recordOrderStockOut } = await import("../lib/stock-moves.js");
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!order) return fail(res, 404, "Order not found");
    if (
      req.user.role !== "admin" &&
      req.user.role !== "super_admin" &&
      order.shopId !== req.user.shopId
    ) {
      return fail(res, 403, "Not your shop order");
    }

    const action = String(req.body.action || "").toLowerCase();
    const data = {};

    /** Approve / Deny on new requests — does not change fulfillment */
    if (action === "accept" || action === "approve") {
      if (order.stage === "cancelled" || order.stage === "completed") {
        return fail(res, 400, "Order already closed");
      }
      data.stage = "approved";
    } else if (action === "deny") {
      data.stage = "cancelled";
    } else {
      let stage = req.body.stage ? String(req.body.stage) : null;
      if (stage && !WRITABLE_STAGES.has(stage)) {
        return fail(res, 400, `Invalid stage: ${stage}`);
      }
      /** Legacy client aliases → current pipeline */
      if (stage === "delivery" || stage === "invoiced") stage = "out_for_delivery";
      if (stage === "pickup") stage = "ready_pickup";

      if (stage) data.stage = stage;

      if (req.body.pickupReserved != null) {
        data.pickupReserved = Boolean(req.body.pickupReserved);
        if (data.pickupReserved && !stage) data.stage = "ready_pickup";
      }
      if (data.stage === "ready_pickup") {
        data.pickupReserved = true;
      }
    }

    if (
      req.user.role === "merchant" ||
      req.user.role === "staff"
    ) {
      await ensureOrderMerchantLastReadColumn().catch(() => {});
      data.merchantLastReadAt = new Date();
    }

    if (Object.keys(data).length === 0) {
      return fail(res, 400, "Nothing to update");
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data,
      include: { lines: true },
    });

    /** Stock OUT when order leaves approved into out/ready/complete — not on Approve alone */
    const shouldOut =
      shouldStockOutForStage(updated.stage, action) ||
      (updated.pickupReserved === true &&
        normalizeOrderStage(updated.stage) === "ready_pickup");
    if (shouldOut && updated.stage !== "cancelled") {
      try {
        await recordOrderStockOut(updated);
      } catch (e) {
        console.warn("stock out", e);
      }
    }

    publishOrderEvent(updated, "updated");
    return ok(res, withNormalizedStage(updated));
  },
);

export default router;
