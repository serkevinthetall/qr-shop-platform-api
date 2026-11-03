/**
 * Stable QR / share redirects.
 * Printed codes use https://api.qrshopmyanmar.com/go/... so the marketplace
 * host can move (Vercel → Hostinger) by changing MARKETPLACE_PUBLIC_ORIGIN only.
 */
import { Router } from "express";

const router = Router();

function marketplaceOrigin() {
  return String(
    process.env.MARKETPLACE_PUBLIC_ORIGIN ||
      "https://qr-shop-marketplace.vercel.app",
  )
    .trim()
    .replace(/\/$/, "");
}

function querySuffix(req) {
  const i = req.originalUrl.indexOf("?");
  return i >= 0 ? req.originalUrl.slice(i) : "";
}

function seg(value) {
  return encodeURIComponent(String(value ?? "").trim());
}

/** GET /go/s/:shopId/p/:productId */
router.get("/s/:shopId/p/:productId", (req, res) => {
  const target = `${marketplaceOrigin()}/s/${seg(req.params.shopId)}/p/${seg(req.params.productId)}${querySuffix(req)}`;
  res.redirect(302, target);
});

/** GET /go/s/:shopId */
router.get("/s/:shopId", (req, res) => {
  const target = `${marketplaceOrigin()}/s/${seg(req.params.shopId)}${querySuffix(req)}`;
  res.redirect(302, target);
});

/** GET /go/product/:productId — mall PDP */
router.get("/product/:productId", (req, res) => {
  const target = `${marketplaceOrigin()}/product/${seg(req.params.productId)}${querySuffix(req)}`;
  res.redirect(302, target);
});

export default router;
