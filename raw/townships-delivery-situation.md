# Townships + delivery fees (QR Shop only)

Source sheet: township name (MM + EN), state, **postal code**, country.  
Used by **Admin · Merchant · Marketplace** — not any external ERP.

## Connection

```text
Admin     → publish Township (active) + postalCode
Merchant  → Delivery: pick township, set feeKs, reorder
Marketplace → buyer address = street + townshipId
            → checkout fee from merchant zone
```

Id: `{state}-{nameEn}-{postalCode}` e.g. `yangon-hlaing-11051`  
Seed: `data/townships.json` · `npm run db:seed:townships`

## APIs

- `GET /api/townships` — published list (includes postalCode)
- `GET|PUT /api/merchant/delivery` — zones `{ townshipId, feeKs }`
- Order delivery fee from those zones when `townshipId` is set
