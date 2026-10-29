/**
 * Shop Marketplace presence derived from ShopFeatures.listingMode.
 *
 * Modes:
 * - b2c       → retail prices only, can order
 * - b2b       → wholesale prices only, can order
 * - both      → B2C + B2B prices, can order
 * - portfolio → showcase only, no checkout
 */

export const LISTING_MODES = ["b2c", "b2b", "both", "portfolio"];

export function normalizeListingMode(raw) {
  const m = String(raw || "").trim().toLowerCase();
  if (LISTING_MODES.includes(m)) return m;
  return null;
}

/** Map listingMode → flags used by pricing / orders / mall */
export function channelsFromListingMode(listingMode) {
  const mode = normalizeListingMode(listingMode) || "b2c";
  switch (mode) {
    case "b2b":
      return {
        listingMode: "b2b",
        b2cEnabled: false,
        b2bEnabled: true,
        portfolioOnly: false,
        canOrder: true,
      };
    case "both":
      return {
        listingMode: "both",
        b2cEnabled: true,
        b2bEnabled: true,
        portfolioOnly: false,
        canOrder: true,
      };
    case "portfolio":
      return {
        listingMode: "portfolio",
        b2cEnabled: false,
        b2bEnabled: false,
        portfolioOnly: true,
        canOrder: false,
      };
    case "b2c":
    default:
      return {
        listingMode: "b2c",
        b2cEnabled: true,
        b2bEnabled: false,
        portfolioOnly: false,
        canOrder: true,
      };
  }
}

/** Prisma write payload: listingMode + legacy boolean mirrors */
export function featuresPayloadForMode(listingMode) {
  const ch = channelsFromListingMode(listingMode);
  return {
    listingMode: ch.listingMode,
    b2cEnabled: ch.b2cEnabled,
    b2bEnabled: ch.b2bEnabled,
  };
}

/** Resolve mode from a ShopFeatures row (prefer listingMode; fall back to booleans) */
export function resolveListingMode(features) {
  if (!features) return "b2c";
  if (features.listingMode) {
    return normalizeListingMode(features.listingMode) || "b2c";
  }
  const b2c = features.b2cEnabled !== false;
  const b2b = Boolean(features.b2bEnabled);
  if (b2c && b2b) return "both";
  if (b2b) return "b2b";
  if (b2c) return "b2c";
  return "portfolio";
}

export function publicShopChannels(features) {
  return channelsFromListingMode(resolveListingMode(features));
}
