-- ===========================================================
-- 004_stage_returns.sql
-- -----------------------------------------------------------
-- Namma Store - adds the 10-day return window.
--
-- New columns on orders:
--   delivered_at        - stamped automatically the first time
--                          an order's status becomes DELIVERED
--                          (see Admin.java updateOrderStatus).
--                          Anchors the return window.
--   return_status        - NULL | REQUESTED | APPROVED | REJECTED
--                          | COMPLETED
--   return_requested_at  - when the customer asked for a return
--   return_reason        - optional free-text reason
--
-- Safe to run more than once: every statement is IF NOT EXISTS.
-- NOTHING IS DELETED.
--
-- Run it with:
--   psql -U postgres -d namma_store_dev -f database/004_stage_returns.sql
--
-- (Start the backend once BEFORE running this, so Hibernate's
--  ddl-auto=update has already added the new columns. The
--  ADD COLUMN statements below are belt-and-braces for the
--  case where it hasn't, e.g. in an environment that runs with
--  ddl-auto=validate.)
-- ===========================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at        TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_status       VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_reason       VARCHAR(1000);

-- Backfill delivered_at for existing DELIVERED orders using their last
-- update time, so orders delivered before this migration still get a
-- (best-effort) return window instead of being permanently ineligible.
UPDATE orders
SET delivered_at = updated_at
WHERE status = 'DELIVERED' AND delivered_at IS NULL;
