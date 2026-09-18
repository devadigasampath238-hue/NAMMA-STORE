-- ===========================================================
-- 002_stage1_orders_and_images.sql
-- -----------------------------------------------------------
-- Namma Store - Stage 1 one-time migration.
--
-- This is the ONE script you need to run for Stage 1. After
-- this, products, categories, images, coupons and orders are
-- all managed from the admin dashboard - you should not need
-- to open pgAdmin for day-to-day work again.
--
-- It is safe to run more than once: every statement is either
-- IF NOT EXISTS or a guarded UPDATE. NOTHING IS DELETED.
--
-- Run it with:
--   psql -U postgres -d namma_store_dev -f database/002_stage1_orders_and_images.sql
--
-- (Start the backend once BEFORE running this, so Hibernate's
--  ddl-auto=update has already added the new columns. The
--  ADD COLUMN statements below are belt-and-braces for the
--  case where it hasn't.)
-- ===========================================================


-- -----------------------------------------------------------
-- 1. Orders: the new server-side price breakdown + customer
--    snapshot + payment fields.
-- -----------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number     VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal         NUMERIC(19,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount  NUMERIC(19,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_charge  NUMERIC(19,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method   VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status   VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name    VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email   VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone   VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_line     VARCHAR(500);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS city             VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS state            VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pincode          VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP(6);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_image_url VARCHAR(255);


-- Backfill the money breakdown for orders placed before Stage 1.
-- The old schema only stored the final total, so the honest
-- reconstruction is: subtotal = total, no discount, no delivery.
UPDATE orders
   SET subtotal        = COALESCE(subtotal, total_amount, 0),
       discount_amount = COALESCE(discount_amount, 0),
       delivery_charge = COALESCE(delivery_charge, 0)
 WHERE subtotal IS NULL
    OR discount_amount IS NULL
    OR delivery_charge IS NULL;

UPDATE orders SET payment_method = 'COD'     WHERE payment_method IS NULL;
UPDATE orders SET payment_status = 'PENDING' WHERE payment_status IS NULL;
UPDATE orders SET updated_at     = created_at WHERE updated_at IS NULL;


-- Map the two legacy statuses onto the new lifecycle.
--   PENDING -> PLACED        (order taken, nothing done yet)
--   PAID    -> CONFIRMED     (payment settled, ready to process)
UPDATE orders SET status = 'PLACED'    WHERE status = 'PENDING';
UPDATE orders SET status = 'CONFIRMED' WHERE status = 'PAID';

-- Mark historically PAID orders as actually paid.
UPDATE orders SET payment_status = 'PAID'
 WHERE status = 'CONFIRMED' AND payment_status = 'PENDING';


-- Give every existing order a customer-facing reference number.
UPDATE orders SET order_number = 'NS' || (100000 + id)
 WHERE order_number IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'orders_order_number_key'
    ) THEN
        BEGIN
            ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
        EXCEPTION WHEN others THEN
            NULL; -- already unique under another name
        END;
    END IF;
END $$;


-- Copy the customer snapshot down from the user record where we can,
-- so old orders still render a name/email on the order detail page.
UPDATE orders o
   SET customer_name  = COALESCE(o.customer_name,  u.display_name),
       customer_email = COALESCE(o.customer_email, u.email),
       customer_phone = COALESCE(o.customer_phone, u.phone)
  FROM app_users u
 WHERE o.user_id = u.id
   AND (o.customer_name IS NULL OR o.customer_email IS NULL OR o.customer_phone IS NULL);


-- -----------------------------------------------------------
-- 2. Users: profile picture column.
-- -----------------------------------------------------------
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS photo_url VARCHAR(255);


-- -----------------------------------------------------------
-- 3. Images: collapse absolute URLs back to relative paths.
-- -----------------------------------------------------------
-- The old upload flow saved "http://localhost:8080/uploads/x.jpg" into
-- the database. The backend now stores "/uploads/x.jpg" and builds the
-- absolute URL at response time from app.public.base-url, so images keep
-- working when the host changes.
--
-- The backend reads BOTH formats, so this step is optional tidying, not
-- a requirement. Externally hosted images (any other domain) are left
-- completely untouched.

UPDATE products
   SET thumbnail_url = '/uploads/' || split_part(thumbnail_url, '/uploads/', 2)
 WHERE thumbnail_url LIKE 'http%/uploads/%';

UPDATE products
   SET background_image_url = '/uploads/' || split_part(background_image_url, '/uploads/', 2)
 WHERE background_image_url LIKE 'http%/uploads/%';

UPDATE categories
   SET image_url = '/uploads/' || split_part(image_url, '/uploads/', 2)
 WHERE image_url LIKE 'http%/uploads/%';

UPDATE product_images
   SET image_url = '/uploads/' || split_part(image_url, '/uploads/', 2)
 WHERE image_url LIKE 'http%/uploads/%';

UPDATE customizable_products
   SET image_url = '/uploads/' || split_part(image_url, '/uploads/', 2)
 WHERE image_url LIKE 'http%/uploads/%';


-- -----------------------------------------------------------
-- 4. Make sure every product's gallery contains its thumbnail.
-- -----------------------------------------------------------
-- Stage 1 treats product_images as the single ordered gallery with
-- position 0 = primary. Products that only ever had a thumbnail get it
-- inserted at position 0 so the new image gallery has something to show.
INSERT INTO product_images (product_id, image_order, image_url)
SELECT p.id, 0, p.thumbnail_url
  FROM products p
 WHERE p.thumbnail_url IS NOT NULL
   AND p.thumbnail_url <> ''
   AND NOT EXISTS (
       SELECT 1 FROM product_images pi WHERE pi.product_id = p.id
   );
