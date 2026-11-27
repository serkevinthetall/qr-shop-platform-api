/**
 * Shop customers: one-time (Marketplace guest) vs registered (QR App buyer).
 * Wholesale flag lives on GuestPhoneAccess (registered only).
 */
import { prisma } from "./prisma.js";
import { normalizePhone } from "./phone.js";

export function isRegisteredBuyer(user) {
  return (
    Boolean(user) &&
    user.role === "buyer" &&
    user.passwordLoginEnabled !== false
  );
}

export function customerTypeFromBuyer(user) {
  if (!user) return "one_time";
  return isRegisteredBuyer(user) ? "registered" : "one_time";
}

function emptyAgg(seed = {}) {
  return {
    phone: seed.phone || "",
    name: seed.name || "",
    email: seed.email || null,
    buyerId: seed.buyerId || null,
    type: seed.type || "one_time",
    orderCount: 0,
    totalSpentKs: 0,
    lastOrderAt: null,
    firstSeenAt: null,
    wholesaleAllowed: false,
    note: null,
    shopId: seed.shopId || null,
    shopName: seed.shopName || null,
    source: seed.source || "order",
  };
}

function touchDates(row, iso) {
  if (!iso) return;
  const t = new Date(iso).getTime();
  if (!row.lastOrderAt || t > new Date(row.lastOrderAt).getTime()) {
    row.lastOrderAt = iso;
  }
  if (!row.firstSeenAt || t < new Date(row.firstSeenAt).getTime()) {
    row.firstSeenAt = iso;
  }
}

/**
 * Aggregate customers for one shop (or all shops when shopId is null).
 * @param {{ shopId?: string|null, type?: string, from?: Date|null, to?: Date|null }} opts
 */
