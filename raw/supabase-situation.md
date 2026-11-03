# Database: Supabase Postgres

Platform API uses **Supabase PostgreSQL** via `DATABASE_URL` (Prisma).

## Connectivity notes (2026-10-28)

Project ref tried: `miheoecmcmujlvwxdcfe`

| Path | Result |
|------|--------|
| Direct `db.<ref>.supabase.co:5432` | **IPv6-only** AAAA — no IPv4; this Mac → `ENOTFOUND` / `EHOSTUNREACH` |
| Session pooler `:5432` | Cap ~15 clients — Vercel + chat poll → **EMAXCONNSESSION**, catalog empty |
| Transaction pooler `:6543` + `pgbouncer=true&connection_limit=1` | Correct for serverless Prisma |
| HTTPS `https://<ref>.supabase.co/rest/v1/` | Project answers (“No API key found”) — HTTP project exists |

**Do not use** the raw password with `#` unencoded — use `%23`.

**Fix:** Use **Transaction** pooler URI (`…pooler.supabase.com:6543/…?pgbouncer=true&connection_limit=1`). `src/lib/prisma.js` rewrites Session `:5432` → Transaction `:6543` at runtime. Confirm project is **not paused**.

```bash
node scripts/check-db.js
npx prisma db push
npm run db:seed
```

Photos remain on **local / Hostinger disk** (`POST /api/uploads`), not Supabase Storage.