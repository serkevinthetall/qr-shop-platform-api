/**
 * QR App catalog row — retail (B2C) only.
 * Never expose wholesale / B2B fields to the native buyer app.
 */
import { mallPricesForProduct } from "./pricing-context.js";
import { publicShopChannels } from "./shop-channels.js";

/** Retail unit in kyats, or null when SKU has no B2C price. */
export function appRetailKs(p, features) {
  const priced = mallPricesForProduct(p, features ?? p.shop?.features);
  if (priced.priceB2cKs != null && Number(priced.priceB2cKs) > 0) {
    return Math.floor(Number(priced.priceB2cKs));
  }
  /** B2B-only listingMode must not fall through priceKs into the app. */
  if (priced.listingMode === "b2b" || priced.portfolioOnly) return null;
  if (p.priceKs != null && Number(p.priceKs) > 0) {
    return Math.floor(Number(p.priceKs));
  }
  return null;
}

/**
 * Map Prisma Product → QR App catalog row (retail-only).
 * Returns null when the SKU has no retail price (hidden from app).
 */
export function toAppCatalogProduct(p) {
  const channels = publicShopChannels(p.shop?.features);
  if (channels.portfolioOnly) return null;

  const retail = appRetailKs(p);
  if (retail == null || retail <= 0) return null;

  const stock = Math.max(0, Math.floor(Number(p.stock) || 0));
  const compareAtKs =
    p.compareAtKs != null && Number(p.compareAtKs) > retail
      ? Math.floor(Number(p.compareAtKs))
      : undefined;

  return {
    id: `${p.shopId}__${p.id}`,
    productId: p.id,
    shopId: p.shopId,
    shopName: p.shop?.name ?? "",
    shopSlug: p.shop?.slug ?? undefined,
    name: p.name,
    /** Primary price for QR App (`list_price` maps from this). */
    priceKs: retail,
    priceB2cKs: retail,
    price: `${retail.toLocaleString()} Ks`,
    /** Explicitly stripped — app must never show wholesale. */
    priceB2bKs: null,
    wholesaleMinQty: null,
    compareAtKs,
    compareAt:
      compareAtKs != null ? `${compareAtKs.toLocaleString()} Ks` : undefined,
    brand: p.shop?.name ?? "",
    categoryId: p.categoryId ?? "essentials",
    badge: p.badge ?? undefined,
    imageUrl: p.imageUrl ?? "",
    stock,
    active: p.active,
    listingMode: "b2c",
    portfolioOnly: false,
    canOrder: channels.canOrder && stock > 0,
    channels: {
      b2cEnabled: true,
      b2bEnabled: false,
      showBoth: false,
    },
    updatedAt: p.updatedAt?.toISOString?.() ?? p.updatedAt,
  };
}
