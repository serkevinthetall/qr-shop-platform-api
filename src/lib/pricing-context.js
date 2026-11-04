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

  const shopOffersB2c = base.b2cEnabled;
  const shopOffersB2b = base.b2bEnabled;

  let viewerB2c = shopOffersB2c;
  let viewerB2b = shopOffersB2b;
  /** Which price list a QR guest pays — phone whitelist decides (not a picker). */
  let activeChannel = "b2c";

  if (normalized) {
    // Wholesale-only shop → every phone pays B2B
    if (shopOffersB2b && !shopOffersB2c) {
      viewerB2c = false;
      viewerB2b = true;
      activeChannel = "b2b";
    } else if (shopOffersB2b && b2bAllowed) {
      // Phone on merchant B2B list → wholesale (retail still returned as fallback for SKUs without WS price)
      viewerB2c = shopOffersB2c;
      viewerB2b = true;
      activeChannel = "b2b";
    } else {
      // Default / retail phone → retail only
      viewerB2c = shopOffersB2c;
      viewerB2b = false;
      activeChannel = shopOffersB2c ? "b2c" : shopOffersB2b ? "b2b" : "b2c";
    }
  }

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
    showBoth: false,
    activeChannel,
    b2bAllowed,
    shopOffersB2c,
    shopOffersB2b,
  };
}

/**
 * Public mall row (Marketplace / App).
 * Show Retail + Wholesale whenever the SKU has both — listingMode no longer
 * hides a filled wholesale price on b2c shops (mall cards label both).
 * B2B-only shops still omit retail.
 */
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

  const retail =
    product.priceKs != null && Number(product.priceKs) > 0
      ? Math.floor(Number(product.priceKs))
      : null;
  const wholesale =
    product.priceB2bKs != null && Number(product.priceB2bKs) > 0
      ? Math.floor(Number(product.priceB2bKs))
      : null;

  if (ch.listingMode === "b2b") {
    if (wholesale != null) out.priceB2bKs = wholesale;
  } else {
    if (retail != null) out.priceB2cKs = retail;
    if (wholesale != null) out.priceB2bKs = wholesale;
  }

  if (out.priceB2cKs != null && out.priceB2bKs != null && ch.listingMode !== "portfolio") {
    out.listingMode = "both";
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
