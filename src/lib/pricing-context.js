import { prisma } from "./prisma.js";
import { normalizePhone } from "./phone.js";
import {
  channelsFromListingMode,
  resolveListingMode,
} from "./shop-channels.js";

/**
 * Resolve which price channels a phone may see for a shop.
 *
 * Shop listingMode: b2c | b2b | both | portfolio
 * After QR (phone present): B2B prices require GuestPhoneAccess.b2bAllowed
 * Public mall (no phone): show prices for channels the shop offers
 */
export async function resolvePricingContext(shopId, phone) {
  const normalized = phone ? normalizePhone(phone) : null;
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { features: true },
  });
  if (!shop) return null;

  const base = channelsFromListingMode(resolveListingMode(shop.features));

  let b2bAllowed = false;
  if (normalized) {
    const access = await prisma.guestPhoneAccess.findUnique({
      where: { shopId_phone: { shopId, phone: normalized } },
    });
    b2bAllowed = Boolean(access?.b2bAllowed);
  }

  const viewerB2c = base.b2cEnabled;
  // With phone (QR guest): B2B only if shop offers it AND phone is open for B2B
  // Without phone (mall browse helpers): use shop offer flags
  const viewerB2b = normalized
    ? base.b2bEnabled && b2bAllowed
    : base.b2bEnabled;

  return {
    shopId: shop.id,
    shopName: shop.name,
    shopStatus: shop.status,
    phone: normalized,
    listingMode: base.listingMode,
    portfolioOnly: base.portfolioOnly,
    canOrder: base.canOrder,
    b2cEnabled: viewerB2c,
    b2bEnabled: viewerB2b,
    showBoth: viewerB2c && viewerB2b,
    b2bAllowed,
    shopOffersB2c: base.b2cEnabled,
    shopOffersB2b: base.b2bEnabled,
  };
}

/** Public mall row: prices by shop listing mode (no phone gate) */
export function mallPricesForProduct(product, features) {
  const ch = channelsFromListingMode(resolveListingMode(features));
  const out = {
    productId: product.id,
    shopId: product.shopId,
    name: product.name,
    listingMode: ch.listingMode,
    portfolioOnly: ch.portfolioOnly,
    canOrder: ch.canOrder,
  };
  if (ch.b2cEnabled || ch.portfolioOnly) {
    out.priceB2cKs = product.priceKs;
  }
  if (ch.b2bEnabled && product.priceB2bKs != null) {
    out.priceB2bKs = product.priceB2bKs;
  }
  if (ch.portfolioOnly) {
    out.displayOnly = true;
  }
  return out;
}

/** Map product → prices the viewer is allowed to see */
export function pricesForContext(product, ctx) {
  const out = {
    name: product.name,
    productId: product.id,
    listingMode: ctx.listingMode,
    portfolioOnly: ctx.portfolioOnly,
    canOrder: ctx.canOrder,
  };
  if (ctx.b2cEnabled) out.priceB2cKs = product.priceKs;
  if (ctx.b2bEnabled && product.priceB2bKs != null) {
    out.priceB2bKs = product.priceB2bKs;
  }
  if (ctx.portfolioOnly) out.displayOnly = true;
  return out;
}
