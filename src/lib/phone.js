/** Normalize Myanmar-style phone: strip spaces/dashes. */
export function normalizePhone(raw) {
  return String(raw || "").replace(/[\s\-()]/g, "").trim();
}

export function normalizeLogin(raw) {
  const s = String(raw || "").trim();
  if (s.includes("@")) return { email: s.toLowerCase(), phone: null };
  return { email: null, phone: normalizePhone(s) };
}
