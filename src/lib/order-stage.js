/**
 * Order stage pipeline + legacy mapping.
 *
 * Current: request → approved → out_for_delivery | ready_pickup → completed
 * Legacy rows may still have delivery | pickup | invoiced.
 */

export const ACTIVE_PIPELINE_STAGES = [
  "request",
  "approved",
  "out_for_delivery",
  "ready_pickup",
];

export const OPEN_STAGES = [...ACTIVE_PIPELINE_STAGES, "delivery", "pickup", "invoiced"];

/** Normalize DB stage for clients (legacy → current). */
export function normalizeOrderStage(stage) {
  const s = String(stage || "request");
  if (s === "delivery" || s === "invoiced") return "out_for_delivery";
  if (s === "pickup") return "ready_pickup";
  return s;
}

/** Stages that mean “ready for counter collect” (POS + merchant). */
export function isReadyPickupStage(stage, pickupReserved = false) {
  const n = normalizeOrderStage(stage);
  if (n === "ready_pickup") return true;
  return String(stage) === "pickup" && Boolean(pickupReserved);
}

/** Whether stock should leave inventory for this stage transition. */
export function shouldStockOutForStage(stage, action) {
  if (action === "accept") return false;
  const n = normalizeOrderStage(stage);
  return (
    n === "out_for_delivery" ||
    n === "ready_pickup" ||
    n === "completed" ||
    stage === "delivery" ||
    stage === "pickup" ||
    stage === "invoiced"
  );
}

/** Attach normalized stage on order JSON for API responses. */
export function withNormalizedStage(order) {
  if (!order || typeof order !== "object") return order;
  const stage = normalizeOrderStage(order.stage);
  return { ...order, stage, stageRaw: order.stage };
}
