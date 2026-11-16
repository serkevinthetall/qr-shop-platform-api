# Deploy stages (Hostinger)

| Stage | Git branch | Hostinger site | Database |
|-------|------------|----------------|----------|
| **Production** | `main` | https://api.qrshopmyanmar.com | Live MySQL |
| **Preview** | `preview` | https://api-preview.qrshopmyanmar.com | **Separate** MySQL |

Keep Preview and Production isolated — never point Preview apps at the production database.

See [raw/preview-vs-production.md](./raw/preview-vs-production.md) for the full Hostinger checklist.

## Where the API runs

| Surface | Role |
|---------|------|
| **Hostinger Node** (`api.qrshopmyanmar.com`) | Production API + disk uploads |
| **Hostinger Node** (`api-preview.qrshopmyanmar.com`) | Preview API + separate `UPLOAD_DIR` + separate DB |
| **Vercel** (optional) | Serverless Express via `api/index.js` — **no durable disk** |

## Production env

```
DATABASE_URL=          # live Hostinger MySQL
JWT_SECRET=
JWT_EXPIRES_IN=7d
CORS_ORIGINS=https://store.qrshopmyanmar.com,https://merchant.qrshopmyanmar.com,https://apanel.qrshopmyanmar.com
PUBLIC_BASE_URL=https://api.qrshopmyanmar.com
MARKETPLACE_PUBLIC_ORIGIN=https://store.qrshopmyanmar.com
UPLOAD_DIR=/home/<user>/qrshop-uploads
UPLOAD_MAX_BYTES=10485760
NODE_ENV=production
```

## Preview env

Template: [`.env.preview.example`](./.env.preview.example)

```
DATABASE_URL=          # preview MySQL only
JWT_SECRET=            # different from production
CORS_ORIGINS=https://store-preview.qrshopmyanmar.com,https://merchant-preview.qrshopmyanmar.com,https://apanel-preview.qrshopmyanmar.com
PUBLIC_BASE_URL=https://api-preview.qrshopmyanmar.com
MARKETPLACE_PUBLIC_ORIGIN=https://store-preview.qrshopmyanmar.com
UPLOAD_DIR=./uploads-preview
```

After creating the preview DB:

```bash
cp .env.preview.example .env
# edit secrets
npm install
npx prisma db push
```

## Health checks

Public `GET /health` returns only:

```json
{ "ok": true, "data": { "service": "qr-shop-platform-api", "status": "ok" } }
```

For ops diagnostics, set `HEALTH_DIAGNOSTICS_KEY` and call:

```bash
curl -s -H "x-health-key: $HEALTH_DIAGNOSTICS_KEY" https://api.qrshopmyanmar.com/health
curl -s -H "x-health-key: $HEALTH_DIAGNOSTICS_KEY" https://api-preview.qrshopmyanmar.com/health
```

## After deploy

1. `GET /health` → `status: "ok"` on that stage’s host
2. Preview Merchant upload a product photo → file under preview `UPLOAD_DIR`
3. Preview Marketplace / Merchant / Admin use **api-preview** only

### Not used in production

- **Supabase Postgres / Storage** — retired. DB is **Hostinger MySQL**; photos are **Hostinger disk**.
