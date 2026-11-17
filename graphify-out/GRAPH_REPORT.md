# Graph Report - QR Shop Platform API  (2026-11-17)

## Corpus Check
- 96 files · ~70,456 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 558 nodes · 1162 edges · 26 communities (23 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fdd84110`
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
- go.routes.js
- setup-preview-db.sh

## God Nodes (most connected - your core abstractions)
1. `fail()` - 40 edges
2. `ok()` - 27 edges
3. `requireAuth()` - 27 edges
4. `requireRole()` - 25 edges
5. `normalizePhone()` - 19 edges
6. `scripts` - 14 edges
7. `main()` - 12 edges
8. `shopIdOrFail()` - 11 edges
9. `allocateOrderCode()` - 10 edges
10. `createOrderPayload()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `main()` --references--> `@prisma/client`  [EXTRACTED]
  scripts/seed-sample-shop-orders.js → package.json
- `main()` --calls--> `allocateOrderCode()`  [EXTRACTED]
  scripts/backfill-order-codes.mjs → src/lib/order-code.js
- `main()` --calls--> `allocateOrderCode()`  [EXTRACTED]
  scripts/import-odoo-qr-app-to-sample-shop.js → src/lib/order-code.js
- `main()` --calls--> `ensureBuiltinPlatformPayments()`  [EXTRACTED]
  scripts/seed-mall-meta.js → src/lib/platform-payments.js
- `main()` --references--> `@prisma/client`  [EXTRACTED]
  scripts/import-odoo-qr-app-to-sample-shop.js → package.json

## Import Cycles
- None detected.

## Communities (26 total, 3 thin omitted)

### Community 0 - "fail"
Cohesion: 0.06
Nodes (58): isMerchantOwner(), requireShopOwner(), shopIdOrFail(), realtimeClientCount(), fail(), ok(), recordStockAdjustMove(), readBearer() (+50 more)

### Community 1 - "orders.routes.js"
Cohesion: 0.06
Nodes (37): main(), BASKETS, buildSpecs(), BUYERS, DELIVERY_STAGES, __dirname, main(), PAYMENTS (+29 more)

### Community 2 - "server.js"
Cohesion: 0.08
Nodes (33): normalizeMediaUrl(), root, SEED_COVER_FILES, SEED_LOGO_FILES, seedPathForFilename(), seedUploadsDir(), withNormalizedShopMedia(), DAY_KEYS (+25 more)

### Community 3 - "scripts"
Cohesion: 0.07
Nodes (27): nodemon, description, devDependencies, nodemon, engines, node, main, name (+19 more)

### Community 4 - "dependencies"
Cohesion: 0.09
Nodes (23): bcryptjs, cors, dotenv, express, helmet, jsonwebtoken, multer, nodemailer (+15 more)

### Community 5 - "catalog.routes.js"
Cohesion: 0.10
Nodes (23): issueGuestSession(), issueSession(), publicUser(), isPubliclySold(), parseAttributes(), productWriteData(), publicMerchantProduct(), sellChannelsOf() (+15 more)

### Community 6 - "env.js"
Cohesion: 0.09
Nodes (19): prisma, main(), prisma, upsertUser(), main(), prisma, upsertUser(), ensureOrder() (+11 more)

### Community 7 - "import-odoo-qr-app-to-sample-shop.js"
Cohesion: 0.11
Nodes (21): @prisma/client, @prisma/client, createOdooClient(), ensureSampleShop(), fetchAllSearchRead(), kyats(), main(), mapFulfillment() (+13 more)

### Community 8 - "admin.routes.js"
Cohesion: 0.07
Nodes (48): consumeChallenge(), grantKey(), grantViewAccess(), hashCode(), hasViewAccess(), issueViewAccountOtp(), listAccountsForAdmin(), loadAccountDetail() (+40 more)

### Community 9 - "QR Shop Platform API"
Cohesion: 0.07
Nodes (25): After deploy, Deploy stages (Hostinger), Health checks, Not used in production, Preview env, Production env, Where the API runs, Mapping (+17 more)

### Community 10 - "auth.routes.js"
Cohesion: 0.15
Nodes (21): enrichZones(), getDeliveryFeeForTownship(), getExpressFeeForState(), getShopHomeState(), normalizeStateKey(), packZonesJson(), parseExpressStates(), resolveDeliveryOptions() (+13 more)

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
Cohesion: 0.16
Nodes (16): normalizeLogin(), normalizePhone(), cleanup(), clients, publish(), publishMessageEvent(), publishOrderEvent(), subscribe() (+8 more)

### Community 20 - "merchant-guest.routes.js"
Cohesion: 0.14
Nodes (22): main(), ensureCategoriesSeeded(), defaultCategories(), defaultHero(), loadMallMeta(), metaPath, root, parseMallProductId() (+14 more)

### Community 21 - "merchant-overview.routes.js"
Cohesion: 0.80
Nodes (4): candidateFromId(), digitsOnly(), isCompleteBarcode(), main()

### Community 22 - "Postman — QR Shop Platform API"
Cohesion: 0.33
Nodes (5): Auth header, Import, Postman — QR Shop Platform API, Seed logins, Test order

### Community 23 - "seed-sample-shop-messages.js"
Cohesion: 0.25
Nodes (7): BUYERS, cuidLike(), __dirname, main(), prisma, root, SCRIPTS

## Knowledge Gaps
- **181 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+176 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `import-odoo-qr-app-to-sample-shop.js` to `orders.routes.js`, `dependencies`?**
  _High betweenness centrality (0.166) - this node is a cross-community bridge._
- **Why does `allocateOrderCode()` connect `orders.routes.js` to `Database: Supabase Postgres`, `import-odoo-qr-app-to-sample-shop.js`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `scripts`, `import-odoo-qr-app-to-sample-shop.js`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _181 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `fail` be split into smaller, more focused modules?**
  _Cohesion score 0.06332992849846783 - nodes in this community are weakly interconnected._
- **Should `orders.routes.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0647342995169082 - nodes in this community are weakly interconnected._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07665505226480836 - nodes in this community are weakly interconnected._