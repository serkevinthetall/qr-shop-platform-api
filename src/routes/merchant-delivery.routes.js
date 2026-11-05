import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import {
  enrichZones,
  packZonesJson,
  parseExpressStates,
  unpackZonesJson,
} from "../lib/delivery-fee.js";
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

const zoneItemSchema = z.object({
  townshipId: z.string().min(1),
  feeKs: z.coerce.number().int().nonnegative(),
});

const expressStateSchema = z.object({
  state: z.string().min(1),
  feeKs: z.coerce.number().int().nonnegative(),
});

async function cleanZones(zones) {
  const cleaned = [];
  const seen = new Set();
  for (const z of zones) {
    if (seen.has(z.townshipId)) continue;
    const t = await prisma.township.findUnique({ where: { id: z.townshipId } });
    if (!t || !t.active) {
      const err = new Error(`Township not published: ${z.townshipId}`);
      err.code = "township_not_published";
      throw err;
    }
    seen.add(z.townshipId);
    cleaned.push({
      townshipId: z.townshipId,
      feeKs: Math.max(0, Math.floor(z.feeKs)),
    });
  }
  return cleaned;
}

async function cleanExpressStates(rows) {
  const published = await prisma.township.findMany({
    where: { active: true },
    select: { state: true },
  });
  const allowed = new Set(published.map((t) => t.state).filter(Boolean));
  const cleaned = [];
  const seen = new Set();
  for (const row of rows) {
    const state = String(row.state || "").trim();
    if (!state || !allowed.has(state)) {
      const err = new Error(`State not published: ${state || "(empty)"}`);
      err.code = "state_not_published";
      throw err;
    }
    const key = state.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({
      state,
      feeKs: Math.max(0, Math.floor(row.feeKs)),
    });
  }
  return cleaned;
}

function availableStates(published, expressStates) {
  const used = new Set(expressStates.map((s) => s.state.toLowerCase()));
  const allStates = [];
  const stateSeen = new Set();
  for (const t of published) {
    if (!t.state || stateSeen.has(t.state.toLowerCase())) continue;
    stateSeen.add(t.state.toLowerCase());
    allStates.push(t.state);
  }
  return allStates.filter((s) => !used.has(s.toLowerCase()));
}

/**
 * GET /api/merchant/delivery
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
      expressEnabled: false,
      zonesJson: [],
    };

    const packed = unpackZonesJson(settings.zonesJson);
    const zones = await enrichZones(packed.zones);
    const expressStates = parseExpressStates(packed.expressStates);
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
      expressStates,
      expressZones: [],
      availableTownships: available,
      availableExpressStates: availableStates(published, expressStates),
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
  expressFeeKs: z.coerce.number().int().nonnegative().optional(),
  zones: z.array(zoneItemSchema).optional(),
  expressStates: z.array(expressStateSchema).optional(),
  /** Ignore legacy township express payloads */
  expressZones: z.array(z.any()).optional(),
});

/**
 * PUT /api/merchant/delivery
 */
router.put("/delivery", async (req, res) => {
  try {
    const shopId = shopIdOrFail(req, res);
    if (!shopId) return;
    if (req.user.role === "staff") {
      return fail(res, 403, "Staff cannot change delivery zones");
    }

    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
      const detail = parsed.error?.issues?.[0]?.message || "Invalid delivery payload";
      return fail(res, 400, detail, "invalid_payload");
    }

    const existing = await prisma.shopDelivery.findUnique({ where: { shopId } });
    const current = unpackZonesJson(existing?.zonesJson);

    let zonesJson;
    let nextZones = current.zones;
    let nextExpress = current.expressStates;
    try {
      if (parsed.data.zones) {
        nextZones = await cleanZones(parsed.data.zones);
      }
      if (parsed.data.expressStates) {
        nextExpress = await cleanExpressStates(parsed.data.expressStates);
      }
      if (parsed.data.zones || parsed.data.expressStates) {
        zonesJson = packZonesJson(nextZones, nextExpress);
      }
    } catch (e) {
      if (e?.code === "township_not_published" || e?.code === "state_not_published") {
        return fail(res, 400, e.message, e.code);
      }
      throw e;
    }

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
          (Array.isArray(nextZones) && nextZones.length > 0),
        pickupEnabled: parsed.data.pickupEnabled ?? true,
        expressEnabled:
          parsed.data.expressEnabled ??
          (Array.isArray(nextExpress) && nextExpress.length > 0),
        expressFeeKs: expressFeeKs ?? 0,
        zonesJson: zonesJson ?? packZonesJson([], []),
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

    if (
      zonesJson != null &&
      nextZones.length > 0 &&
      parsed.data.deliveryEnabled === undefined &&
      !existing?.deliveryEnabled
    ) {
      await prisma.shopDelivery.update({
        where: { shopId },
        data: { deliveryEnabled: true },
      });
      next.deliveryEnabled = true;
    }
    if (
      zonesJson != null &&
      nextExpress.length > 0 &&
      parsed.data.expressEnabled === undefined &&
      !existing?.expressEnabled
    ) {
      await prisma.shopDelivery.update({
        where: { shopId },
        data: { expressEnabled: true },
      });
      next.expressEnabled = true;
    }

    const packed = unpackZonesJson(next.zonesJson);
    const zones = await enrichZones(packed.zones);
    const expressStates = parseExpressStates(packed.expressStates);
    const published = await prisma.township.findMany({
      where: { active: true },
      select: { state: true },
    });
    return ok(res, {
      shopId,
      deliveryEnabled: Boolean(next.deliveryEnabled),
      pickupEnabled: next.pickupEnabled !== false,
      expressEnabled: Boolean(next.expressEnabled),
      expressFeeKs: Math.max(0, Math.floor(Number(next.expressFeeKs) || 0)),
      zones,
      expressStates,
      expressZones: [],
      availableExpressStates: availableStates(published, expressStates),
    });
  } catch (err) {
    console.error("merchant delivery put", err);
    const detail = String(err?.message || "").slice(0, 180);
    return fail(
      res,
      500,
      detail ? `Could not save delivery settings: ${detail}` : "Could not save delivery settings",
      "db_error",
    );
  }
});

export default router;