export async function listCustomers(opts = {}) {
  const shopId = opts.shopId || null;
  const typeFilter = opts.type || "all";
  const from = opts.from || null;
  const to = opts.to || null;

  const orderWhere = {
    ...(shopId ? { shopId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const [orders, accessRows, shops] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        shopId: true,
        buyerId: true,
        buyerName: true,
        buyerPhone: true,
        totalKs: true,
        createdAt: true,
        buyer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            role: true,
            passwordLoginEnabled: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.guestPhoneAccess.findMany({
      where: shopId ? { shopId } : {},
      orderBy: { updatedAt: "desc" },
    }),
    shopId
      ? prisma.shop.findMany({
          where: { id: shopId },
          select: { id: true, name: true },
        })
      : prisma.shop.findMany({ select: { id: true, name: true } }),
  ]);

  const shopNameById = new Map(shops.map((s) => [s.id, s.name]));
  /** key = `${shopId}|${phone}` */
  const map = new Map();

  const phones = [
    ...new Set(
      [
        ...orders.map((o) => normalizePhone(o.buyerPhone)),
        ...accessRows.map((a) => normalizePhone(a.phone)),
      ].filter(Boolean),
    ),
  ];
  const buyerIds = [
    ...new Set(orders.map((o) => o.buyerId).filter(Boolean)),
  ];

  /** Match 09… / 959… variants to the same buyer. */
  function phoneLookupKeys(raw) {
    const n = normalizePhone(raw);
    const digits = n.replace(/\D/g, "");
    const keys = new Set([n, digits].filter(Boolean));
    if (digits.startsWith("95") && digits.length >= 11) {
      keys.add(`0${digits.slice(2)}`);
    }
    if (digits.startsWith("0") && digits.length >= 10) {
      keys.add(`95${digits.slice(1)}`);
    }
    return [...keys];
  }

  const buyersByPhone = new Map();
  const buyersById = new Map();
  const buyerSelect = {
    id: true,
    name: true,
    phone: true,
    email: true,
    role: true,
    passwordLoginEnabled: true,
  };

  const phoneVariants = [...new Set(phones.flatMap((p) => phoneLookupKeys(p)))];
  if (phoneVariants.length || buyerIds.length) {
    const buyers = await prisma.user.findMany({
      where: {
        role: "buyer",
        OR: [
          ...(phoneVariants.length ? [{ phone: { in: phoneVariants } }] : []),
          ...(buyerIds.length ? [{ id: { in: buyerIds } }] : []),
        ],
      },
      select: buyerSelect,
    });
    for (const b of buyers) {
      buyersById.set(b.id, b);
      for (const k of phoneLookupKeys(b.phone)) {
        buyersByPhone.set(k, b);
      }
    }
  }

  function resolveBuyer(phone, orderBuyer, buyerId) {
    if (orderBuyer) return orderBuyer;
    if (buyerId && buyersById.has(buyerId)) return buyersById.get(buyerId);
    for (const k of phoneLookupKeys(phone)) {
      const hit = buyersByPhone.get(k);
      if (hit) return hit;
    }
    return null;
  }

  for (const o of orders) {
    const phone = normalizePhone(o.buyerPhone);
    if (!phone) continue;
    const key = `${o.shopId}|${phone}`;
    const buyer = resolveBuyer(phone, o.buyer, o.buyerId);
    const type = customerTypeFromBuyer(buyer);
    let row = map.get(key);
    if (!row) {
      row = emptyAgg({
        phone,
        name: (buyer?.name || o.buyerName || phone).trim(),
        email: buyer?.email || null,
        buyerId: buyer?.id || o.buyerId || null,
        type,
        shopId: o.shopId,
        shopName: shopNameById.get(o.shopId) || null,
        source: "order",
      });
      map.set(key, row);
    }
    row.orderCount += 1;
    row.totalSpentKs += Math.max(0, Number(o.totalKs) || 0);
    if (buyer?.name) row.name = buyer.name;
    else if (o.buyerName?.trim()) row.name = o.buyerName.trim();
    if (buyer?.email) row.email = buyer.email;
    if (buyer?.id) row.buyerId = buyer.id;
    row.type = type;
    touchDates(row, o.createdAt?.toISOString?.() || o.createdAt);
  }

  for (const a of accessRows) {
    const phone = normalizePhone(a.phone);
    if (!phone) continue;
    const key = `${a.shopId}|${phone}`;
    const buyer = resolveBuyer(phone, null, null);
    const type = customerTypeFromBuyer(buyer);
    let row = map.get(key);
    if (!row) {
      row = emptyAgg({
        phone,
        name: (buyer?.name || phone).trim(),
        email: buyer?.email || null,
        buyerId: buyer?.id || null,
        type,
        shopId: a.shopId,
        shopName: shopNameById.get(a.shopId) || null,
        source: "added",
      });
      map.set(key, row);
      touchDates(row, a.createdAt?.toISOString?.() || a.createdAt);
    }
    row.wholesaleAllowed = Boolean(a.b2bAllowed);
    row.note = a.note || row.note;
    if (buyer?.email) row.email = buyer.email;
    if (buyer?.id) row.buyerId = buyer.id;
    if (buyer?.name) row.name = buyer.name;
    /** Access without a registered buyer cannot grant wholesale. */
    if (type !== "registered") {
      row.type = type;
      row.wholesaleAllowed = false;
    } else {
      row.type = "registered";
    }
    touchDates(row, a.updatedAt?.toISOString?.() || a.updatedAt);
  }

  let list = [...map.values()];
  if (typeFilter === "one_time" || typeFilter === "registered") {
    list = list.filter((r) => r.type === typeFilter);
  }

  list.sort((a, b) => {
    const ta = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
    const tb = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
    return tb - ta;
  });

  return list;
}

const registeredBuyerSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  role: true,
  passwordLoginEnabled: true,
};

/** Find registered QR App buyer by email (exact, case-insensitive). */
export async function findRegisteredBuyerByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;
  return prisma.user.findFirst({
    where: {
      role: "buyer",
      email: normalized,
      passwordLoginEnabled: true,
      active: true,
    },
    select: registeredBuyerSelect,
  });
}

/** Find registered QR App buyer by phone (normalized). */
export async function findRegisteredBuyerByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 6) return null;
  return prisma.user.findFirst({
    where: {
      role: "buyer",
      phone: normalized,
      passwordLoginEnabled: true,
      active: true,
    },
    select: registeredBuyerSelect,
  });
}

/** Resolve registered buyer from email or phone input. */
export async function findRegisteredBuyerByContact(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.includes("@")) return findRegisteredBuyerByEmail(s);
  return findRegisteredBuyerByPhone(s);
}
