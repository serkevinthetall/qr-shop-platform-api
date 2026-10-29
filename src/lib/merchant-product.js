export function parseAttributes(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === "object" && !Array.isArray(o)) return o;
    } catch {
      /* ignore */
    }
  }
  return {};
}

/** Resolve sell-channel flags (legacy showOnWebsite → all three). */
export function sellChannelsOf(p) {
  const hasExplicit =
    p.sellOnMarketplace != null ||
    p.sellOnApp != null ||
    p.sellOnOwnPage != null;
  if (!hasExplicit) {
    const on = p.showOnWebsite !== false;
    return {
      sellOnMarketplace: on,
      sellOnApp: on,
      sellOnOwnPage: on,
    };
  }
  return {
    sellOnMarketplace: p.sellOnMarketplace !== false,
    sellOnApp: p.sellOnApp !== false,
    sellOnOwnPage: p.sellOnOwnPage !== false,
  };
}

export function isPubliclySold(p) {
  const c = sellChannelsOf(p);
  return c.sellOnMarketplace || c.sellOnApp || c.sellOnOwnPage;
}

/**
 * Prisma where fragment for a buyer surface.
 * @param {"marketplace"|"app"|"own"} channel
 */
export function sellChannelWhere(channel) {
  if (channel === "app") return { sellOnApp: true, active: true };
  if (channel === "own") return { sellOnOwnPage: true, active: true };
  return { sellOnMarketplace: true, active: true };
}

export function publicMerchantProduct(p) {
  const channels = sellChannelsOf(p);
  const showOnWebsite = isPubliclySold(p);
  return {
    id: p.id,
    shopId: p.shopId,
    name: p.name,
    priceKs: p.priceKs,
    priceB2bKs: p.priceB2bKs ?? null,
    compareAtKs: p.compareAtKs ?? null,
    costKs: p.costKs ?? null,
    stock: p.stock,
    categoryId: p.categoryId ?? "essentials",
    badge: p.badge ?? undefined,
    imageUrl: p.imageUrl ?? "",
    barcode: p.barcode ?? undefined,
    uom: p.uom || "piece",
    purchaseUom: p.purchaseUom || "piece",
    uomFactor: p.uomFactor ?? 1,
    templateId: p.templateId ?? undefined,
    attributes: parseAttributes(p.attributesJson),
    active: p.active !== false,
    showOnWebsite,
    ...channels,
    viewsWebsite: Number(p.viewsWebsite) || 0,
    viewsApp: Number(p.viewsApp) || 0,
    viewsQr: Number(p.viewsQr) || 0,
    viewsTotal:
      (Number(p.viewsWebsite) || 0) +
      (Number(p.viewsApp) || 0) +
      (Number(p.viewsQr) || 0),
    updatedAt: p.updatedAt?.toISOString?.() ?? p.updatedAt,
    createdAt: p.createdAt?.toISOString?.() ?? p.createdAt,
  };
}

export function productWriteData(body, { partial = false } = {}) {
  const data = {};
  const set = (key, val) => {
    if (val !== undefined) data[key] = val;
  };

  if (!partial || body.name != null) set("name", String(body.name || "").trim());
  if (!partial || body.priceKs != null) {
    set("priceKs", Math.max(0, Math.floor(Number(body.priceKs) || 0)));
  }
  if (body.priceB2bKs !== undefined) {
    set(
      "priceB2bKs",
      body.priceB2bKs == null || body.priceB2bKs === ""
        ? null
        : Math.max(0, Math.floor(Number(body.priceB2bKs))),
    );
  }
  if (body.compareAtKs !== undefined) {
    set(
      "compareAtKs",
      body.compareAtKs == null || body.compareAtKs === ""
        ? null
        : Math.max(0, Math.floor(Number(body.compareAtKs))),
    );
  }
  if (body.costKs !== undefined) {
    set(
      "costKs",
      body.costKs == null || body.costKs === ""
        ? null
        : Math.max(0, Math.floor(Number(body.costKs))),
    );
  }
  if (!partial || body.stock != null) {
    set("stock", Math.max(0, Math.floor(Number(body.stock) || 0)));
  }
  if (body.categoryId !== undefined) set("categoryId", body.categoryId || null);
  if (body.badge !== undefined) set("badge", body.badge?.trim?.() || null);
  if (body.imageUrl !== undefined) set("imageUrl", body.imageUrl?.trim?.() || null);
  if (body.barcode !== undefined) set("barcode", body.barcode?.trim?.() || null);
  if (body.uom !== undefined) set("uom", String(body.uom || "piece"));
  if (body.purchaseUom !== undefined) {
    set("purchaseUom", String(body.purchaseUom || "piece"));
  }
  if (body.uomFactor !== undefined) {
    set("uomFactor", Math.max(1, Math.floor(Number(body.uomFactor) || 1)));
  }
  if (body.templateId !== undefined) set("templateId", body.templateId || null);
  if (body.attributes !== undefined) {
    set("attributesJson", JSON.stringify(parseAttributes(body.attributes)));
  }
  if (typeof body.active === "boolean") set("active", body.active);

  const hasChannelWrite =
    typeof body.sellOnMarketplace === "boolean" ||
    typeof body.sellOnApp === "boolean" ||
    typeof body.sellOnOwnPage === "boolean" ||
    typeof body.showOnWebsite === "boolean";

  if (hasChannelWrite) {
    let marketplace;
    let app;
    let own;
    if (
      typeof body.sellOnMarketplace === "boolean" ||
      typeof body.sellOnApp === "boolean" ||
      typeof body.sellOnOwnPage === "boolean"
    ) {
      marketplace =
        typeof body.sellOnMarketplace === "boolean"
          ? body.sellOnMarketplace
          : partial
            ? undefined
            : true;
      app =
        typeof body.sellOnApp === "boolean" ? body.sellOnApp : partial ? undefined : true;
      own =
        typeof body.sellOnOwnPage === "boolean"
          ? body.sellOnOwnPage
          : partial
            ? undefined
            : true;
    } else {
      // Legacy single switch → all three
      marketplace = body.showOnWebsite;
      app = body.showOnWebsite;
      own = body.showOnWebsite;
    }
    if (marketplace !== undefined) set("sellOnMarketplace", marketplace);
    if (app !== undefined) set("sellOnApp", app);
    if (own !== undefined) set("sellOnOwnPage", own);

    if (partial && (marketplace === undefined || app === undefined || own === undefined)) {
      // showOnWebsite synced by caller after load, or approximate from known bits
      const known = [marketplace, app, own].filter((v) => typeof v === "boolean");
      if (known.length === 3) {
        set("showOnWebsite", known.some(Boolean));
      } else if (typeof body.showOnWebsite === "boolean") {
        set("showOnWebsite", body.showOnWebsite);
      }
    } else {
      const m = marketplace !== undefined ? marketplace : true;
      const a = app !== undefined ? app : true;
      const o = own !== undefined ? own : true;
      set("showOnWebsite", Boolean(m || a || o));
    }
  }

  return data;
}
