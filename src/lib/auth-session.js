import { signToken } from "../middlewares/auth.middleware.js";

export function publicUser(u, addresses = undefined) {
  const list = addresses?.map((a) => ({
    id: a.id,
    label: a.label,
    street: a.street,
    townshipId: a.townshipId,
    location: a.location,
    isDefault: a.isDefault,
  }));
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    phone: u.phone,
    email: u.email,
    /** Default delivery line (AuthUser.location) */
    address: u.address ?? null,
    location: u.address ?? null,
    townshipId: u.townshipId ?? null,
    shopId: u.shopId,
    active: u.active !== false,
    ...(list ? { addresses: list } : {}),
  };
}

/** Registered account JWT (buyer / merchant / staff / admin / super_admin) */
export function issueSession(user, addresses = undefined) {
  const token = signToken({
    kind: "user",
    sub: user.id,
    role: user.role,
    shopId: user.shopId ?? undefined,
    name: user.name,
  });
  return { token, user: publicUser(user, addresses ?? user.addresses) };
}

/**
 * One-time / QR guest JWT — no User row.
 * Clients use this for pricing context + placing guest orders.
 */
export function issueGuestSession({
  phone,
  shopId,
  b2bAllowed,
  b2cEnabled,
  b2bEnabled,
  listingMode,
  portfolioOnly,
  canOrder,
  name,
}) {
  const canSeeB2b = Boolean(b2bEnabled);
  const canSeeB2c = Boolean(b2cEnabled);
  const token = signToken({
    kind: "guest",
    phone,
    shopId,
    b2bAllowed: Boolean(b2bAllowed),
    name: name || undefined,
  });
  return {
    token,
    guest: {
      kind: "guest",
      phone,
      shopId,
      name: name || null,
      channels: {
        listingMode: listingMode || "b2c",
        portfolioOnly: Boolean(portfolioOnly),
        canOrder: canOrder !== false && !portfolioOnly,
        b2cEnabled: canSeeB2c,
        b2bEnabled: canSeeB2b,
        showBoth: canSeeB2c && canSeeB2b,
      },
    },
  };
}
