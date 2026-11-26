/**
 * Optional per-SKU food information sheet (ingredients, allergen, nutrition, storage).
 * Stored as Product.foodInfoJson — omitted from buyer payloads when disabled.
 */

function trimStr(v) {
  return String(v ?? "").trim();
}

/**
 * @param {unknown} raw
 * @returns {{
 *   enabled: boolean,
 *   ingredientsEn: string,
 *   ingredientsMy: string,
 *   allergen: string,
 *   nutritionServing: string,
 *   nutritionEnergy: string,
 *   nutritionFat: string,
 *   nutritionSodium: string,
 *   storage: string,
 * }}
 */
export function parseFoodInfo(raw) {
  let o = raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      o = JSON.parse(raw);
    } catch {
      o = null;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) {
    return {
      enabled: false,
      ingredientsEn: "",
      ingredientsMy: "",
      allergen: "",
      nutritionServing: "",
      nutritionEnergy: "",
      nutritionFat: "",
      nutritionSodium: "",
      storage: "",
    };
  }
  return {
    enabled: o.enabled === true,
    ingredientsEn: trimStr(o.ingredientsEn),
    ingredientsMy: trimStr(o.ingredientsMy),
    allergen: trimStr(o.allergen),
    nutritionServing: trimStr(o.nutritionServing),
    nutritionEnergy: trimStr(o.nutritionEnergy),
    nutritionFat: trimStr(o.nutritionFat),
    nutritionSodium: trimStr(o.nutritionSodium),
    storage: trimStr(o.storage),
  };
}

/** Merchant API / editor: always return the object (enabled may be false). */
export function foodInfoForMerchant(p) {
  return parseFoodInfo(p?.foodInfoJson ?? p?.foodInfo);
}

/**
 * Buyer surfaces: only when enabled and at least one field has text.
 * @returns {object|undefined}
 */
export function foodInfoForBuyer(p) {
  const info = parseFoodInfo(p?.foodInfoJson ?? p?.foodInfo);
  if (!info.enabled) return undefined;
  const hasContent =
    info.ingredientsEn ||
    info.ingredientsMy ||
    info.allergen ||
    info.nutritionServing ||
    info.nutritionEnergy ||
    info.nutritionFat ||
    info.nutritionSodium ||
    info.storage;
  if (!hasContent) return undefined;
  return info;
}

/** Normalize body.foodInfo → foodInfoJson string for Prisma write. */
export function foodInfoWriteJson(bodyFoodInfo) {
  if (bodyFoodInfo === undefined) return undefined;
  if (bodyFoodInfo == null) {
    return JSON.stringify({ enabled: false });
  }
  const info = parseFoodInfo(bodyFoodInfo);
  if (!info.enabled) {
    return JSON.stringify({ enabled: false });
  }
  return JSON.stringify(info);
}
