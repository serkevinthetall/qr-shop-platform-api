# Database: Supabase Postgres

Platform API uses **Supabase PostgreSQL** via `DATABASE_URL` (Prisma).

## Connectivity notes (2026-10-28)

Project ref tried: `miheoecmcmujlvwxdcfe`

| Path | Result |
|------|--------|
| Direct `db.<ref>.supabase.co:5432` | **IPv6-only** AAAA — no IPv4; this Mac → `ENOTFOUND` / `EHOSTUNREACH` |
| Session pooler `aws-0-<region>.pooler.supabase.com:5432` | TCP OK (SIN), but **`tenant/user postgres.<ref> not found`** in every region |
| HTTPS `https://<ref>.supabase.co/rest/v1/` | Project answers (“No API key found”) — HTTP project exists |

**Do not use** the raw password with `#` unencoded — use `%23`.

**Fix:** In Supabase Dashboard → **Connect** → copy **Session pooler** URI exactly (region + user). Confirm project is **not paused**. Prefer pooler on IPv4 networks; direct DB needs IPv6 or Supabase IPv4 add-on.

```bash
node scripts/check-db.js
npx prisma db push
npm run db:seed
```

Photos remain on **local / Hostinger disk** (`POST /api/uploads`), not Supabase Storage.