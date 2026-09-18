-- ===========================================================
-- 006_security_and_cancellation.sql
--
-- Columns backing the cancellation-reason capture added with
-- the IDOR fixes. ddl-auto=update creates these on the next
-- backend start, so running this file is optional.
--
-- Safe to re-run.
-- ===========================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason   VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_comments VARCHAR(1000);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at          TIMESTAMPTZ;

-- Backfill: orders already cancelled have no recorded reason and no
-- timestamp. Use created_at as a conservative stand-in for cancelled_at
-- rather than NOW(), which would claim they were all cancelled today.
UPDATE orders
   SET cancelled_at = created_at
 WHERE status = 'CANCELLED'
   AND cancelled_at IS NULL;

-- FEATURE #37: repair order rows whose money columns were never written.
-- The API also derives these at read time, but fixing the data means
-- reports and SQL queries agree with the UI.
UPDATE orders o
   SET subtotal = sub.total
  FROM (
        SELECT order_id, SUM(COALESCE(final_price, unit_price) * quantity) AS total
          FROM order_items
         GROUP BY order_id
       ) AS sub
 WHERE o.id = sub.order_id
   AND o.subtotal IS NULL;

UPDATE orders
   SET delivery_charge = 0
 WHERE delivery_charge IS NULL;

UPDATE orders
   SET discount_amount = 0
 WHERE discount_amount IS NULL;

UPDATE orders
   SET total_amount = COALESCE(subtotal, 0) - COALESCE(discount_amount, 0) + COALESCE(delivery_charge, 0)
 WHERE total_amount IS NULL;
