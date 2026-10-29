import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { shopIdOrFail } from "../lib/merchant-auth.js";
import { normalizePhone } from "../lib/phone.js";
import { unitPriceForChannel } from "../lib/mall-product.js";
import { publishOrderEvent } from "../lib/realtime.js";
import { allocateOrderCode } from "../lib/order-code.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

async function assertPosModule(shopId, res) {
  const features = await prisma.shopFeatures.findUnique({ where: { shopId } });
  if (!features?.posEnabled) {
    fail(res, 403, "POS module is off — enable it in Modules");
    return false;
  }
  return true;
}

const chargeSchema = z.object({
  buyerName: z.string().min(1).optional(),
  buyerPhone: z.string().optional(),
  payment: z
    .enum(["cash", "cod", "kpay", "uabpay", "ayapay", "cbpay", "mmqr"])
    .default("cash"),
  channel: z.enum(["b2c", "b2b"]).default("b2c"),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().positive(),
        /** Optional override (e.g. custom discount at till) */
        unitKs: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1),
});

/**
 * POST /api/merchant/pos/charge
 * In-store sale → Order source=pos, stage=completed, stock decremented.
 */
router.post("/pos/charge", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!(await assertPosModule(shopId, res))) return;

    const parsed = chargeSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid POS charge");

    const { payment, channel, lines: rawLines } = parsed.data;
    const buyerName = (parsed.data.buyerName || "Walk-in").trim();
    const buyerPhone = parsed.data.buyerPhone
      ? normalizePhone(parsed.data.buyerPhone)
      : "pos-walkin";

    const priced = [];
    for (const line of rawLines) {
      const product = await prisma.product.findFirst({
        where: { id: line.productId, shopId, active: true },
      });
      if (!product) {
        return fail(res, 400, `Product not found: ${line.productId}`);
      }
      if (product.stock < line.qty) {
        return fail(res, 400, `Not enough stock for ${product.name}`);
      }
      const unitKs =
        line.unitKs != null
          ? line.unitKs
          : unitPriceForChannel(product, channel);
      if (unitKs == null) {
        return fail(
          res,
          400,
          `No ${channel.toUpperCase()} price for ${product.name}`,
        );
      }
      priced.push({
        productId: product.id,
        productName: product.name,
        qty: line.qty,
        unitKs,
        lineTotalKs: unitKs * line.qty,
      });
    }

    const subtotalKs = priced.reduce((s, l) => s + l.lineTotalKs, 0);

    const order = await prisma.$transaction(async (tx) => {
      for (const line of priced) {
        const updated = await tx.product.updateMany({
          where: {
            id: line.productId,
            shopId,
            stock: { gte: line.qty },
          },
          data: { stock: { decrement: line.qty } },
        });
        if (updated.count !== 1) {
          throw new Error(`STOCK:${line.productName}`);
        }
      }

      const code = await allocateOrderCode(tx, "pickup");
      return tx.order.create({
        data: {
          code,
          shopId,
          buyerId: null,
          buyerName,
          buyerPhone,
          address: "In-store",
          channel,
          fulfillment: "pickup",
          payment,
          source: "pos",
          clientSurface: "instore",
          stage: "completed",
          deliveryFeeKs: 0,
          subtotalKs,
          totalKs: subtotalKs,
          pickupReserved: false,
          lines: {
            create: priced.map((l) => ({
              productId: l.productId,
              productName: l.productName,
              qty: l.qty,
              unitKs: l.unitKs,
              lineTotalKs: l.lineTotalKs,
            })),
          },
        },
        include: { lines: true },
      });
    });

    return ok(res.status(201), order);
  } catch (err) {
    if (String(err?.message || "").startsWith("STOCK:")) {
      return fail(res, 400, `Not enough stock for ${err.message.slice(6)}`);
    }
    console.error("merchant pos charge", err);
    return fail(res, 500, "Could not complete POS sale", "db_error");
  }
});

/**
 * GET /api/merchant/pos/orders
 * Recent in-store orders (Orders → In-store).
 */
router.get("/pos/orders", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!(await assertPosModule(shopId, res))) return;

    const orders = await prisma.order.findMany({
      where: { shopId, source: "pos" },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(res, orders);
  } catch (err) {
    console.error("merchant pos orders", err);
    return fail(res, 500, "Could not load POS orders", "db_error");
  }
});

/**
 * GET /api/merchant/pos/reserved-pickups
 * Mall pickup orders reserved at the counter (ready for POS collect).
 */
router.get("/pos/reserved-pickups", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!(await assertPosModule(shopId, res))) return;

    const q = String(req.query.q || "").trim().toLowerCase();
    const orders = await prisma.order.findMany({
      where: {
        shopId,
        fulfillment: "pickup",
        pickupReserved: true,
        stage: "pickup",
        source: { not: "pos" },
      },
      include: { lines: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const filtered = !q
      ? orders
      : orders.filter((o) => {
          const hay = [
            o.id,
            o.code || "",
            o.buyerName,
            o.buyerPhone,
            ...(o.lines || []).map((l) => l.productName || ""),
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });

    return ok(res, filtered);
  } catch (err) {
    console.error("merchant pos reserved-pickups", err);
    return fail(res, 500, "Could not load reserved pickups", "db_error");
  }
});

/**
 * POST /api/merchant/pos/collect/:orderId
 * Hand over a reserved mall pickup at POS → complete the same order (no new sale).
 */
router.post("/pos/collect/:orderId", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (!(await assertPosModule(shopId, res))) return;

    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) return fail(res, 400, "Order id required");

    const order = await prisma.order.findFirst({
      where: { id: orderId, shopId },
      include: { lines: true },
    });
    if (!order) return fail(res, 404, "Order not found");
    if (order.source === "pos") {
      return fail(res, 400, "In-store POS sales are already completed");
    }
    if (order.fulfillment !== "pickup" || !order.pickupReserved || order.stage !== "pickup") {
      return fail(res, 400, "Order is not a reserved pickup ready to collect");
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { stage: "completed" },
      include: { lines: true },
    });
    publishOrderEvent(updated, "updated");
    return ok(res, updated);
  } catch (err) {
    console.error("merchant pos collect", err);
    return fail(res, 500, "Could not collect pickup", "db_error");
  }
});

export default router;
