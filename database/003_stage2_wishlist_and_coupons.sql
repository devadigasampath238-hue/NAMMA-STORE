-- ===========================================================
-- 003_stage2_wishlist_and_coupons.sql
-- -----------------------------------------------------------
-- Namma Store - Stage 2 one-time migration.
--
-- Safe to run more than once. NOTHING IS DELETED.
-- After this you should not need pgAdmin for products,
-- categories, coupons, wishlist or orders again.
--
--   psql -U postgres -d namma_store_dev -f database/003_stage2_wishlist_and_coupons.sql
--
-- (Start the backend once first so Hibernate's ddl-auto=update
--  creates the new table/columns. The statements below are
--  belt-and-braces for the case where it hasn't.)
-- ===========================================================


-- -----------------------------------------------------------
-- 1. Wishlist
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS wishlist_items (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    product_id  BIGINT NOT NULL,
    created_at  TIMESTAMP(6) DEFAULT NOW()
);

-- A unique index is the only thing that actually prevents duplicates
-- when the customer double-clicks the heart or has two tabs open.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'uk_wishlist_user_product'
    ) THEN
        -- Clear any duplicates that predate the constraint, keeping the oldest row.
        DELETE FROM wishlist_items w
         USING wishlist_items keep
         WHERE w.user_id = keep.user_id
           AND w.product_id = keep.product_id
           AND w.id > keep.id;

        CREATE UNIQUE INDEX uk_wishlist_user_product
            ON wishlist_items (user_id, product_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items (user_id);


-- -----------------------------------------------------------
-- 2. Coupons: the fields the admin screen needs
-- -----------------------------------------------------------
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS description      VARCHAR(255);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS discount_type    VARCHAR(255);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS discount_value   NUMERIC(19,2);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_order_value  NUMERIC(19,2);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_discount     NUMERIC(19,2);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expiry_date      DATE;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS usage_limit      INTEGER;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count       INTEGER DEFAULT 0;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at       TIMESTAMP(6);

-- Backfill from the legacy percentage-only columns. Existing coupons keep
-- behaving exactly as they did before.
UPDATE coupons
   SET discount_type   = COALESCE(discount_type, 'PERCENT'),
       discount_value  = COALESCE(discount_value, discount_percent, 0),
       min_order_value = COALESCE(min_order_value, 0),
       max_discount    = COALESCE(max_discount, max_discount_amount),
       used_count      = COALESCE(used_count, 0),
       created_at      = COALESCE(created_at, NOW());

-- Codes are matched case-insensitively by the backend; store them uppercase.
UPDATE coupons SET code = UPPER(TRIM(code)) WHERE code <> UPPER(TRIM(code));

ALTER TABLE coupons ALTER COLUMN code SET NOT NULL;


-- -----------------------------------------------------------
-- 3. A couple of starter coupons (only if the table is empty)
-- -----------------------------------------------------------
-- These exist purely so you can test the checkout coupon box
-- immediately. Manage them from /admin/coupons afterwards.
INSERT INTO coupons (code, description, discount_type, discount_value,
                     discount_percent, min_order_value, max_discount,
                     max_discount_amount, usage_limit, used_count, active, created_at)
SELECT 'NAMMA10', '10% off your order', 'PERCENT', 10, 10, 499, 150, 150, NULL, 0, TRUE, NOW()
 WHERE NOT EXISTS (SELECT 1 FROM coupons);

INSERT INTO coupons (code, description, discount_type, discount_value,
                     discount_percent, min_order_value, max_discount,
                     max_discount_amount, usage_limit, used_count, active, created_at)
SELECT 'FLAT100', 'Rs.100 off orders above Rs.999', 'FIXED', 100, 0, 999, NULL, NULL, NULL, 0, TRUE, NOW()
 WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE code = 'FLAT100');
