/** Label helpers matching Marketplace shared-townships.ts */

export function townshipLabel(t) {
  if (!t) return "";
  return t.nameEn || t.name || "";
}

export function townshipStateLabel(state) {
  return String(state || "").replace(/\s*\(MM\)\s*$/i, "").trim();
}

/** Full line: street, Township, State postal — same as Marketplace formatLocation */
export function formatLocation(street, township) {
  const s = String(street || "").trim();
  if (!township) return s;
  const postal = township.postalCode ? ` ${township.postalCode}` : "";
  return `${s}, ${townshipLabel(township)}, ${townshipStateLabel(township.state)}${postal}`;
}

export function publicTownship(t) {
  return {
    id: t.id,
    name: t.name,
    nameEn: t.nameEn ?? undefined,
    nameMm: t.nameMm ?? undefined,
    state: t.state,
    postalCode: t.postalCode,
    country: t.country,
    active: t.active,
    sortOrder: t.sortOrder,
    sequence: t.sequence ?? undefined,
  };
}
