# Deploy stages

| Stage | Git branch | Use |
|-------|------------|-----|
| **Production** | `main` | Live API for Marketplace · Merchant · Admin |
| **Preview** | `preview` | Staging API (separate DB / keys) |

Keep Preview and Production isolated — never point Preview apps at the production database.

## Where the API runs

| Surface | Role |
|---------|------|
| **Hostinger Node** (`api.qrshopmyanmar.com`) | Primary production API + **disk uploads** (`UPLOAD_DIR` outside `public_html`) |
| **Vercel** (optional / Preview) | Serverless Express via `api/index.js` + `vercel.json` — **no durable disk**; product photos still need Hostinger or https image URLs |

### Vercel

1. Import this repo (uses `vercel.json`).
2. **Production Branch** = `main`.
3. Pushing to `preview` (and pull requests) creates **Preview** deployments.
4. Configure **Preview** and **Production** env vars separately (never commit `.env`).

After Preview API is live, set each app’s Preview `EXPO_PUBLIC_API_URL` to that URL.

## Environment checklist

Required on each stage (values differ per stage):

```
DATABASE_URL=          # Hostinger MySQL (Prisma)
JWT_SECRET=
JWT_EXPIRES_IN=7d
CORS_ORIGINS=          # comma-separated app origins
PUBLIC_BASE_URL=       # e.g. https://api.qrshopmyanmar.com
MARKETPLACE_PUBLIC_ORIGIN=  # mall web origin for /go redirects
```

Hostinger production (disk photos) — see `raw/hostinger-disk-uploads.md`:

```
UPLOAD_DIR=/home/<user>/qrshop-uploads
UPLOAD_MAX_BYTES=10485760
```

Optional hardening:

```
HEALTH_DIAGNOSTICS_KEY=   # unlocks detailed GET /health (header x-health-key or ?key=)
NODE_ENV=production
```

### Not used in production

- **Supabase Postgres / Storage** — retired. DB is **Hostinger MySQL**; photos are **Hostinger disk** (`POST /api/uploads`), not Supabase Storage.
- Do not set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or `SUPABASE_STORAGE_BUCKET` unless you intentionally revive that path.

Historical notes: `raw/supabase-situation.md` (legacy).

## Health checks

Public `GET /health` returns only:

```json
{ "ok": true, "data": { "service": "qr-shop-platform-api", "status": "ok" } }
```

(`status` is `degraded` if the DB ping fails — no error text or env flags.)

For ops diagnostics in production, set `HEALTH_DIAGNOSTICS_KEY` and call:

```bash
curl -s -H "x-health-key: $HEALTH_DIAGNOSTICS_KEY" https://api.qrshopmyanmar.com/health
```

## After deploy

1. `GET /health` → `status: "ok"`
2. Merchant upload a product photo → file appears under `UPLOAD_DIR/products/`
3. Marketplace / Merchant / Admin Preview URLs use the Preview API host only
