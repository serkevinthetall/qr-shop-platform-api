# Graph Report - QR Shop Platform API  (2026-11-19)

## Corpus Check
- 102 files · ~75,373 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 592 nodes · 1275 edges · 35 communities (30 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `de7a8463`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- fail
- orders.routes.js
- server.js
- scripts
- dependencies
- seed-sample-shop-grocery.js
- env.js
- import-odoo-qr-app-to-sample-shop.js
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
- Postman — QR Shop Platform API
- seed-sample-shop-messages.js
- mall.routes.js
- setup-preview-db.sh
- uploads.routes.js
- catalog.routes.js
- go.routes.js
- merchant-customers.routes.js
- package.json
- devDependencies
- cors
- jsonwebtoken
- prisma

## God Nodes (most connected - your core abstractions)
1. `fail()` - 43 edges
2. `ok()` - 29 edges
3. `requireAuth()` - 28 edges
4. `requireRole()` - 26 edges
5. `normalizePhone()` - 24 edges
6. `scripts` - 14 edges
7. `main()` - 12 edges
8. `shopIdOrFail()` - 11 edges
9. `allocateOrderCode()` - 10 edges
10. `publicShopChannels()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `main()` --references--> `@prisma/client`  [EXTRACTED]
  scripts/seed-sample-shop-grocery.js → package.json
- `main()` --calls--> `allocateOrderCode()`  [EXTRACTED]
  scripts/backfill-order-codes.mjs → src/lib/order-code.js
- `main()` --references--> `@prisma/client`  [EXTRACTED]
  scripts/import-odoo-qr-app-to-sample-shop.js → package.json
- `main()` --references--> `@prisma/client`  [EXTRACTED]
  scripts/seed-sample-shop-orders.js → package.json
- `main()` --calls--> `allocateOrderCode()`  [EXTRACTED]
  scripts/import-odoo-qr-app-to-sample-shop.js → src/lib/order-code.js

## Import Cycles
- None detected.

## Communities (35 total, 5 thin omitted)

### Community 0 - "fail"
Cohesion: 0.11
Nodes (32): isMerchantOwner(), requireShopOwner(), shopIdOrFail(), fail(), ok(), recordStockAdjustMove(), UPLOAD_KINDS, optionalAuth() (+24 more)

### Community 1 - "orders.routes.js"
Cohesion: 0.08
Nodes (36): resolveUnitPrice(), ACTIVE_PIPELINE_STAGES, isReadyPickupStage(), normalizeOrderStage(), OPEN_STAGES, orderUnreadForMerchant(), shouldStockOutForStage(), withNormalizedStage() (+28 more)

### Community 2 - "server.js"
Cohesion: 0.20
Nodes (11): issueGuestSession(), issueSession(), publicUser(), signToken(), changePasswordSchema, loginSchema, oneTimeBuyerSchema, registerBuyerSchema (+3 more)

### Community 3 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, build, db:generate, db:import:odoo-qr-app, db:push, db:seed, db:seed:announcements, db:seed:mall (+6 more)

### Community 4 - "dependencies"
Cohesion: 0.12
Nodes (17): bcryptjs, dotenv, express, helmet, multer, nodemailer, dependencies, bcryptjs (+9 more)

### Community 5 - "seed-sample-shop-grocery.js"
Cohesion: 0.20
Nodes (7): cuidLike(), __dirname, FAMILIES, IMG, main(), prisma, root

### Community 6 - "env.js"
Cohesion: 0.09
Nodes (19): prisma, main(), prisma, upsertUser(), main(), prisma, upsertUser(), ensureOrder() (+11 more)

### Community 7 - "import-odoo-qr-app-to-sample-shop.js"
Cohesion: 0.09
Nodes (29): @prisma/client, @prisma/client, main(), createOdooClient(), ensureSampleShop(), fetchAllSearchRead(), kyats(), main() (+21 more)

### Community 8 - "admin.routes.js"
Cohesion: 0.08
Nodes (40): consumeChallenge(), grantKey(), grantViewAccess(), hashCode(), hasViewAccess(), issueViewAccountOtp(), listAccountsForAdmin(), loadAccountDetail() (+32 more)

### Community 9 - "QR Shop Platform API"
Cohesion: 0.07
Nodes (25): After deploy, Deploy stages (Hostinger), Health checks, Not used in production, Preview env, Production env, Where the API runs, Mapping (+17 more)

### Community 10 - "auth.routes.js"
Cohesion: 0.16
Nodes (20): enrichZones(), getDeliveryFeeForTownship(), getExpressFeeForState(), getShopHomeState(), normalizeStateKey(), packZonesJson(), parseExpressStates(), resolveDeliveryOptions() (+12 more)

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
Cohesion: 0.22
Nodes (8): 1) File Manager — durable folder (outside public_html), 2) API env on Hostinger, 3) Check, Flow, Hostinger disk uploads (product photos), Limits, Migrate old photos (if you used public_html/uploads), Redeploy

### Community 16 - "vercel.json"
Cohesion: 0.18
Nodes (10): includeFiles, maxDuration, memory, buildCommand, functions, api/index.js, installCommand, rewrites (+2 more)

### Community 17 - "Townships + delivery fees (QR Shop only)"
Cohesion: 0.50
Nodes (3): APIs, Connection, Townships + delivery fees (QR Shop only)

### Community 18 - "Database: Supabase Postgres"
Cohesion: 0.24
Nodes (13): isoOrNull(), messageIsReadByPeer(), toMs(), unreadForBuyer(), unreadForMerchant(), loadBuyer(), publicMessage(), publicThread() (+5 more)

### Community 20 - "merchant-guest.routes.js"
Cohesion: 0.15
Nodes (22): appRetailKs(), appWholesaleKs(), toAppCatalogProduct(), parseMallProductId(), parseProductAttributes(), toMallProduct(), unitPriceForChannel(), mallPricesForProduct() (+14 more)

### Community 21 - "merchant-overview.routes.js"
Cohesion: 0.80
Nodes (4): candidateFromId(), digitsOnly(), isCompleteBarcode(), main()

### Community 22 - "Postman — QR Shop Platform API"
Cohesion: 0.33
Nodes (5): Auth header, Import, Postman — QR Shop Platform API, Seed logins, Test order

### Community 23 - "seed-sample-shop-messages.js"
Cohesion: 0.25
Nodes (7): BUYERS, cuidLike(), __dirname, main(), prisma, root, SCRIPTS

### Community 24 - "mall.routes.js"
Cohesion: 0.36
Nodes (9): isVisibleToMerchant(), MERCHANT_SCOPES, normalizeMerchantScope(), parseMerchantIds(), publicAnnouncement(), toDbFields(), defaultSettings, enquirySchema (+1 more)

### Community 26 - "uploads.routes.js"
Cohesion: 0.15
Nodes (15): DAY_KEYS, dayDefault(), defaultOpeningHours(), normalizeDay(), normalizeTime(), openingHoursToJson(), parseOpeningHours(), defaultStoreStyle() (+7 more)

### Community 27 - "catalog.routes.js"
Cohesion: 0.12
Nodes (23): main(), ensureCategoriesSeeded(), defaultCategories(), defaultHero(), loadMallMeta(), metaPath, root, isPubliclySold() (+15 more)

### Community 28 - "go.routes.js"
Cohesion: 0.05
Nodes (40): normalizeMediaUrl(), root, SEED_COVER_FILES, SEED_LOGO_FILES, seedPathForFilename(), seedUploadsDir(), withNormalizedShopMedia(), realtimeClientCount() (+32 more)

### Community 29 - "merchant-customers.routes.js"
Cohesion: 0.20
Nodes (12): customerTypeFromBuyer(), emptyAgg(), findRegisteredBuyerByEmail(), isRegisteredBuyer(), listCustomers(), touchDates(), wholesaleShopIdsForReq(), addSchema (+4 more)

### Community 30 - "package.json"
Cohesion: 0.18
Nodes (10): description, engines, node, main, name, overrides, deepmerge-ts, minimatch (+2 more)

### Community 31 - "devDependencies"
Cohesion: 0.67
Nodes (3): nodemon, devDependencies, nodemon

## Knowledge Gaps
- **186 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+181 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `import-odoo-qr-app-to-sample-shop.js` to `dependencies`, `seed-sample-shop-grocery.js`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Why does `allocateOrderCode()` connect `import-odoo-qr-app-to-sample-shop.js` to `fail`, `orders.routes.js`?**
  _High betweenness centrality (0.157) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `cors`, `jsonwebtoken`, `prisma`, `import-odoo-qr-app-to-sample-shop.js`, `package.json`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _186 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `fail` be split into smaller, more focused modules?**
  _Cohesion score 0.11178451178451178 - nodes in this community are weakly interconnected._
- **Should `orders.routes.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0821256038647343 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._