import { fail } from "./response.js";

/** Require JWT shopId for merchant/staff routes. */
export function shopIdOrFail(req, res) {
  if (!req.user?.shopId) {
    fail(res, 403, "No shop on account");
    return null;
  }
  return req.user.shopId;
}

export function isMerchantOwner(req) {
  return req.user?.role === "merchant" || req.user?.role === "admin" || req.user?.role === "super_admin";
}

/** Staff may read; only merchant/admin may mutate when ownerOnly. */
export function requireShopOwner(req, res) {
  if (!isMerchantOwner(req) && req.user?.role === "staff") {
    fail(res, 403, "Shop owner only");
    return false;
  }
  return true;
}
