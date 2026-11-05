-- MySQL: Express (out-of-state) delivery on ShopDelivery + Order.fulfillment

ALTER TABLE `ShopDelivery`
  ADD COLUMN `expressEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `expressFeeKs` INT NOT NULL DEFAULT 0;

ALTER TABLE `Order`
  MODIFY COLUMN `fulfillment` ENUM('delivery', 'pickup', 'express') NOT NULL;
