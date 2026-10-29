# Deploy stages

| Stage | Git branch | Use |
|-------|------------|-----|
| **Production** | `main` | Live API for all apps |
| **Preview** | `preview` | Staging API (safe DB / keys) |

## Vercel

1. Import this repo (uses `vercel.json`).
2. **Production Branch** = `main`.
3. Pushing to `preview` (and pull requests) creates **Preview** deployments.
4. Configure **Preview** and **Production** env vars separately (never commit `.env`).

Required on both stages (values differ per stage):

```
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=7d
CORS_ORIGINS=
PUBLIC_BASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=
```

Use a **separate Preview database** (or branch) when possible so staging never wipes production data.

After Preview API is live, set each app’s Preview `EXPO_PUBLIC_API_URL` to that URL.
