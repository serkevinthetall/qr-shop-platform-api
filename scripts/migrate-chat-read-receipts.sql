-- Chat + order read receipts (WhatsApp-style ticks / inbox unread).
-- Safe to re-run on MySQL/MariaDB that support IF NOT EXISTS (10.3.3+).

ALTER TABLE `ChatThread`
  ADD COLUMN IF NOT EXISTS `merchantLastReadAt` DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS `buyerLastReadAt` DATETIME(3) NULL;

ALTER TABLE `Order`
  ADD COLUMN IF NOT EXISTS `merchantLastReadAt` DATETIME(3) NULL;
