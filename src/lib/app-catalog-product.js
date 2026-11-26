/**
 * QR App catalog row.
 * Default: retail only.
 * When viewer has shop wholesale access: list_price uses B2B when set.
 */
import { mallPricesForProduct } from "./pricing-context.js";
import { publicShopChannels } from "./shop-channels.js";
import { foodInfoForBuyer } from "./food-info.js";

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

function appWholesaleKs(p, features) {
  const priced = mallPricesForProduct(p, features ?? p.shop?.features);
  if (priced.priceB2bKs != null && Number(priced.priceB2bKs) > 0) {
    return Math.floor(Number(priced.priceB2bKs));
  }
  if (p.priceB2bKs != null && Number(p.priceB2bKs) > 0) {
    return Math.floor(Number(p.priceB2bKs));
  }
  return null;
}

/**
 * @param {object} p Prisma product (+ shop.features)
 * @param {{ wholesaleShopIds?: Set<string> }} [viewer]
 */
export function toAppCatalogProduct(p, viewer = {}) {
  const channels = publicShopChannels(p.shop?.features);
  if (channels.portfolioOnly) return null;

  const retail = appRetailKs(p);
  const wholesale = appWholesaleKs(p);
  const allowWs =
    Boolean(viewer.wholesaleShopIds?.has?.(p.shopId)) && wholesale != null;

  /** Hide SKU when neither price is usable for this viewer. */
  if (!allowWs && (retail == null || retail <= 0)) return null;
  if (allowWs && wholesale == null && (retail == null || retail <= 0)) {
    return null;
  }

  const activeKs = allowWs ? wholesale : retail;
  const stock = Math.max(0, Math.floor(Number(p.stock) || 0));
  const compareAtKs =
    !allowWs &&
    p.compareAtKs != null &&
    Number(p.compareAtKs) > activeKs
      ? Math.floor(Number(p.compareAtKs))
      : undefined;

  const minQty =
    allowWs && p.wholesaleMinQty != null && Number(p.wholesaleMinQty) > 1
      ? Math.floor(Number(p.wholesaleMinQty))
      : null;

  return {
    id: `${p.shopId}__${p.id}`,
    productId: p.id,
    shopId: p.shopId,
    shopName: p.shop?.name ?? "",
    shopSlug: p.shop?.slug ?? undefined,
    name: p.name,
    /** Active unit price for QR App (`list_price` maps from this). */
    priceKs: activeKs,
    priceB2cKs: retail,
    price: `${activeKs.toLocaleString()} Ks`,
    priceB2bKs: allowWs ? wholesale : null,
    wholesaleMinQty: minQty,
    pricingChannel: allowWs ? "b2b" : "b2c",
    compareAtKs,
    compareAt:
      compareAtKs != null ? `${compareAtKs.toLocaleString()} Ks` : undefined,
    brand: p.shop?.name ?? "",
    categoryId: p.categoryId ?? "essentials",
    badge: p.badge ?? undefined,
    imageUrl: p.imageUrl ?? "",
    stock,
    ...(() => {
      const foodInfo = foodInfoForBuyer(p);
      return foodInfo ? { foodInfo } : {};
    })(),
    active: p.active,
    listingMode: allowWs ? "b2b" : "b2c",
    portfolioOnly: false,
    canOrder: channels.canOrder && stock > 0,
    channels: {
      b2cEnabled: retail != null,
      b2bEnabled: allowWs,
      showBoth: false,
    },
    updatedAt: p.updatedAt?.toISOString?.() ?? p.updatedAt,
  };
}
