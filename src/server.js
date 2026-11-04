/**
 * QR Shop Platform API — Marketplace · Merchant · Admin
 * DB: Hostinger MySQL · Photos: Hostinger disk (UPLOAD_DIR) or Supabase if configured
 */
import "./lib/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import serverless from "serverless-http";

import authRoutes from "./routes/auth.routes.js";
import guestRoutes from "./routes/guest.routes.js";
import merchantGuestRoutes from "./routes/merchant-guest.routes.js";
import merchantDeliveryRoutes from "./routes/merchant-delivery.routes.js";
import merchantProductsRoutes from "./routes/merchant-products.routes.js";
import merchantPaymentsRoutes from "./routes/merchant-payments.routes.js";
import merchantOverviewRoutes from "./routes/merchant-overview.routes.js";
import merchantStaffRoutes from "./routes/merchant-staff.routes.js";
import merchantPosRoutes from "./routes/merchant-pos.routes.js";
import merchantCouponsRoutes from "./routes/merchant-coupons.routes.js";
import merchantEnquiriesRoutes from "./routes/merchant-enquiries.routes.js";
import merchantChatRoutes from "./routes/merchant-chat.routes.js";
import merchantGuidesRoutes from "./routes/merchant-guides.routes.js";
import orderRoutes from "./routes/orders.routes.js";
import checkoutRoutes from "./routes/checkout.routes.js";
import catalogRoutes from "./routes/catalog.routes.js";
import shopRoutes from "./routes/shops.routes.js";
import townshipRoutes from "./routes/townships.routes.js";
import addressRoutes from "./routes/addresses.routes.js";
import uploadRoutes from "./routes/uploads.routes.js";
import mallRoutes from "./routes/mall.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import reviewRoutes from "./routes/reviews.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import {
  adminPortalRouter,
  merchantPortalRouter,
} from "./routes/portal-messages.routes.js";
import realtimeRoutes from "./routes/realtime.routes.js";
import goRoutes from "./routes/go.routes.js";
import { ok, fail } from "./lib/response.js";
import { prisma } from "./lib/prisma.js";
import { realtimeClientCount } from "./lib/realtime.js";
import { ensureUploadDirs, uploadsRoot } from "./lib/uploads.js";
import { seedUploadsDir } from "./lib/media-url.js";
import {
  ensurePublicBucket,
  supabaseStorageConfigured,
  storageBucketName,
} from "./lib/supabase-storage.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

const origins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: origins.length ? origins : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

ensureUploadDirs();
app.use(
  "/uploads",
  express.static(uploadsRoot(), {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  }),
);
/** Durable seed shop logo / cover (Vercel has no persistent disk uploads). */
app.use(
  "/seed",
  express.static(seedUploadsDir(), {
    maxAge: process.env.NODE_ENV === "production" ? "30d" : 0,
  }),
);
/** Also try repo uploads/ when present (local + bundled). */
app.use(
  "/uploads",
  express.static(path.join(__apiRoot, "uploads"), {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
    fallthrough: true,
  }),
);

app.get("/health", async (_req, res) => {
  let dbOk = false;
  let dbError = null;
  const rawUrl = process.env.DATABASE_URL || "";
  let dbProtocol = null;
  try {
    dbProtocol = new URL(rawUrl).protocol.replace(":", "");
  } catch {
    dbProtocol = rawUrl ? "invalid_url" : null;
  }
  try {
    await prisma.$queryRawUnsafe("SELECT 1 AS ok");
    dbOk = true;
  } catch (err) {
    dbError = String(err?.message || err).slice(0, 240);
  }
  ok(res, {
    service: "qr-shop-platform-api",
    phase: "merchant-backend",
    clients: ["marketplace", "merchant", "admin"],
    database: "hostinger-mysql",
    dbProtocol,
    dbOk,
    dbError,
    storage: supabaseStorageConfigured() ? "supabase" : "disk-uploads",
    storageBucket: supabaseStorageConfigured() ? storageBucketName() : null,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasJwtSecret: Boolean(process.env.JWT_SECRET),
    hasPublicBaseUrl: Boolean(process.env.PUBLIC_BASE_URL),
    hasSupabaseStorage: supabaseStorageConfigured(),
    uploadDirSet: Boolean(String(process.env.UPLOAD_DIR || "").trim()),
    marketplacePublicOrigin: String(
      process.env.MARKETPLACE_PUBLIC_ORIGIN ||
        "https://store.qrshopmyanmar.com",
    )
      .trim()
      .replace(/\/$/, ""),
  });
});

