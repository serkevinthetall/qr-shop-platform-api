-- Run against production via local tunnel (.env → 127.0.0.1:3306):
--   npx prisma db execute --schema prisma/schema.prisma --file scripts/check-shop-delivery.sql
SHOW COLUMNS FROM `ShopDelivery`;
SELECT shopId, deliveryEnabled, expressEnabled,
       LEFT(CAST(zonesJson AS CHAR), 120) AS zonesPreview
FROM `ShopDelivery`
LIMIT 10;
