/**
 * Hostinger disk photo storage.
 * Files live under UPLOAD_DIR (default: <repo>/uploads).
 * Public URLs: {PUBLIC_BASE_URL}/uploads/{kind}/{filename}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const UPLOAD_KINDS = Object.freeze([
  "products",
  "shops",
  "payment-qr",
  "docs",
]);

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function uploadsRoot() {
  const fromEnv = String(process.env.UPLOAD_DIR || "").trim();
  if (fromEnv) return path.resolve(fromEnv);
  /** Vercel filesystem is read-only except /tmp — prefer Supabase Storage in prod. */
  if (process.env.VERCEL) return path.join("/tmp", "qr-shop-uploads");
  return path.join(root, "uploads");
}

export function ensureUploadDirs() {
  const base = uploadsRoot();
  try {
    fs.mkdirSync(base, { recursive: true });
    for (const kind of UPLOAD_KINDS) {
      fs.mkdirSync(path.join(base, kind), { recursive: true });
    }
  } catch (err) {
    console.warn("[uploads] ensureUploadDirs:", err?.message || err);
  }
  return base;
}

export function publicBaseUrl(req) {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (req) {
    const host = req.get("host");
    if (host) {
      const proto = String(req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
      return `${proto}://${host}`;
    }
  }
  const port = Number(process.env.PORT) || 4100;
  return `http://localhost:${port}`;
}

export function isAllowedImage(file) {
  if (!file) return false;
  if (IMAGE_MIME.has(String(file.mimetype || "").toLowerCase())) return true;
  const ext = path.extname(file.originalname || "").toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext);
}

export function safeExt(originalName, mimetype) {
  const fromName = path.extname(originalName || "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(fromName)) {
    return fromName === ".jpeg" ? ".jpg" : fromName;
  }
  const map = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  return map[String(mimetype || "").toLowerCase()] || ".jpg";
}

export function makeFilename(originalName, mimetype) {
  const id = crypto.randomBytes(12).toString("hex");
  const stamp = Date.now().toString(36);
  return `${stamp}-${id}${safeExt(originalName, mimetype)}`;
}

export function publicUrlFor(relPath, req) {
  const clean = String(relPath || "").replace(/^\/+/, "");
  return `${publicBaseUrl(req)}/uploads/${clean}`;
}
