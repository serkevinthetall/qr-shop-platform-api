# QR Shop Platform API

Backend for **Marketplace · Merchant · Admin**.  
**Hostinger MySQL** · photos on **Hostinger disk** (`UPLOAD_DIR` → `/uploads`).

Auth + mall channels: registered logins, one-time buyer QR, shop modes **b2c / b2b / both / portfolio**, marketplace prices for B2C and B2B.

## Roles

| Role | App | Login |
|------|-----|--------|
| `super_admin` | Admin | Email + password |
| `admin` | Admin | Email + password |
| `merchant` | Merchant | Email/phone + password |
| `staff` | Merchant | Phone + PIN |
| `buyer` | Marketplace | Phone + password + **address** on register |
| One-time guest | Marketplace / QR | **No User** — QR → guest JWT |

## Demo accounts (after `npm run db:seed`)

| Role | Login | Password |
|------|-------|----------|
| Super admin | `super@qrshop.com` | `11111` |
| Admin | `qrshop@gmail.com` | `11111` |
| Merchant | `admin@gmail.com` | `1111` |
| Staff | `09777100201` | `1234` |
| Buyer | `09111222333` | `1111` |

Sample guest phone open for B2B on shop `shop-nova`: `09998887766`.

## Setup (Hostinger MySQL + disk photos)

```bash
cd "/Users/qrmyanmar/Desktop/Odoo Backup Area/QR Shop Platform API"
cp .env.hostinger .env
# Edit .env → DATABASE_URL (MySQL) + JWT_SECRET + UPLOAD_DIR

npm install
npm run build          # prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

API: `http://localhost:4100`  
Photos: see `raw/hostinger-disk-uploads.md`.

## Auth flows

### Registered login

```bash
curl -s http://localhost:4100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"09111222333","password":"1111","role":"buyer"}'
```

Register buyer (address required):

```bash
curl -s http://localhost:4100/api/auth/register/buyer \
  -H 'Content-Type: application/json' \
  -d '{"name":"Aung","phone":"09123456789","password":"1111","address":"Yangon"}'
```

### One-time buyer (QR)

1. Merchant creates QR:

```bash
curl -s http://localhost:4100/api/merchant/guest-qr \
  -H "Authorization: Bearer <merchant_jwt>" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"09998887766","b2bAllowed":true}'
```

2. Customer scans / opens token:

```bash
curl -s http://localhost:4100/api/auth/guest/qr \
  -H 'Content-Type: application/json' \
  -d '{"token":"<token>","name":"Walk-in"}'
```

Response includes guest JWT + `pricing.showBoth` when shop B2C+B2B are on and phone is open for B2B.

3. Guest places order (no User row):

```bash
curl -s http://localhost:4100/api/orders/guest \
  -H "Authorization: Bearer <guest_jwt>" \
  -H 'Content-Type: application/json' \
  -d '{
    "buyerName":"Walk-in",
    "channel":"b2b",
    "fulfillment":"pickup",
    "payment":"cod",
    "lines":[{"productName":"Nova Chair","qty":1,"unitKs":65000}]
  }'
```

### Merchant listing mode (B2C / B2B / both / portfolio)

```bash
curl -s -X PATCH http://localhost:4100/api/merchant/channels \
  -H "Authorization: Bearer <merchant_jwt>" \
  -H 'Content-Type: application/json' \
  -d '{"listingMode":"both"}'
```

| `listingMode` | Marketplace |
|---------------|-------------|
| `b2c` | Retail price only, can order |
| `b2b` | Wholesale price only, can order |
| `both` | B2C + B2B prices, can order |
| `portfolio` | Showcase only — **no checkout** |

Mall catalog: `GET /api/catalog` returns `priceB2cKs`, `priceB2bKs`, `listingMode`, `canOrder`.