/** Stable QR landing — change MARKETPLACE_PUBLIC_ORIGIN when mall host moves. */
app.use("/go", goRoutes);

app.get("/api", (_req, res) => {
  ok(res, {
    name: "QR Shop Platform API",
    version: "0.6.0",
    routes: [
      "GET  /go/s/:shopId",
      "GET  /go/s/:shopId/p/:productId",
      "GET  /go/product/:productId",
      "POST /api/auth/login",
      "GET  /api/merchant/overview",
      "GET  /api/merchant/shop",
      "PATCH /api/merchant/shop",
      "GET  /api/merchant/products",
      "POST /api/merchant/products",
      "PUT  /api/merchant/products/:id",
      "PATCH /api/merchant/products/:id/stock",
      "GET  /api/merchant/payments",
      "PUT  /api/merchant/payments",
      "GET  /api/merchant/delivery",
      "PUT  /api/merchant/delivery",
      "GET  /api/merchant/staff",
      "POST /api/merchant/staff",
      "POST /api/merchant/pos/charge",
      "GET  /api/merchant/pos/orders",
      "GET  /api/merchant/pos/reserved-pickups",
      "POST /api/merchant/pos/collect/:orderId",
      "GET  /api/merchant/coupons",
      "GET  /api/merchant/enquiries",
      "PATCH /api/merchant/enquiries/:id",
      "GET  /api/merchant/guides",
      "GET  /api/merchant/guest-phones",
      "POST /api/merchant/guest-qr",
      "POST /api/auth/guest/open",
      "POST /api/auth/guest/easy-checkout",
      "GET  /api/auth/guest/products",
      "POST /api/orders/guest",
      "POST /api/catalog/:id/view",
      "GET  /api/orders",
      "PATCH /api/orders/:id/stage",
      "GET  /api/realtime/stream",
      "POST /api/uploads?kind=products",
      "GET  /api/admin/announcements",
    ],
    realtimeClients: realtimeClientCount(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/auth/guest", guestRoutes);
app.use("/api/merchant", merchantOverviewRoutes);
app.use("/api/merchant", merchantProductsRoutes);
app.use("/api/merchant", merchantPaymentsRoutes);
app.use("/api/merchant", merchantStaffRoutes);
app.use("/api/merchant", merchantPosRoutes);
app.use("/api/merchant", merchantCouponsRoutes);
app.use("/api/merchant", merchantEnquiriesRoutes);
app.use("/api/merchant", merchantChatRoutes);
app.use("/api/merchant", merchantGuidesRoutes);
app.use("/api/merchant", merchantGuestRoutes);
app.use("/api/merchant", merchantDeliveryRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/shops", shopRoutes);
app.use("/api/townships", townshipRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/mall", mallRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/portal", adminPortalRouter);
app.use("/api/merchant/portal", merchantPortalRouter);

app.use((req, res) => {
  fail(res, 404, `Not found: ${req.method} ${req.path}`);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    ok: false,
    error: { message: "Server error", detail: err?.message },
  });
});

const port = Number(process.env.PORT) || 4100;

if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`QR Shop Platform API → http://localhost:${port}`);
    console.log(`GET  http://localhost:${port}/health`);
    console.log(`POST http://localhost:${port}/api/auth/login`);
    if (supabaseStorageConfigured()) {
      console.log(`Storage → Supabase bucket "${storageBucketName()}"`);
      void ensurePublicBucket().then((r) => {
        if (!r.ok) console.warn("[storage] bucket check:", r.reason);
        else if (r.created) console.log("[storage] bucket created (public)");
      });
    } else {
      console.log("Storage → local disk (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for bucket)");
    }
  });
}

export default app;
export const handler = serverless(app);
