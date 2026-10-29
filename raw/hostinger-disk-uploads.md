# Hostinger disk uploads (product photos)

QR Shop stores product / shop / payment-QR images on **Hostinger server disk**, not cloud object storage.

## Flow

1. Merchant (or staff/admin) `POST /api/uploads` with multipart `file`
2. API writes under `UPLOAD_DIR/{kind}/…` (`products` | `shops` | `payment-qr` | `docs`)
3. Response `url` → save on `Product.imageUrl` (or shop logo, wallet QR)
4. Clients load `GET /uploads/...` (Express static)

## Env (Hostinger VPS / Node)

```
PUBLIC_BASE_URL=https://api.your-domain.com
UPLOAD_DIR=/home/…/uploads
UPLOAD_MAX_BYTES=5242880
```

Keep `uploads/` outside deploy wipe if you redeploy from git (or rsync excluding that folder).

## Limits

- Images only: jpeg / png / webp / gif
- Default max 5 MB
