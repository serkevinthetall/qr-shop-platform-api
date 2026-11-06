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
    wholesaleMinQty:
      priced.priceB2bKs != null &&
      p.wholesaleMinQty != null &&
      Number(p.wholesaleMinQty) > 0
        ? Math.floor(Number(p.wholesaleMinQty))
        : null,
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
    stock: Math.max(0, Math.floor(Number(p.stock) || 0)),
    templateId: p.templateId ? String(p.templateId) : undefined,
    attributes:
      typeof p.attributesJson === "string"
        ? (() => {
            try {
              const o = JSON.parse(p.attributesJson || "{}");
              return o && typeof o === "object" && !Array.isArray(o) ? o : {};
            } catch {
              return {};
            }
          })()
        : p.attributes && typeof p.attributes === "object"
          ? p.attributes
          : {},
    active: p.active,
    listingMode,
    portfolioOnly: channels.portfolioOnly,
    canOrder:
      channels.canOrder &&
      !channels.portfolioOnly &&
      Math.max(0, Math.floor(Number(p.stock) || 0)) > 0,
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

/**
 * Plan A: qty ≥ wholesaleMinQty unlocks wholesale for anyone.
 * Below min (or no min) → retail, unless legacy channel=b2b with no min qty.
 */
export function resolveUnitPrice(product, qty, requestedChannel = "b2c") {
  const q = Math.max(1, Math.floor(Number(qty) || 1));
  const retail =
    product.priceKs != null && Number(product.priceKs) > 0
      ? Math.floor(Number(product.priceKs))
      : null;
  const wholesale =
    product.priceB2bKs != null && Number(product.priceB2bKs) > 0
      ? Math.floor(Number(product.priceB2bKs))
      : null;
  const minQty =
    product.wholesaleMinQty != null && Number(product.wholesaleMinQty) > 0
      ? Math.floor(Number(product.wholesaleMinQty))
      : null;

  if (wholesale != null && minQty != null && q >= minQty) {
    return { unitKs: wholesale, channel: "b2b", byQty: true };
  }

  if (requestedChannel === "b2b" && wholesale != null && minQty == null) {
    return { unitKs: wholesale, channel: "b2b", byQty: false };
  }

  if (requestedChannel === "b2b" && wholesale != null && minQty != null && q < minQty) {
    if (retail == null) return { unitKs: null, channel: "b2c", byQty: false };
    return { unitKs: retail, channel: "b2c", byQty: false };
  }

  if (requestedChannel === "b2b" && wholesale != null) {
    return { unitKs: wholesale, channel: "b2b", byQty: false };
  }

  if (retail == null && wholesale != null) {
    return { unitKs: wholesale, channel: "b2b", byQty: false };
  }

  return {
    unitKs: retail,
    channel: "b2c",
    byQty: false,
  };
}
