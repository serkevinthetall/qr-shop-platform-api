/**
 * Supabase Storage for product / shop / payment photos.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Bucket should be public so Marketplace can load image URLs.
 */
import { createClient } from "@supabase/supabase-js";

let client = null;

export function supabaseStorageConfigured() {
  return Boolean(
    String(process.env.SUPABASE_URL || "").trim() &&
      String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  );
}

export function storageBucketName() {
  return (
    String(process.env.SUPABASE_STORAGE_BUCKET || "").trim() ||
    "Bsmar't product photo"
  );
}

export function getSupabaseAdmin() {
  if (!supabaseStorageConfigured()) return null;
  if (client) return client;
  client = createClient(
    String(process.env.SUPABASE_URL).trim().replace(/\/$/, ""),
    String(process.env.SUPABASE_SERVICE_ROLE_KEY).trim(),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return client;
}

/**
 * Ensure bucket exists and is public (mall needs anonymous image reads).
 */
export async function ensurePublicBucket() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };
  const bucket = storageBucketName();
  const { data: existing, error: getErr } = await supabase.storage.getBucket(bucket);
  if (getErr && !String(getErr.message || "").toLowerCase().includes("not found")) {
    console.warn("[storage] getBucket", getErr.message);
  }
  if (!existing) {
    const { error: createErr } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: Number(process.env.UPLOAD_MAX_BYTES) || 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    });
    if (createErr) {
      console.warn("[storage] createBucket", createErr.message);
      return { ok: false, reason: createErr.message };
    }
    return { ok: true, created: true };
  }
  if (!existing.public) {
    const { error: updErr } = await supabase.storage.updateBucket(bucket, {
      public: true,
    });
    if (updErr) {
      console.warn("[storage] updateBucket public", updErr.message);
      return { ok: false, reason: updErr.message };
    }
  }
  return { ok: true };
}

/**
 * Upload image buffer → public HTTPS URL.
 * @returns {{ url: string, path: string, bucket: string }}
 */
export async function uploadImageBuffer({
  buffer,
  filename,
  contentType,
  kind = "products",
  shopId,
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase storage is not configured");
  }
  const bucket = storageBucketName();
  const folder = shopId ? `${kind}/${shopId}` : kind;
  const objectPath = `${folder}/${filename}`.replace(/\/+/g, "/");

  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType: contentType || "image/jpeg",
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) {
    throw new Error(error.message || "Supabase upload failed");
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error("Could not build public URL for uploaded file");
  }
  return { url: data.publicUrl, path: objectPath, bucket };
}
