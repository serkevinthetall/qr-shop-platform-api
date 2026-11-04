# Hostinger disk uploads (product photos)

QR Shop stores product / shop / payment-QR images on **Hostinger server disk** (File Manager) only.

**Important:** Keep `UPLOAD_DIR` **outside** `public_html` so API code redeploys do not wipe photos.

## Flow

1. Merchant (or staff/admin) `POST /api/uploads?kind=products` with multipart `file`
2. API writes under `UPLOAD_DIR/{kind}/…` (`products` | `shops` | `payment-qr` | `docs`)
3. Response `url` → save on `Product.imageUrl` (or shop logo, wallet QR)
4. Clients load `GET https://api.qrshopmyanmar.com/uploads/...` (Express serves from `UPLOAD_DIR`)

## 1) File Manager — durable folder (outside public_html)

In **hPanel → Files → File Manager**:

1. Go to home: `/home/u809131628/` (your username folder)
2. Create folder `qrshop-uploads` **next to** `domains` — **not** inside `public_html`
3. Inside `qrshop-uploads`, create:
   - `products`
   - `shops`
   - `payment-qr`
   - `docs`
4. Permissions: folders **755**

Full path:

`/home/u809131628/qrshop-uploads`

### Migrate old photos (if you used public_html/uploads)

1. Open `domains/api.qrshopmyanmar.com/public_html/uploads/`
2. Move `products`, `shops`, `payment-qr`, `docs` into `/home/u809131628/qrshop-uploads/`
3. You can delete the empty `public_html/uploads` after the env change + restart

## 2) API env on Hostinger

Set (and **restart** Node):

```
PUBLIC_BASE_URL=https://api.qrshopmyanmar.com
UPLOAD_DIR=/home/u809131628/qrshop-uploads
UPLOAD_MAX_BYTES=10485760
```

URLs stay the same shape: `https://api.qrshopmyanmar.com/uploads/products/….jpg`  
(Node serves `/uploads` from `UPLOAD_DIR` — no need for files under `public_html`.)

## 3) Check

1. `GET https://api.qrshopmyanmar.com/health` → `"storage":"disk-uploads"`, `"uploadDirSet":true`
2. Merchant → upload a product photo
3. File Manager → `qrshop-uploads/products/` shows the new file
4. Open the returned URL in the browser

## Limits

- Images only: jpeg / png / webp / gif
- Max size from `UPLOAD_MAX_BYTES` (10 MB in `.env.hostinger`)

## Redeploy

Safe to replace `public_html` API code. Photos in `/home/u809131628/qrshop-uploads` are **not** touched.
