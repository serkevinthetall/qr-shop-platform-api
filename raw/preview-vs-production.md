# Preview vs Production (Hostinger)

## Mapping

| Stage | Git branch | API host | DB |
|-------|------------|----------|-----|
| Production | `main` | https://api.qrshopmyanmar.com | Live MySQL (`u…_qrshopapi`) |
| Preview | `preview` | https://api-preview.qrshopmyanmar.com | **Separate** MySQL (e.g. `u…_qrshopapi_preview`) |

Frontends:

| App | Production | Preview |
|-----|------------|---------|
| Marketplace | store.qrshopmyanmar.com | store-preview.qrshopmyanmar.com |
| Merchant | merchant.qrshopmyanmar.com | merchant-preview.qrshopmyanmar.com |
| Admin | apanel.qrshopmyanmar.com | apanel-preview.qrshopmyanmar.com |

## One-time Hostinger setup (you / ops)

1. Create DNS + sites for `*-preview.qrshopmyanmar.com` and `api-preview.qrshopmyanmar.com`.
2. Create a **new** MySQL database for preview (do not reuse production).
3. On the preview API host:
   ```bash
   cp .env.preview.example .env
   # fill DATABASE_URL, JWT_SECRET, …
   npm install
   npx prisma db push
   # optional: npm run seed (if you have a safe preview seed)
   ```
4. Point Hostinger (or git deploy) so:
   - production API site tracks `main`
   - preview API site tracks `preview`
5. Build each preview frontend with `.env.preview.example` → upload to the matching preview site.

## Rules

- Preview apps must call **api-preview** only.
- Never run `prisma db push` / migrations against production using preview credentials by mistake.
- Promote by merging `preview` → `main`, then redeploy production sites.
