/**
 * POST /api/uploads
 * Multipart field `file` → Hostinger disk (UPLOAD_DIR).
 * Returns public https `url` for Product.imageUrl etc.
 */
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { ok, fail } from "../lib/response.js";
import {
  requireAuth,
  requireRole,
  requireUserOrGuest,
} from "../middlewares/auth.middleware.js";
import {
  UPLOAD_KINDS,
  ensureUploadDirs,
  isAllowedImage,
  makeFilename,
  publicUrlFor,
  uploadsRoot,
} from "../lib/uploads.js";

const router = Router();

ensureUploadDirs();

function resolveKind(req, _res, next) {
  const kind = String(req.query.kind || "products").trim();
  req.uploadKind = UPLOAD_KINDS.includes(kind) ? kind : "products";
  next();
}

/** Buyers/guests may only upload payment slips; merchants upload catalog/QR/docs. */
function gateUploadAuth(req, res, next) {
  const kind = String(req.query.kind || "products").trim();
  if (kind === "payment-slips") {
    return requireUserOrGuest(req, res, next);
  }
  return requireAuth(req, res, () =>
    requireRole("merchant", "staff", "admin", "super_admin")(req, res, next),
  );
}

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
  gateUploadAuth,
  resolveKind,
  (req, res) => {
    disk.single("file")(req, res, (err) => {
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
      const savedName = req.file.filename;
      if (!savedName) {
        return fail(res, 500, "Upload missing filename", "upload_error");
      }
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
