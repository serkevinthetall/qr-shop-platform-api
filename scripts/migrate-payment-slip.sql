-- MySQL: buyer wallet transfer slip on Order
-- Safe to re-run only if column missing (errors if already present).
ALTER TABLE `Order`
  ADD COLUMN `paymentSlipUrl` VARCHAR(2048) NULL;
