# Graph Report - QR Shop Platform API  (2026-11-05)

## Corpus Check
- 77 files · ~54,767 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 414 nodes · 887 edges · 22 communities (20 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8cef8435`
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

## God Nodes (most connected - your core abstractions)
1. `fail()` - 40 edges
2. `ok()` - 26 edges
3. `requireAuth()` - 26 edges
4. `requireRole()` - 24 edges
5. `normalizePhone()` - 19 edges
6. `scripts` - 13 edges
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
Cohesion: 0.10
Nodes (34): isMerchantOwner(), requireShopOwner(), shopIdOrFail(), publishMessageEvent(), fail(), ok(), recordStockAdjustMove(), publicTownship() (+26 more)

### Community 1 - "orders.routes.js"
Cohesion: 0.10
Nodes (27): main(), unitPriceForChannel(), allocateOrderCode(), looksLikeOrderCode(), ACTIVE_PIPELINE_STAGES, isReadyPickupStage(), normalizeOrderStage(), OPEN_STAGES (+19 more)

### Community 2 - "server.js"
Cohesion: 0.06
Nodes (35): realtimeClientCount(), ensureUploadDirs(), IMAGE_MIME, isAllowedImage(), makeFilename(), publicUrlFor(), root, safeExt() (+27 more)

### Community 3 - "scripts"
Cohesion: 0.07
Nodes (26): nodemon, description, devDependencies, nodemon, engines, node, main, name (+18 more)

### Community 4 - "dependencies"
Cohesion: 0.09
Nodes (23): bcryptjs, cors, dotenv, express, helmet, jsonwebtoken, multer, dependencies (+15 more)

### Community 5 - "catalog.routes.js"
Cohesion: 0.11
Nodes (21): issueGuestSession(), issueSession(), publicUser(), isPubliclySold(), parseAttributes(), productWriteData(), publicMerchantProduct(), sellChannelsOf() (+13 more)

### Community 6 - "env.js"
Cohesion: 0.09
Nodes (19): prisma, main(), prisma, upsertUser(), main(), prisma, upsertUser(), ensureOrder() (+11 more)

### Community 8 - "admin.routes.js"
Cohesion: 0.13
Nodes (18): isVisibleToMerchant(), MERCHANT_SCOPES, normalizeMerchantScope(), parseMerchantIds(), publicAnnouncement(), toDbFields(), BUILTIN_PLATFORM_PAYMENTS, ensureBuiltinPlatformPayments() (+10 more)

### Community 9 - "QR Shop Platform API"
Cohesion: 0.12
Nodes (14): Deploy stages, Vercel, Auth flows, Demo accounts (after `npm run db:seed`), Deploy stages (Preview vs Production), Main routes (Marketplace-ready), Merchant listing mode (B2C / B2B / both / portfolio), Merchant routes (+6 more)

### Community 10 - "auth.routes.js"
Cohesion: 0.26
Nodes (9): main(), defaultCategories(), defaultHero(), loadMallMeta(), metaPath, root, parseMallProductId(), productInclude (+1 more)

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

### Community 20 - "merchant-guest.routes.js"
Cohesion: 0.20
Nodes (17): toMallProduct(), mallPricesForProduct(), resolvePricingContext(), channelsFromListingMode(), featuresPayloadForMode(), LISTING_MODES, normalizeListingMode(), publicShopChannels() (+9 more)

### Community 21 - "merchant-overview.routes.js"
Cohesion: 0.11
Nodes (23): enrichZones(), getDeliveryFeeForTownship(), normalizeMediaUrl(), root, SEED_COVER_FILES, SEED_LOGO_FILES, seedPathForFilename(), seedUploadsDir() (+15 more)

### Community 22 - "Postman — QR Shop Platform API"
Cohesion: 0.33
Nodes (5): Auth header, Import, Postman — QR Shop Platform API, Seed logins, Test order

## Knowledge Gaps
- **138 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+133 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fail()` connect `fail` to `orders.routes.js`, `server.js`, `catalog.routes.js`, `admin.routes.js`, `auth.routes.js`, `merchant-guest.routes.js`, `merchant-overview.routes.js`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `ok()` connect `fail` to `orders.routes.js`, `server.js`, `catalog.routes.js`, `admin.routes.js`, `auth.routes.js`, `merchant-guest.routes.js`, `merchant-overview.routes.js`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `requireAuth()` connect `fail` to `orders.routes.js`, `server.js`, `catalog.routes.js`, `admin.routes.js`, `auth.routes.js`, `merchant-guest.routes.js`, `merchant-overview.routes.js`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _138 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `fail` be split into smaller, more focused modules?**
  _Cohesion score 0.10273224043715846 - nodes in this community are weakly interconnected._
- **Should `orders.routes.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09759759759759759 - nodes in this community are weakly interconnected._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06448202959830866 - nodes in this community are weakly interconnected._