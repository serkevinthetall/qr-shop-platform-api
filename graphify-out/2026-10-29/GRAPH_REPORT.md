# Graph Report - QR Shop Platform API  (2026-10-28)

## Corpus Check
- 61 files · ~35,111 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 317 nodes · 695 edges · 20 communities (18 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `fail()` - 37 edges
2. `ok()` - 23 edges
3. `requireAuth()` - 23 edges
4. `requireRole()` - 21 edges
5. `normalizePhone()` - 17 edges
6. `scripts` - 12 edges
7. `shopIdOrFail()` - 9 edges
8. `requireShopOwner()` - 8 edges
9. `publicShopChannels()` - 8 edges
10. `resolvePricingContext()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `defaultCategories()`  [EXTRACTED]
  scripts/seed-mall-meta.js → src/lib/mall-meta.js
- `shopIdOrFail()` --calls--> `fail()`  [EXTRACTED]
  src/routes/merchant-guest.routes.js → src/lib/response.js
- `resolvePricingContext()` --calls--> `normalizePhone()`  [EXTRACTED]
  src/lib/pricing-context.js → src/lib/phone.js
- `canViewOrder()` --calls--> `normalizePhone()`  [EXTRACTED]
  src/routes/orders.routes.js → src/lib/phone.js
- `assertCouponsModule()` --calls--> `fail()`  [EXTRACTED]
  src/routes/merchant-coupons.routes.js → src/lib/response.js

## Import Cycles
- None detected.

## Communities (20 total, 2 thin omitted)

### Community 0 - "fail"
Cohesion: 0.09
Nodes (38): isMerchantOwner(), requireShopOwner(), shopIdOrFail(), fail(), ok(), publicTownship(), readBearer(), requireAuth() (+30 more)

### Community 1 - "orders.routes.js"
Cohesion: 0.13
Nodes (23): enrichZones(), getDeliveryFeeForTownship(), unitPriceForChannel(), normalizeLogin(), normalizePhone(), cleanup(), clients, publish() (+15 more)

### Community 2 - "server.js"
Cohesion: 0.13
Nodes (26): ensurePublicBucket(), getSupabaseAdmin(), storageBucketName(), supabaseStorageConfigured(), uploadImageBuffer(), ensureUploadDirs(), IMAGE_MIME, isAllowedImage() (+18 more)

### Community 3 - "scripts"
Cohesion: 0.08
Nodes (24): nodemon, description, devDependencies, nodemon, prisma, engines, node, main (+16 more)

### Community 4 - "dependencies"
Cohesion: 0.09
Nodes (23): bcryptjs, cors, dotenv, express, helmet, jsonwebtoken, multer, dependencies (+15 more)

### Community 5 - "catalog.routes.js"
Cohesion: 0.14
Nodes (17): main(), defaultCategories(), defaultHero(), loadMallMeta(), metaPath, root, parseMallProductId(), isPubliclySold() (+9 more)

### Community 6 - "env.js"
Cohesion: 0.12
Nodes (16): prisma, main(), prisma, upsertUser(), ensureOrder(), ensureShop(), IMG, main() (+8 more)

### Community 7 - "merchant-guest.routes.js"
Cohesion: 0.22
Nodes (15): toMallProduct(), mallPricesForProduct(), pricesForContext(), resolvePricingContext(), channelsFromListingMode(), featuresPayloadForMode(), LISTING_MODES, normalizeListingMode() (+7 more)

### Community 8 - "admin.routes.js"
Cohesion: 0.25
Nodes (12): isVisibleToMerchant(), MERCHANT_SCOPES, normalizeMerchantScope(), parseMerchantIds(), publicAnnouncement(), toDbFields(), announcementBody, createMerchantSchema (+4 more)

### Community 9 - "QR Shop Platform API"
Cohesion: 0.17
Nodes (11): Auth flows, Demo accounts (after `npm run db:seed`), Main routes (Marketplace-ready), Merchant listing mode (B2C / B2B / both / portfolio), Merchant routes, One-time buyer (QR), Product photos (Hostinger disk), QR Shop Platform API (+3 more)

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

## Knowledge Gaps
- **110 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+105 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fail()` connect `fail` to `orders.routes.js`, `server.js`, `catalog.routes.js`, `merchant-guest.routes.js`, `admin.routes.js`, `auth.routes.js`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `scripts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `requireAuth()` connect `fail` to `orders.routes.js`, `server.js`, `catalog.routes.js`, `merchant-guest.routes.js`, `admin.routes.js`, `auth.routes.js`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _110 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `fail` be split into smaller, more focused modules?**
  _Cohesion score 0.08907103825136611 - nodes in this community are weakly interconnected._
- **Should `orders.routes.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13118279569892474 - nodes in this community are weakly interconnected._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12688172043010754 - nodes in this community are weakly interconnected._