## Main routes (Marketplace-ready)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/auth/login` | All portals (`role` lock) |
| POST | `/api/auth/register/buyer` | Phone + password + address |
| POST | `/api/auth/register/merchant` | Shop pending |
| GET/PATCH | `/api/auth/me` | Registered profile |
| POST | `/api/auth/guest/qr` | Redeem QR → guest JWT |
| GET | `/api/catalog` | Mall grid (`categoryId`, `q`, `deal`, `page`) |
| GET | `/api/catalog/categories` | Category chips |
| GET | `/api/catalog/hero` | Home hero |
| GET | `/api/catalog/:id` | PDP (`shopId__productId`) |
| GET | `/api/shops` | Shops directory |
| GET | `/api/shops/:id/delivery-quote` | Fee for township |
| GET | `/api/mall/settings` | Marketplace kill-switches |
| GET | `/api/mall/ads` | Home ad carousel |
| GET | `/api/mall/announcements` | Customer announcements |
| GET | `/api/admin/announcements` | Admin list (JWT admin) |
| POST | `/api/admin/announcements` | Admin create / upsert |
| PUT/PATCH/DELETE | `/api/admin/announcements/:id` | Update · publish · delete |
| POST | `/api/mall/enquiries` | Shops directory enquiry |
| GET/POST | `/api/reviews` | Product reviews |
| POST | `/api/checkout` | Multi-shop cart → orders (server priced) |
| POST | `/api/orders` | Single-shop order |
| GET | `/api/orders` · `GET /api/orders/:id` | Buyer/merchant lists + detail |
| POST | `/api/uploads?kind=products` | Hostinger disk → `imageUrl` |
| GET | `/health` | Liveness (`status` only; diagnostics need `HEALTH_DIAGNOSTICS_KEY`) |

## Merchant routes

JWT `merchant` or `staff` (shop-scoped). Full map: `raw/merchant-backend-situation.md`.

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/merchant/overview` | Today sales, queues, low stock |
| GET · PATCH | `/api/merchant/shop` | Profile / logo / cover |
| PATCH | `/api/shops/:id/features` | Modules + `listingMode` |
| GET · POST | `/api/merchant/products` | Inventory CRUD |
| PUT · DELETE | `/api/merchant/products/:id` | Update / soft-delete |
| PATCH | `/api/merchant/products/:id/stock` | `set` or `delta` (staff OK) |
| GET · PUT | `/api/merchant/payments` | COD / wallets + QR URLs |
| GET · PUT | `/api/merchant/delivery` | Township zones |
| GET · POST | `/api/merchant/staff` | Roster (needs Staff module On) |
| POST | `/api/merchant/pos/charge` | In-store sale → completed order |
| GET | `/api/merchant/pos/orders` | POS history |
| GET · POST | `/api/merchant/coupons` | Coupon codes module |
| GET · PATCH | `/api/merchant/enquiries` | Reply to shop enquiries |
| GET | `/api/merchant/guides` | Published Admin guides |
| GET · PUT | `/api/merchant/guest-phones` | B2B phone whitelist |
| GET · POST | `/api/merchant/guest-qr` | One-time buyer QR |
| GET · PATCH | `/api/merchant/channels` | Listing mode shortcut |
| GET | `/api/orders?stage=&source=` | Shop orders (`source=pos` etc.) |
| PATCH | `/api/orders/:id/stage` | Advance / reserve pickup |

After schema changes: `npx prisma db push` (adds `Shop.coverUrl` + product barcode/UoM fields).

See `raw/marketplace-backend-situation.md` for buyer UI → API map.

### Product photos (Hostinger disk)

```bash
curl -s http://localhost:4100/api/uploads?kind=products \
  -H "Authorization: Bearer <merchant_jwt>" \
  -F "file=@./chair.jpg"
# → { "ok": true, "data": { "url": "http://localhost:4100/uploads/products/…jpg", … } }
```

Save `data.url` on `Product.imageUrl`. On Hostinger set `PUBLIC_BASE_URL` to your API domain and keep `uploads/` on disk (see `raw/hostinger-disk-uploads.md`).

No OTP. Guest identity is phone on the QR/order only.

## Deploy stages (Preview vs Production)

| Stage | Git branch | Vercel |
|-------|------------|--------|
| **Production** | `main` | Production Branch |
| **Preview** | `preview` | Preview deployments |

Configure Preview and Production env vars separately (separate DB recommended). Full checklist: [DEPLOY.md](./DEPLOY.md). Never commit `.env`.
