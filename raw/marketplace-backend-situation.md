# Marketplace → Platform API (backend)

Built from QR Shop Marketplace UI Design flows (localStorage → Hostinger Postgres).

## Marketplace screens → API

| UI | Endpoint |
|----|----------|
| Home / Products grid | `GET /api/catalog?categoryId=&q=&deal=&page=` |
| Categories | `GET /api/catalog/categories` |
| Hero | `GET /api/catalog/hero` |
| PDP | `GET /api/catalog/:shopId__productId` |
| Shops directory | `GET /api/shops` + `GET /api/shops/:id` |
| Delivery fee at checkout | `GET /api/shops/:id/delivery-quote?townshipId=` |
| Townships | `GET /api/townships` |
| Login / register | `POST /api/auth/login`, `POST /api/auth/register/buyer` |
| Addresses | `/api/addresses` |
| Checkout (multi-shop) | `POST /api/checkout` `{ packages:[{ shopId, fulfillment, payment, townshipId, lines:[{productId,qty}] }] }` |
| Orders list / detail | `GET /api/orders`, `GET /api/orders/:id` |
| Ads carousel | `GET /api/mall/ads` |
| Announcements | `GET /api/mall/announcements` |
| Shop enquiry | `POST /api/mall/enquiries` |
| Platform gates | `GET /api/mall/settings` |
| Reviews | `GET/POST /api/reviews` |
| Photos | `POST /api/uploads?kind=products` → Hostinger disk |

## Pricing / stock

Checkout and `POST /api/orders` price lines from `Product.priceKs` / `priceB2bKs` when `productId` is set, decrement stock in a transaction.

## Cart

Stays client-side (Marketplace cart context). Server receives packages at checkout only.

## Seed after db push

```bash
npx prisma db push
npm run db:seed
npm run db:seed:townships
npm run db:seed:mall
```
