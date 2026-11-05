import { Router } from "express";
import { ok } from "../lib/response.js";

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

/**
 * Public — Merchant native app polls this for force-update.
 * GET /api/app-config/merchant
 *
 * Hostinger env (optional):
 *   MERCHANT_APP_MIN_VERSION          (default 1.0.1 — forces current 1.0.0 beta)
 *   MERCHANT_APP_MIN_IOS_VERSION
 *   MERCHANT_APP_MIN_ANDROID_VERSION
 *   MERCHANT_FORCE_UPDATE               (true|false — always require store update)
 *   MERCHANT_IOS_STORE_URL
 *   MERCHANT_ANDROID_STORE_URL
 *   MERCHANT_UPDATE_MESSAGE
 */
router.get("/merchant", (_req, res) => {
  const minVersion = envStr("MERCHANT_APP_MIN_VERSION", "1.0.1");
  const minIos = envStr("MERCHANT_APP_MIN_IOS_VERSION", minVersion);
  const minAndroid = envStr("MERCHANT_APP_MIN_ANDROID_VERSION", minVersion);
  const forceUpdate = envBool("MERCHANT_FORCE_UPDATE", false);

  return ok(res, {
    app: "merchant",
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
  });
});

export default router;
