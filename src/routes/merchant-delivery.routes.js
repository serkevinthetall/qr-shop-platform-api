import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { enrichZones } from "../lib/delivery-fee.js";
import { publicTownship } from "../lib/township.js";

const router = Router();

router.use(requireAuth, requireRole("merchant", "staff"));

function shopIdOrFail(req, res) {
  if (!req.user.shopId) {
    fail(res, 403, "No shop on account");
    return null;
  }
  return req.user.shopId;
}

/**
 * GET /api/merchant/delivery
 * Merchant Delivery tab — zones with fee + postal code (Admin-published townships only).
 */
router.get("/delivery", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;

    const delivery = await prisma.shopDelivery.findUnique({ where: { shopId } });
    const settings = delivery ?? {
      shopId,
      deliveryEnabled: false,
      pickupEnabled: true,
      zonesJson: [],
    };

    const zones = await enrichZones(settings.zonesJson);
    const published = await prisma.township.findMany({
      where: { active: true },
      orderBy: [{ state: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    const used = new Set(zones.map((z) => z.townshipId));
    const available = published
      .filter((t) => !used.has(t.id))
      .map(publicTownship);

    return ok(res, {
      shopId,
      deliveryEnabled: Boolean(settings.deliveryEnabled),
      pickupEnabled: settings.pickupEnabled !== false,
      expressEnabled: Boolean(settings.expressEnabled),
      expressFeeKs: Math.max(0, Math.floor(Number(settings.expressFeeKs) || 0)),
      zones,
      availableTownships: available,
    });
  } catch (err) {
    console.error("merchant delivery get", err);
    return fail(res, 500, "Could not load delivery settings", "db_error");
  }
});

const saveSchema = z.object({
  deliveryEnabled: z.boolean().optional(),
  pickupEnabled: z.boolean().optional(),
  expressEnabled: z.boolean().optional(),
  expressFeeKs: z.number().int().nonnegative().optional(),
  zones: z
    .array(
      z.object({
        townshipId: z.string().min(1),
        feeKs: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});

/**
 * PUT /api/merchant/delivery
 * Set pickup/delivery flags + move/reorder zones with per-township fee (Ks).
 * Only Admin-published (active) townships allowed.
 */
router.put("/delivery", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (req.user.role === "staff") {
      return fail(res, 403, "Staff cannot change delivery zones");
    }

    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid delivery payload");

    let zonesJson;
    if (parsed.data.zones) {
      const cleaned = [];
      const seen = new Set();
      for (const z of parsed.data.zones) {
        if (seen.has(z.townshipId)) continue;
        const t = await prisma.township.findUnique({ where: { id: z.townshipId } });
        if (!t || !t.active) {
          return fail(
            res,
            400,
            `Township not published: ${z.townshipId}`,
            "township_not_published",
          );
        }
        seen.add(z.townshipId);
        cleaned.push({
          townshipId: z.townshipId,
          feeKs: Math.max(0, Math.floor(z.feeKs)),
        });
      }
      zonesJson = cleaned;
    }

    const existing = await prisma.shopDelivery.findUnique({ where: { shopId } });
    const expressFeeKs =
      parsed.data.expressFeeKs != null
        ? Math.max(0, Math.floor(parsed.data.expressFeeKs))
        : undefined;
    const next = await prisma.shopDelivery.upsert({
      where: { shopId },
      create: {
        shopId,
        deliveryEnabled:
          parsed.data.deliveryEnabled ??
          (Array.isArray(zonesJson) && zonesJson.length > 0),
        pickupEnabled: parsed.data.pickupEnabled ?? true,
        expressEnabled: parsed.data.expressEnabled ?? false,
        expressFeeKs: expressFeeKs ?? 0,
        zonesJson: zonesJson ?? [],
      },
      update: {
        ...(parsed.data.deliveryEnabled != null
          ? { deliveryEnabled: parsed.data.deliveryEnabled }
          : {}),
        ...(parsed.data.pickupEnabled != null
          ? { pickupEnabled: parsed.data.pickupEnabled }
          : {}),
        ...(parsed.data.expressEnabled != null
          ? { expressEnabled: parsed.data.expressEnabled }
          : {}),
        ...(expressFeeKs != null ? { expressFeeKs } : {}),
        ...(zonesJson != null ? { zonesJson } : {}),
      },
    });

    // If zones added and delivery flag omitted, turn delivery on
    if (
      zonesJson != null &&
      zonesJson.length > 0 &&
      parsed.data.deliveryEnabled === undefined &&
      !existing?.deliveryEnabled
    ) {
      await prisma.shopDelivery.update({
        where: { shopId },
        data: { deliveryEnabled: true },
      });
      next.deliveryEnabled = true;
    }

    const zones = await enrichZones(next.zonesJson);
    return ok(res, {
      shopId,
      deliveryEnabled: Boolean(next.deliveryEnabled),
      pickupEnabled: next.pickupEnabled !== false,
      expressEnabled: Boolean(next.expressEnabled),
      expressFeeKs: Math.max(0, Math.floor(Number(next.expressFeeKs) || 0)),
      zones,
    });
  } catch (err) {
    console.error("merchant delivery put", err);
    return fail(res, 500, "Could not save delivery settings", "db_error");
  }
});

export default router;
