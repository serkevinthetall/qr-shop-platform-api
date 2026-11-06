# Database: Supabase Postgres (LEGACY)

**Status (2026-11):** Production uses **Hostinger MySQL** via `DATABASE_URL` (Prisma). Supabase Postgres / Storage are **not** configured for live API.

Do not set `SUPABASE_*` env vars on Hostinger or Vercel Production unless intentionally reviving this path.

Photos: **Hostinger disk** (`UPLOAD_DIR` + `POST /api/uploads`) — see `raw/hostinger-disk-uploads.md`.

Deploy checklist: [DEPLOY.md](../DEPLOY.md).

---

## Historical notes (2026-10-28)

Project ref tried: `miheoecmcmujlvwxdcfe`

| Path | Result |
|------|--------|
| Direct `db.<ref>.supabase.co:5432` | **IPv6-only** AAAA — no IPv4; this Mac → `ENOTFOUND` / `EHOSTUNREACH` |
| Session pooler `:5432` | Cap ~15 clients — Vercel + chat poll → **EMAXCONNSESSION**, catalog empty |
| Transaction pooler `:6543` + `pgbouncer=true&connection_limit=1` | Correct for serverless Prisma |
| HTTPS `https://<ref>.supabase.co/rest/v1/` | Project answers (“No API key found”) — HTTP project exists |

**Do not use** the raw password with `#` unencoded — use `%23`.
