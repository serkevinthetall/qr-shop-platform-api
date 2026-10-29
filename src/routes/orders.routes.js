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
import { getDeliveryFeeForTownship } from "../lib/delivery-fee.js";
import { townshipLabel } from "../lib/township.js";
import { unitPriceForChannel } from "../lib/mall-product.js";
import { publishOrderEvent } from "../lib/realtime.js";
import { allocateOrderCode, looksLikeOrderCode } from "../lib/order-code.js";

const router = Router();

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
  fulfillment: z.enum(["delivery", "pickup"]),
  payment: z.enum(["cod", "kpay", "uabpay", "ayapay", "cbpay", "mmqr", "cash"]),
  lines: z.array(lineSchema).min(1),
  deliveryFeeKs: z.number().int().nonnegative().optional(),
  townshipId: z.string().optional(),
  townshipName: z.string().optional(),
  source: z.enum(["marketplace", "pos", "shop_view", "qr_guest"]).optional(),
  /** website | app | qr | instore — where the buyer placed the order */
  clientSurface: z.enum(["website", "app", "qr", "instore"]).optional(),
});

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
  { requirePhoneB2bGate = false } = {},
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
      const unitKs = unitPriceForChannel(product, channel);
      if (unitKs == null) {
        return {
          error: {
            status: 400,
            message: `No ${channel.toUpperCase()} price for ${product.name}`,
          },
        };
      }
      priced.push({
        productId: product.id,
        productName: product.name,
        qty,
        unitKs,
        lineTotalKs: unitKs * qty,
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

  const channelCheck = await assertChannelAllowed(b.shopId, phone, b.channel, {
    requirePhoneB2bGate,
  });
  if (!channelCheck.ok) {
    return { error: { status: 403, message: channelCheck.message } };
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

  const profileAddressLine = String(profileAddress || "").trim();
  const profileTownship = String(profileTownshipId || "").trim() || null;

  let deliveryFeeKs = b.deliveryFeeKs ?? 0;
  let townshipId = b.townshipId ?? null;
  let townshipName = b.townshipName ?? null;
  let address = (b.address ?? "").trim();

  if (b.fulfillment === "delivery") {
    // Prefer cart township; else buyer's profile / default address township
    if (!townshipId && profileTownship) townshipId = profileTownship;
    if (!townshipId) {
      return {
        error: {
          status: 400,
          message: "Delivery needs your profile township — update Account → Addresses",
        },
      };
    }
    const township = await prisma.township.findUnique({ where: { id: townshipId } });
    if (!township?.active) {
      return { error: { status: 400, message: "Township is not published" } };
    }
    townshipName = townshipName || townshipLabel(township);
    if (b.deliveryFeeKs == null) {
      const fee = await getDeliveryFeeForTownship(b.shopId, townshipId);
      if (fee == null) {
        return {
          error: {
            status: 400,
            message: "This shop does not deliver to your area",
          },
        };
      }
      deliveryFeeKs = fee;
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

  const priced = await resolveLines(b.shopId, b.channel, b.lines);
  if (priced.error) return { error: priced.error };

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
        channel: b.channel,
        fulfillment: b.fulfillment,
        payment: b.payment,
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
    return ok(res, result.order, { created: true, guest: true });
  } catch (err) {
    if (String(err.message || "").startsWith("STOCK:")) {
      return fail(res, 400, `Not enough stock for ${err.message.slice(6)}`);
    }
    console.error("guest order", err);
    return fail(res, 500, "Could not place guest order", "db_error");
  }
});

/**
 * POST /api/orders — registered buyer (single shop)
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = placeSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid order payload");

    let buyerPhone = parsed.data.buyerPhone;
    let buyerId = null;
    let address = parsed.data.address;
    let profileAddress = null;
    let profileTownshipId = null;

    if (req.user.role === "buyer") {
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
    }

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
    return ok(res, result.order, { created: true });
  } catch (err) {
    if (String(err.message || "").startsWith("STOCK:")) {
      return fail(res, 400, `Not enough stock for ${err.message.slice(6)}`);
    }
    console.error("place order", err);
    return fail(res, 500, "Could not place order", "db_error");
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
      return ok(res, orders);
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

    if (stage) where.stage = String(stage);
    if (source) where.source = String(source);

    const orders = await prisma.order.findMany({
      where,
      include: { lines: true, shop: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(res, orders);
  } catch (err) {
    console.error("list orders", err);
    return fail(res, 500, "Could not list orders", "db_error");
  }
});

/** GET /api/orders/:id — order detail by cuid or short code (d1214 / p12431) */
router.get("/:id", requireUserOrGuest, async (req, res) => {
  try {
    if (req.params.id === "checkout" || req.params.id === "guest") {
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
    return ok(res, order);
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
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return fail(res, 404, "Order not found");
    if (
      req.user.role !== "admin" &&
      req.user.role !== "super_admin" &&
      order.shopId !== req.user.shopId
    ) {
      return fail(res, 403, "Not your shop order");
    }

    const stage = req.body.stage;
    const pickupReserved = Boolean(req.body.pickupReserved);
    const data = {};
    if (stage) data.stage = stage;
    if (req.body.pickupReserved != null) {
      data.pickupReserved = pickupReserved;
      if (pickupReserved) data.stage = "pickup";
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data,
      include: { lines: true },
    });
    publishOrderEvent(updated, "updated");
    return ok(res, updated);
  },
);

export default router;
