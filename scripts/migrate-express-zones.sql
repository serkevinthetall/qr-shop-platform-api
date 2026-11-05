-- MySQL: per-township Express fees (like local delivery zones)
ALTER TABLE `ShopDelivery`
  ADD COLUMN `expressZonesJson` JSON NULL;
