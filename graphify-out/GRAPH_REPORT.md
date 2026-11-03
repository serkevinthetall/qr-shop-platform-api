# Graph Report - QR Shop Platform API  (2026-11-02)

## Corpus Check
- 70 files · ~45,204 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 374 nodes · 832 edges · 22 communities (20 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2bd37632`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- fail
- orders.routes.js
- server.js
- scripts
- dependencies
- catalog.routes.js
- env.js
- merchant-guest.routes.js
- admin.routes.js
- QR Shop Platform API
- auth.routes.js
- Merchant backend (Platform API)
- QR Admin — Announcements backend
- Marketplace → Platform API (backend)
- Three apps ↔ Platform API (2026-10-28)
- Hostinger disk uploads (product photos)
- vercel.json
- Townships + delivery fees (QR Shop only)
- Database: Supabase Postgres
- auth-hostinger-situation.md
- merchant-guest.routes.js
- merchant-overview.routes.js

## God Nodes (most connected - your core abstractions)
1. `fail()` - 40 edges
2. `ok()` - 26 edges
3. `requireAuth()` - 26 edges
4. `requireRole()` - 24 edges
5. `normalizePhone()` - 19 edges
6. `scripts` - 12 edges
7. `shopIdOrFail()` - 11 edges
8. `createOrderPayload()` - 9 edges
9. `requireShopOwner()` - 8 edges
10. `publishMessageEvent()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `allocateOrderCode()`  [EXTRACTED]
  scripts/backfill-order-codes.mjs → src/lib/order-code.js
- `main()` --calls--> `ensureBuiltinPlatformPayments()`  [EXTRACTED]
  scripts/seed-mall-meta.js → src/lib/platform-payments.js
- `main()` --calls--> `defaultCategories()`  [EXTRACTED]
  scripts/seed-mall-meta.js → src/lib/mall-meta.js
- `main()` --calls--> `defaultHero()`  [EXTRACTED]
  scripts/seed-mall-meta.js → src/lib/mall-meta.js
- `shopIdOrFail()` --calls--> `fail()`  [EXTRACTED]
  src/routes/merchant-guest.routes.js → src/lib/response.js

## Import Cycles
- None detected.

## Communities (22 total, 2 thin omitted)

### Community 0 - "fail"
Cohesion: 0.12
Nodes (28): isMerchantOwner(), requireShopOwner(), shopIdOrFail(), fail(), ok(), recordStockAdjustMove(), publicTownship(), readBearer() (+20 more)

### Community 1 - "orders.routes.js"
Cohesion: 0.16
Nodes (16): main(), enrichZones(), getDeliveryFeeForTownship(), unitPriceForChannel(), allocateOrderCode(), looksLikeOrderCode(), formatLocation(), townshipLabel() (+8 more)

### Community 2 - "server.js"
Cohesion: 0.09
Nodes (34): ensurePublicBucket(), getSupabaseAdmin(), storageBucketName(), supabaseStorageConfigured(), uploadImageBuffer(), ensureUploadDirs(), IMAGE_MIME, isAllowedImage() (+26 more)

### Community 3 - "scripts"
Cohesion: 0.08
Nodes (24): nodemon, description, devDependencies, nodemon, prisma, engines, node, main (+16 more)

### Community 4 - "dependencies"
Cohesion: 0.09
Nodes (23): bcryptjs, cors, dotenv, express, helmet, jsonwebtoken, multer, dependencies (+15 more)

### Community 5 - "catalog.routes.js"
Cohesion: 0.12
Nodes (21): main(), defaultCategories(), defaultHero(), loadMallMeta(), metaPath, root, parseMallProductId(), isPubliclySold() (+13 more)

### Community 6 - "env.js"
Cohesion: 0.11
Nodes (16): prisma, main(), prisma, upsertUser(), ensureOrder(), ensureShop(), IMG, main() (+8 more)

### Community 7 - "merchant-guest.routes.js"
Cohesion: 0.11
Nodes (21): normalizeLogin(), normalizePhone(), cleanup(), clients, publish(), publishMessageEvent(), publishOrderEvent(), realtimeClientCount() (+13 more)

### Community 8 - "admin.routes.js"
Cohesion: 0.13
Nodes (18): isVisibleToMerchant(), MERCHANT_SCOPES, normalizeMerchantScope(), parseMerchantIds(), publicAnnouncement(), toDbFields(), BUILTIN_PLATFORM_PAYMENTS, ensureBuiltinPlatformPayments() (+10 more)

### Community 9 - "QR Shop Platform API"
Cohesion: 0.12
Nodes (14): Deploy stages, Vercel, Auth flows, Demo accounts (after `npm run db:seed`), Deploy stages (Preview vs Production), Main routes (Marketplace-ready), Merchant listing mode (B2C / B2B / both / portfolio), Merchant routes (+6 more)

### Community 10 - "auth.routes.js"
Cohesion: 0.24
Nodes (9): issueGuestSession(), issueSession(), publicUser(), signToken(), loginSchema, registerBuyerSchema, registerMerchantSchema, ROLES (+1 more)

### Community 11 - "Merchant backend (Platform API)"
Cohesion: 0.29
Nodes (6): Auth, Merchant backend (Platform API), Not in this pass, Product fields (Prisma), Schema note, Surface map (Merchant UI → API)

### Community 12 - "QR Admin — Announcements backend"
Cohesion: 0.33
Nodes (5): Admin (JWT admin / super_admin), Body (matches Admin UI Draft), Public reads, QR Admin — Announcements backend, Seed

### Community 13 - "Marketplace → Platform API (backend)"
Cohesion: 0.33
Nodes (5): Cart, Marketplace → Platform API (backend), Marketplace screens → API, Pricing / stock, Seed after db push

### Community 14 - "Three apps ↔ Platform API (2026-10-28)"
Cohesion: 0.33
Nodes (5): Backend, Client wiring, Demo logins (API), Live DB (2026-10-28 follow-up), Three apps ↔ Platform API (2026-10-28)

### Community 15 - "Hostinger disk uploads (product photos)"
Cohesion: 0.40
Nodes (4): Env (Hostinger VPS / Node), Flow, Hostinger disk uploads (product photos), Limits

### Community 16 - "vercel.json"
Cohesion: 0.40
Nodes (4): builds, routes, $schema, version

### Community 17 - "Townships + delivery fees (QR Shop only)"
Cohesion: 0.50
Nodes (3): APIs, Connection, Townships + delivery fees (QR Shop only)

### Community 20 - "merchant-guest.routes.js"
Cohesion: 0.18
Nodes (18): toMallProduct(), mallPricesForProduct(), resolvePricingContext(), channelsFromListingMode(), featuresPayloadForMode(), LISTING_MODES, normalizeListingMode(), publicShopChannels() (+10 more)

### Community 21 - "merchant-overview.routes.js"
Cohesion: 0.21
Nodes (8): defaultStoreStyle(), normalizePreset(), parseStoreStyle(), storeStyleToJson(), dayKey(), router, startOfLocalDay(), WEEKDAY_SHORT

## Knowledge Gaps
- **121 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+116 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fail()` connect `fail` to `orders.routes.js`, `server.js`, `catalog.routes.js`, `merchant-guest.routes.js`, `admin.routes.js`, `auth.routes.js`, `merchant-guest.routes.js`, `merchant-overview.routes.js`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `ok()` connect `fail` to `orders.routes.js`, `server.js`, `catalog.routes.js`, `merchant-guest.routes.js`, `admin.routes.js`, `auth.routes.js`, `merchant-guest.routes.js`, `merchant-overview.routes.js`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `requireAuth()` connect `fail` to `orders.routes.js`, `server.js`, `catalog.routes.js`, `merchant-guest.routes.js`, `admin.routes.js`, `auth.routes.js`, `merchant-guest.routes.js`, `merchant-overview.routes.js`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _121 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `fail` be split into smaller, more focused modules?**
  _Cohesion score 0.12470588235294118 - nodes in this community are weakly interconnected._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09041835357624832 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._