/**
 * Normalize shop / product media URLs for clients.
 * Local uploads often got stored as http://localhost:4100/uploads/… which
 * break on production Merchant / Marketplace.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicBaseUrl } from "./uploads.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Same bytes as local Nova logo uploads (compressed seed). */
const SEED_LOGO_FILES = new Set([
  "mvue6en1-14ae34daf5fabcef06b1d54d.png",
  "mvue6xc3-8203ee6cc2c9ac7a549be271.png",
  "mvuede06-b4f352c11d391d39743e8984.png",
  "mvuehe9f-2100b957931f8ed4bb500076.png",
  "mvuejf2i-380d4dbc3047ac30ddf5c499.png",
  "mvuepwha-cb589b6e534c85ff091e74df.png",
  "mvueq4ph-6087fd8d6947d37524f53f11.png",
  "mvuesicd-a9b5c5fafc075b4da090d58d.png",
]);

/** Same bytes as local Nova cover uploads (compressed seed). */
const SEED_COVER_FILES = new Set([
  "mvue6my2-43cd3f49dd5d447b4dc3dc88.png",
  "mvue71tr-26d176398e9106f5c2f8ffea.png",
  "mvuehha0-62ed112f8401ecad88d65c67.png",
  "mvuejh25-be8e305c159424c689105c85.png",
  "mvueq8t1-75fe7e0e67777451463656e4.png",
  "mvuesmha-27c44ca62816f8ebb5e52ecd.png",
]);

export function seedUploadsDir() {
  return path.join(root, "public", "seed");
}

function seedPathForFilename(name) {
  if (SEED_LOGO_FILES.has(name)) return "/seed/shops/nova-logo.jpg";
  if (SEED_COVER_FILES.has(name)) return "/seed/shops/nova-cover.jpg";
  return null;
}

/**
 * Rewrite localhost / relative upload URLs to a public absolute URL.
 * Maps known local Nova shop files onto durable /seed/ assets for Vercel.
 */
export function normalizeMediaUrl(uri, req) {
  const raw = String(uri || "").trim();
  if (!raw) return raw;
  if (
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("file:")
  ) {
    return raw;
  }

  const base = publicBaseUrl(req);

  let pathname = "";
  let search = "";
  try {
    if (raw.startsWith("/")) {
      pathname = raw.split("?")[0];
      search = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
    } else {
      const u = new URL(raw);
      pathname = u.pathname;
      search = u.search || "";
    }
  } catch {
    return raw;
  }

  const file = pathname.split("/").pop() || "";
  const seeded = seedPathForFilename(file);
  if (seeded) return `${base}${seeded}`;

  if (pathname.startsWith("/uploads/") || pathname.startsWith("/seed/")) {
    return `${base}${pathname}${search}`;
  }

  /** Absolute non-upload URL (Supabase, Unsplash, etc.) — leave alone. */
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (/localhost|127\.0\.0\.1/i.test(u.hostname)) {
        return `${base}${u.pathname}${u.search}`;
      }
    } catch {
      /* ignore */
    }
    return raw;
  }

  return raw;
}

export function withNormalizedShopMedia(shop, req) {
  if (!shop || typeof shop !== "object") return shop;
  return {
    ...shop,
    logoUrl: normalizeMediaUrl(shop.logoUrl, req) || shop.logoUrl || null,
    coverUrl: normalizeMediaUrl(shop.coverUrl, req) || shop.coverUrl || null,
  };
}
