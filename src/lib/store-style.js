/** Default Store style — matches Merchant Store style screen. */
export function defaultStoreStyle() {
  const base = {
    showCover: true,
    showTagline: true,
    logoSize: "md",
    cardStyle: "mall",
    allowGrid: true,
    allowList: true,
    defaultBuyerView: "grid",
    autoGrid: true,
  };
  return {
    phone: { ...base, listLayout: "grid-2" },
    website: { ...base, listLayout: "grid-3" },
  };
}

function normalizePreset(raw, fallback) {
  const s = raw && typeof raw === "object" ? raw : {};
  const listLayout = ["grid-2", "grid-3", "grid-4", "list"].includes(s.listLayout)
    ? s.listLayout
    : fallback.listLayout;
  const allowGrid = s.allowGrid ?? listLayout !== "list";
  const allowList = s.allowList ?? listLayout === "list";
  let defaultBuyerView =
    s.defaultBuyerView === "list" || s.defaultBuyerView === "grid"
      ? s.defaultBuyerView
      : fallback.defaultBuyerView;
  if (!allowGrid && allowList) defaultBuyerView = "list";
  if (allowGrid && !allowList) defaultBuyerView = "grid";
  return {
    listLayout,
    showCover: s.showCover !== false,
    showTagline: Boolean(s.showTagline),
    logoSize: ["sm", "md", "lg"].includes(s.logoSize) ? s.logoSize : fallback.logoSize,
    cardStyle: s.cardStyle === "compact" ? "compact" : "mall",
    allowGrid: allowGrid !== false,
    allowList: Boolean(allowList),
    defaultBuyerView,
    autoGrid: s.autoGrid !== false,
  };
}

export function parseStoreStyle(raw) {
  const defaults = defaultStoreStyle();
  let obj = {};
  if (raw && typeof raw === "object") obj = raw;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = {};
    }
  }
  return {
    phone: normalizePreset(obj.phone, defaults.phone),
    website: normalizePreset(obj.website, defaults.website),
  };
}

export function storeStyleToJson(style) {
  return JSON.stringify(parseStoreStyle(style));
}
