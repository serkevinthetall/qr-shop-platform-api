-- MySQL: extend Order.stage enum with new pipeline values.
-- Keep legacy delivery / pickup / invoiced for existing rows.

ALTER TABLE `Order`
  MODIFY COLUMN `stage` ENUM(
    'request',
    'approved',
    'out_for_delivery',
    'ready_pickup',
    'completed',
    'cancelled',
    'delivery',
    'pickup',
    'invoiced'
  ) NOT NULL DEFAULT 'request';

-- Optional backfill:
-- UPDATE `Order` SET stage = 'out_for_delivery' WHERE stage IN ('delivery', 'invoiced');
-- UPDATE `Order` SET stage = 'ready_pickup' WHERE stage = 'pickup';
