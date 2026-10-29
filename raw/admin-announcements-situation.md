# QR Admin — Announcements backend

Admin writes announcements; Marketplace buyers and Merchant apps read them.

## Admin (JWT admin / super_admin)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/admin/announcements` | Full list |
| GET | `/api/admin/announcements/:id` | One |
| POST | `/api/admin/announcements` | Create / upsert (`id` optional) |
| PUT | `/api/admin/announcements/:id` | Update |
| PATCH | `/api/admin/announcements/:id/publish` | `{ published: true\|false }` |
| DELETE | `/api/admin/announcements/:id` | Remove |

### Body (matches Admin UI Draft)

```json
{
  "title": "Weekend deals",
  "body": "Save on grocery and beauty…",
  "sendToCustomers": true,
  "merchantScope": "all",
  "merchantIds": [],
  "published": true,
  "authorName": "QR Shop Admin"
}
```

`merchantScope`: `all` | `selected` | `none`  
When `selected`, pass `merchantIds: ["shop-nova", …]`.

## Public reads

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/mall/announcements` | Published + `sendToCustomers` (Marketplace) |
| GET | `/api/mall/announcements?audience=merchant&shopId=` | Merchant feed |

## Seed

```bash
npx prisma db push
npm run db:seed:announcements
```

Login as admin (`qrshop@gmail.com` / `11111` after `db:seed`) → Bearer token → POST announcements.
