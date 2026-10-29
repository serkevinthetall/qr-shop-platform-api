/**
 * Map Prisma Announcement ↔ Admin / Marketplace PlatformAnnouncement shape.
 */

export const MERCHANT_SCOPES = new Set(["all", "selected", "none"]);

export function parseMerchantIds(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map((x) => String(x).trim()).filter(Boolean))];
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function normalizeMerchantScope(scope, merchantIds) {
  const s = String(scope || "all").toLowerCase();
  if (!MERCHANT_SCOPES.has(s)) return "all";
  if (s === "selected" && merchantIds.length === 0) return "none";
  return s;
}

/** Public DTO used by Admin UI + Marketplace + Merchant */
export function publicAnnouncement(row) {
  const merchantIds = parseMerchantIds(row.merchantIdsJson);
  const merchantScope = normalizeMerchantScope(row.merchantScope, merchantIds);
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    sendToCustomers: Boolean(row.sendToCustomers),
    merchantScope,
    merchantIds: merchantScope === "selected" ? merchantIds : [],
    published: Boolean(row.published),
    authorName: row.authorName || "QR Shop Admin",
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

export function toDbFields(input, { forCreate = false } = {}) {
  const merchantIds = parseMerchantIds(input.merchantIds);
  const merchantScope = normalizeMerchantScope(input.merchantScope, merchantIds);
  const ids =
    merchantScope === "selected"
      ? merchantIds
      : [];
  const data = {
    title: String(input.title || "").trim(),
    body: String(input.body || "").trim(),
    sendToCustomers: input.sendToCustomers !== false,
    merchantScope,
    merchantIdsJson: JSON.stringify(ids),
    published: Boolean(input.published),
    authorName: input.authorName
      ? String(input.authorName).trim()
      : forCreate
        ? "QR Shop Admin"
        : undefined,
  };
  if (!forCreate && data.authorName === undefined) delete data.authorName;
  return data;
}

export function isVisibleToMerchant(row, shopId) {
  if (!row.published) return false;
  const scope = normalizeMerchantScope(
    row.merchantScope,
    parseMerchantIds(row.merchantIdsJson),
  );
  if (scope === "none") return false;
  if (scope === "all") return true;
  const id = String(shopId || "").trim();
  if (!id) return false;
  return parseMerchantIds(row.merchantIdsJson).includes(id);
}
