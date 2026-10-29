/**
 * POST /api/uploads
 * Multipart field `file` → Supabase Storage (preferred) or local disk fallback.
 * Returns public https `url` for Product.imageUrl etc.
 */
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import {
  UPLOAD_KINDS,
  ensureUploadDirs,
  isAllowedImage,
  makeFilename,
  publicUrlFor,
  uploadsRoot,
} from "../lib/uploads.js";
import {
  ensurePublicBucket,
  supabaseStorageConfigured,
  uploadImageBuffer,
} from "../lib/supabase-storage.js";

const router = Router();

ensureUploadDirs();

function resolveKind(req, _res, next) {
  const kind = String(req.query.kind || "products").trim();
  req.uploadKind = UPLOAD_KINDS.includes(kind) ? kind : "products";
  next();
}

const memory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_BYTES) || 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    if (!isAllowedImage(file)) {
      return cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
    }
    return cb(null, true);
  },
});

const disk = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      cb(null, path.join(uploadsRoot(), req.uploadKind || "products"));
    },
    filename(_req, file, cb) {
      cb(null, makeFilename(file.originalname, file.mimetype));
    },
  }),
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_BYTES) || 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    if (!isAllowedImage(file)) {
      return cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
    }
    return cb(null, true);
  },
});

router.post(
  "/",
  requireAuth,
  requireRole("merchant", "staff", "admin", "super_admin"),
  resolveKind,
  (req, res) => {
    const useSupabase = supabaseStorageConfigured();
    const run = useSupabase ? memory.single("file") : disk.single("file");

    run(req, res, async (err) => {
      if (err) {
        const maxMb = Math.round(
          (Number(process.env.UPLOAD_MAX_BYTES) || 10 * 1024 * 1024) / (1024 * 1024),
        );
        const msg =
          err.code === "LIMIT_FILE_SIZE"
            ? `Image too large (max ${maxMb} MB)`
            : err.message || "Upload failed";
        return fail(res, 400, msg, "upload_error");
      }
      if (!req.file) {
        return fail(res, 400, "Missing file field (multipart name: file)", "no_file");
      }

      const kind = req.uploadKind || "products";
      const filename = makeFilename(req.file.originalname, req.file.mimetype);
      const shopId = req.user?.shopId || null;

      if (useSupabase) {
        try {
          await ensurePublicBucket();
          const uploaded = await uploadImageBuffer({
            buffer: req.file.buffer,
            filename,
            contentType: req.file.mimetype,
            kind,
            shopId,
          });
          return ok(res, {
            url: uploaded.url,
            path: uploaded.path,
            bucket: uploaded.bucket,
            storage: "supabase",
            kind,
            filename,
            size: req.file.size,
            mime: req.file.mimetype,
          });
        } catch (e) {
          console.error("supabase upload", e);
          return fail(
            res,
            500,
            e?.message || "Could not upload to Supabase Storage",
            "supabase_upload_error",
          );
        }
      }

      // Disk fallback (local / Hostinger)
      const destDir = path.join(uploadsRoot(), kind);
      const dest = path.join(destDir, filename);
      try {
        if (req.file.path && req.file.path !== dest) {
          fs.renameSync(req.file.path, dest);
        }
      } catch {
        /* multer already wrote with makeFilename via disk storage */
      }
      const savedName = req.file.filename || filename;
      const relativePath = `${kind}/${savedName}`;
      const url = publicUrlFor(relativePath, req);
      return ok(res, {
        url,
        path: `/uploads/${relativePath}`,
        storage: "disk",
        kind,
        filename: savedName,
        size: req.file.size,
        mime: req.file.mimetype,
      });
    });
  },
);

export default router;
