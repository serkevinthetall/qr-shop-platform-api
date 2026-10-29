# Merchant backend (Platform API)

Shop-owner + staff APIs under `/api/merchant/*` (JWT role `merchant` | `staff`).
Orders stay on `/api/orders` (shop-scoped for merchant/staff). Modules toggles remain
`PATCH /api/shops/:id/features`.

## Auth

- Login: `POST /api/auth/login` with email/phone + password (merchant) or phone + PIN (staff).
- Staff users are `User.role = staff` with `shopId` set; PIN hashed in `passwordHash`.

## Surface map (Merchant UI → API)

| Merchant UI | API |
|-------------|-----|
| Overview | `GET /api/merchant/overview` |
| Account / Store profile | `GET` · `PATCH /api/merchant/shop` |
| Modules (listing + flags) | `PATCH /api/shops/:shopId/features` |
| Inventory | `GET/POST /api/merchant/products`, `PUT …/:id`, `PATCH …/:id/stock`, `DELETE …/:id` |
| Orders stages | `GET /api/orders?stage=`, `PATCH /api/orders/:id/stage` |
| Delivery zones | `GET` · `PUT /api/merchant/delivery` |
| Payments + QR | `GET` · `PUT /api/merchant/payments`, `PATCH …/:method` |
| Staff roster | `GET/POST /api/merchant/staff`, `PATCH` · `DELETE …/:id` (needs `staffEnabled`) |
| POS charge | `POST /api/merchant/pos/charge`, `GET /api/merchant/pos/orders` (`posEnabled`) |
| Coupons | `GET/POST /api/merchant/coupons` (`couponCodesEnabled`) |
| Guest B2B phones / QR | `GET/PUT /api/merchant/guest-phones`, `GET/POST /api/merchant/guest-qr` |
| Listing mode shortcut | `GET/PATCH /api/merchant/channels` |
| Messages / enquiries | `GET /api/merchant/enquiries`, `PATCH …/:id` |
| Guides | `GET /api/merchant/guides` |
| Product photos | `POST /api/uploads?kind=products` |

## Product fields (Prisma)

Beyond mall prices: `costKs`, `barcode`, `uom`, `purchaseUom`, `uomFactor`,
`templateId`, `attributesJson`, `showOnWebsite`. Soft-delete = `active: false`.

## Not in this pass

- Purchases / suppliers / landed-cost POs (Merchant Purchases module) — still local sample.
- Member points, BOGO rules, ratings moderation UI beyond existing `/api/reviews`.
- Merchant registration multi-step document upload (use existing register + Admin approve).

## Schema note

`Shop.coverUrl` + Product inventory fields require `npx prisma db push` on Supabase.
