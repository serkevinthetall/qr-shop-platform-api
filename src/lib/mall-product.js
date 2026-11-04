/**
 * Map Prisma Product → Marketplace mall catalog row
 * (matches shared-mall-catalog / GET /api/catalog shape).
 */
import { mallPricesForProduct } from "./pricing-context.js";
import { publicShopChannels } from "./shop-channels.js";

export function toMallProduct(p) {
  const priced = mallPricesForProduct(p, p.shop?.features);
  const channels = publicShopChannels(p.shop?.features);
  const priceKs = priced.priceB2cKs ?? priced.priceB2bKs ?? p.priceKs;
  const listingMode = priced.listingMode || channels.listingMode;
  const showBoth =
    priced.priceB2cKs != null &&
    priced.priceB2bKs != null &&
    Number(priced.priceB2cKs) > 0 &&
    Number(priced.priceB2bKs) > 0;
  return {
    id: `${p.shopId}__${p.id}`,
    productId: p.id,
    shopId: p.shopId,
    shopName: p.shop?.name ?? "",
    shopSlug: p.shop?.slug ?? undefined,
    name: p.name,
    priceB2cKs: priced.priceB2cKs ?? null,
    priceB2bKs: priced.priceB2bKs ?? null,
    priceKs,
    price: `${Number(priceKs).toLocaleString()} Ks`,
    compareAtKs: p.compareAtKs ?? undefined,
    compareAt:
      p.compareAtKs != null
        ? `${Number(p.compareAtKs).toLocaleString()} Ks`
        : undefined,
    brand: p.shop?.name ?? "",
    categoryId: p.categoryId ?? "essentials",
    badge: p.badge ?? undefined,
    imageUrl: p.imageUrl ?? "",
    stock: p.stock,
    active: p.active,
    listingMode,
    portfolioOnly: channels.portfolioOnly,
    canOrder: channels.canOrder,
    channels: {
      b2cEnabled: channels.b2cEnabled || showBoth,
      b2bEnabled: channels.b2bEnabled || showBoth,
      showBoth: (channels.b2cEnabled && channels.b2bEnabled) || showBoth,
    },
    displayOnly: Boolean(priced.displayOnly),
    updatedAt: p.updatedAt?.toISOString?.() ?? p.updatedAt,
  };
}

/** Parse composite mall id `shopId__productId` or plain product id */
export function parseMallProductId(raw) {
  const id = String(raw || "").trim();
  if (!id) return { shopId: null, productId: null };
  const idx = id.indexOf("__");
  if (idx > 0) {
    return { shopId: id.slice(0, idx), productId: id.slice(idx + 2) };
  }
  return { shopId: null, productId: id };
}

export function unitPriceForChannel(product, channel) {
  if (channel === "b2b") {
    if (product.priceB2bKs == null) return null;
    return product.priceB2bKs;
  }
  return product.priceKs;
}
