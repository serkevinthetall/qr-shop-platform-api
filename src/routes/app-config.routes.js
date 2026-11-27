import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import { ensurePlatformSettingsMerchantMaintenance } from "../lib/ensure-schema.js";

const router = Router();

/**
 * Merchant / Marketplace store listing links.
 * Until package detail pages exist, use developer listing pages.
 */
const DEFAULT_MERCHANT_IOS =
  "https://apps.apple.com/us/developer/bsmart-myanmar-co-ltd/id1484476649";
const DEFAULT_MERCHANT_ANDROID =
  "https://play.google.com/store/apps/developer?id=QR+Menu+Myanmar";

function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function envStr(name, fallback = "") {
  const v = String(process.env[name] || "").trim();
  return v || fallback;
}

const DEFAULT_QR_IOS = "https://apps.apple.com/app/id6800218923";
const DEFAULT_QR_ANDROID =
  "https://play.google.com/store/apps/details?id=com.qrshop.myanmar";

/**
 * Public — QR App (buyer) polls this on launch for maintenance / force-update.
 * GET /api/app-config
 *
 * Hostinger env (optional):
 *   APP_MAINTENANCE                 (true|false — pause shop UI)
 *   QR_APP_MIN_VERSION              (default 1.0.0)
 *   QR_APP_MIN_IOS_VERSION
 *   QR_APP_MIN_ANDROID_VERSION
 *   QR_APP_IOS_STORE_URL
 *   QR_APP_ANDROID_STORE_URL
 */
router.get("/", (_req, res) => {
  const minVersion = envStr("QR_APP_MIN_VERSION", "1.0.0");
  const minIos = envStr("QR_APP_MIN_IOS_VERSION", minVersion);
  const minAndroid = envStr("QR_APP_MIN_ANDROID_VERSION", minVersion);
  const maintenance = envBool("APP_MAINTENANCE", false);
  const iosStoreUrl = envStr("QR_APP_IOS_STORE_URL", DEFAULT_QR_IOS);
  const androidStoreUrl = envStr("QR_APP_ANDROID_STORE_URL", DEFAULT_QR_ANDROID);

  const payload = {
    app: "qr-app",
    maintenance,
    min_version: minVersion,
    min_ios_version: minIos,
    min_android_version: minAndroid,
    ios_store_url: iosStoreUrl,
    android_store_url: androidStoreUrl,
    // camelCase aliases
    minVersion,
    minIosVersion: minIos,
    minAndroidVersion: minAndroid,
    iosStoreUrl,
    androidStoreUrl,
  };

  // Flat fields + { ok, data } so older QR App clients and Platform envelope both work.
  return res.json({ ok: true, success: true, ...payload, data: payload });
});

/**
 * Public — Merchant web + native polls this for force-update / maintenance.
 * GET /api/app-config/merchant
 *
 * Maintenance is Admin-controlled (PlatformSettings.merchantMaintenance).
 * Env MERCHANT_APP_MAINTENANCE=true can also force maintenance on.
 *
 * Hostinger env (optional):
 *   MERCHANT_APP_MAINTENANCE          (true|false — emergency override)
 *   MERCHANT_APP_MIN_VERSION          (default 0.0.1 — match current Merchant beta)
 *   MERCHANT_APP_MIN_IOS_VERSION
 *   MERCHANT_APP_MIN_ANDROID_VERSION
 *   MERCHANT_FORCE_UPDATE               (true|false — always require store update)
 *   MERCHANT_IOS_STORE_URL
 *   MERCHANT_ANDROID_STORE_URL
 *   MERCHANT_UPDATE_MESSAGE
 *   MERCHANT_MAINTENANCE_MESSAGE
 */
router.get("/merchant", async (_req, res) => {
  const minVersion = envStr("MERCHANT_APP_MIN_VERSION", "0.0.1");
  const minIos = envStr("MERCHANT_APP_MIN_IOS_VERSION", minVersion);
  const minAndroid = envStr("MERCHANT_APP_MIN_ANDROID_VERSION", minVersion);
  const forceUpdate = envBool("MERCHANT_FORCE_UPDATE", false);
  const envMaintenance = envBool("MERCHANT_APP_MAINTENANCE", false);
  const defaultMaintMsg =
    "QR Merchant is temporarily under maintenance. Please try again later.";

  let dbMaintenance = false;
  let dbMaintMsg = null;
  try {
    await ensurePlatformSettingsMerchantMaintenance();
    const row = await prisma.platformSettings.findUnique({
      where: { id: "default" },
    });
    if (row) {
      dbMaintenance = Boolean(row.merchantMaintenance);
      dbMaintMsg = row.merchantMaintenanceMessage
        ? String(row.merchantMaintenanceMessage)
        : null;
    }
  } catch (err) {
    console.warn(
      "app-config merchant settings",
      String(err?.message || err).slice(0, 200),
    );
  }

  const maintenance = envMaintenance || dbMaintenance;
  const maintenanceMessage =
    dbMaintMsg ||
    envStr("MERCHANT_MAINTENANCE_MESSAGE", defaultMaintMsg);

  return ok(res, {
    app: "merchant",
    maintenance,
    forceUpdate,
    minVersion,
    minIosVersion: minIos,
    minAndroidVersion: minAndroid,
    /** snake_case aliases for clients that mirror QR App naming */
    min_version: minVersion,
    min_ios_version: minIos,
    min_android_version: minAndroid,
    force_update: forceUpdate,
    iosStoreUrl: envStr("MERCHANT_IOS_STORE_URL", DEFAULT_MERCHANT_IOS),
    androidStoreUrl: envStr(
      "MERCHANT_ANDROID_STORE_URL",
      DEFAULT_MERCHANT_ANDROID,
    ),
    ios_store_url: envStr("MERCHANT_IOS_STORE_URL", DEFAULT_MERCHANT_IOS),
    android_store_url: envStr(
      "MERCHANT_ANDROID_STORE_URL",
      DEFAULT_MERCHANT_ANDROID,
    ),
    message: envStr(
      "MERCHANT_UPDATE_MESSAGE",
      "A new QR Merchant version is required. Please update from the store.",
    ),
    maintenanceMessage,
    maintenance_message: maintenanceMessage,
  });
});

export default router;
