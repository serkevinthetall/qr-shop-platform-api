/** Day keys Mon→Sun (ISO-ish; Mon first for retail). */
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "18:00";

function dayDefault(closed = false) {
  return { closed: Boolean(closed), open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
}

export function defaultOpeningHours() {
  return {
    enabled: false,
    days: {
      mon: dayDefault(false),
      tue: dayDefault(false),
      wed: dayDefault(false),
      thu: dayDefault(false),
      fri: dayDefault(false),
      sat: dayDefault(false),
      sun: dayDefault(true),
    },
  };
}

function normalizeTime(raw, fallback) {
  const s = String(raw || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":").map((n) => Number(n));
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return fallback;
}

function normalizeDay(raw, fallback) {
  const d = raw && typeof raw === "object" ? raw : {};
  const closed = Boolean(d.closed);
  return {
    closed,
    open: normalizeTime(d.open, fallback.open),
    close: normalizeTime(d.close, fallback.close),
  };
}

export function parseOpeningHours(raw) {
  const defaults = defaultOpeningHours();
  let obj = {};
  if (raw && typeof raw === "object") obj = raw;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = {};
    }
  }
  const daysIn = obj.days && typeof obj.days === "object" ? obj.days : {};
  const days = {};
  for (const key of DAY_KEYS) {
    days[key] = normalizeDay(daysIn[key], defaults.days[key]);
  }
  return {
    enabled: Boolean(obj.enabled),
    days,
  };
}

export function openingHoursToJson(hours) {
  return JSON.stringify(parseOpeningHours(hours));
}
