# Auth + Hostinger (product memory)

- DB: **Supabase PostgreSQL** via `DATABASE_URL` (was Hostinger; see `raw/supabase-situation.md`)
- No OTP
- Roles: `super_admin`, `admin`, `merchant`, `staff`, `buyer`
- Registered buyer: phone + password + **BuyerAddress** (street + townshipId + location), same as Marketplace Addresses
- Townships: Admin publishes (`Township.active`); Merchant zones `{ townshipId, feeKs }`; Order snapshots townshipId + address line
- One-time buyer: no `User` row; merchant QR embeds phone → guest JWT
- Shop `listingMode`: `b2c` | `b2b` | `both` | `portfolio` (merchant-managed)
- Mall shows `priceB2cKs` / `priceB2bKs` from mode; portfolio = display only, no orders
- Phone B2B gate (QR guests): `GuestPhoneAccess.b2bAllowed`
- Guest order: `Order.buyerId` null, `channel` b2c|b2b, `source` qr_guest
