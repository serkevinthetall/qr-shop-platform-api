# Three apps ↔ Platform API (2026-10-28)

## Backend

- DB: **Supabase** Session pooler `aws-0-ap-northeast-2` (IPv4)
- Schema pushed + seeded (admin, merchant shop-nova, buyer, townships, mall ads/categories, welcome announcement)
- API: `http://localhost:4100` (`NODE_TLS_REJECT_UNAUTHORIZED=0` for pooler TLS)

## Demo logins (API)

| App | Login | Password |
|-----|-------|----------|
| Marketplace | `09111222333` | `1111` |
| Merchant | `admin@gmail.com` | `1111` |
| Staff | `09777100201` | `1234` |
| Admin | `qrshop@gmail.com` | `11111` |

## Client wiring

Each Expo app has:

- `.env` → `EXPO_PUBLIC_API_URL=http://localhost:4100`
- `lib/platform-api.ts` → JWT + `apiFetch` / `apiLogin`
- Auth login tries **API first**, falls back to localStorage demo if API is down

Marketplace also:

- `lib/hydrate-from-api.ts` on boot → catalog, townships, ads, announcements into shared keys

Admin login syncs `GET /api/admin/merchants` into `saveRegisteredMerchants`.

## Live DB (2026-10-28 follow-up)

- Merchant inventory/orders/modules → Platform API (no `merchant.json` product demo)
- Marketplace mall → API hydrate only (no catalog.json product fallback)
- Checkout → `POST /api/checkout` (orders land in Merchant Orders)
- Login → API only (no local demo password fallback)
- Shared sample in Supabase: Nova Living · Nova Chair · Nova Desk Lamp

Still local / later: purchases POs, member points ledger, activity audit, feedback threads.
