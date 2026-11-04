# Hostinger disk uploads (product photos)

QR Shop stores product / shop / payment-QR images on **Hostinger server disk** (File Manager), not Supabase.

## Flow

1. Merchant (or staff/admin) `POST /api/uploads?kind=products` with multipart `file`
2. API writes under `UPLOAD_DIR/{kind}/…` (`products` | `shops` | `payment-qr` | `docs`)
3. Response `url` → save on `Product.imageUrl` (or shop logo, wallet QR)
4. Clients load `GET https://api.qrshopmyanmar.com/uploads/...` (Express static)

## 1) File Manager — create folders

In **hPanel → Files → File Manager**:

1. Open `domains/api.qrshopmyanmar.com/public_html/`
2. Create folder `uploads` (if missing)
3. Inside `uploads`, create:
   - `products`
   - `shops`
   - `payment-qr`
   - `docs`
4. Permissions: folders **755** (writable by your account / Node app)

Copy the full path from File Manager’s path bar, e.g.:

`/home/u809131628/domains/api.qrshopmyanmar.com/public_html/uploads`

## 2) API env on Hostinger

Set (and restart Node):

```
PUBLIC_BASE_URL=https://api.qrshopmyanmar.com
UPLOAD_DIR=/home/u809131628/domains/api.qrshopmyanmar.com/public_html/uploads
UPLOAD_MAX_BYTES=10485760
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=
```

Leave Supabase blank so the API uses **disk** mode.

## 3) Check

1. `GET https://api.qrshopmyanmar.com/health` → `"storage":"disk-uploads"`
2. In Merchant, upload a product photo
3. File Manager → `public_html/uploads/products/` shows the new file
4. Open the returned URL: `https://api.qrshopmyanmar.com/uploads/products/….jpg`

## Limits

- Images only: jpeg / png / webp / gif
- Max size from `UPLOAD_MAX_BYTES` (10 MB in `.env.hostinger`)

## Redeploy tip

Do **not** delete `public_html/uploads` when you redeploy API code. Keep that folder durable.
