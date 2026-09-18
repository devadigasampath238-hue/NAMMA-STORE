-- ===========================================================
-- 001_align_product_schema.sql
-- -----------------------------------------------------------
-- Namma Store — defensive schema-alignment script.
--
-- Hibernate runs with `spring.jpa.hibernate.ddl-auto=update`, so it
-- normally creates/adds columns for you on startup. This script is
-- ONLY needed if your live database was created by an older version
-- of the app and still has leftover constraints Hibernate's
-- "update" mode will never relax on its own (e.g. a NOT NULL it
-- added before category/product type became optional-at-the-DB-level
-- fields). It is 100% safe to run multiple times — every statement
-- is a no-op if the column/constraint is already correct, and no
-- data is deleted, renamed, or altered in type.
--
-- Run this once against your database, e.g.:
--   psql -U postgres -d namma_store_dev -f database/001_align_product_schema.sql
-- ===========================================================

-- Make sure every column the Product entity expects exists.
-- (No-ops if Hibernate already created them.)
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type       VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS background_image_url VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_url      VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price         NUMERIC(19,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku                VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand              VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity     INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured           BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS active             BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS customizable       BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id        BIGINT;

-- Category is now resolved and required by the backend at the
-- application layer (a create/update fails cleanly with a 400 if
-- categoryId is missing/invalid), so the column itself only needs to
-- be a plain nullable FK — drop any leftover NOT NULL from an older
-- schema version so an in-flight edit never 500s at the DB layer.
ALTER TABLE products ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE products ALTER COLUMN product_type DROP NOT NULL;
ALTER TABLE products ALTER COLUMN background_image_url DROP NOT NULL;

-- Re-add the FK relationship if it's missing (safe/no-op if present).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_products_category'
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT fk_products_category
            FOREIGN KEY (category_id) REFERENCES categories(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- Categories: slug must exist and be unique (used to build product URLs).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
UPDATE categories SET slug = 'category-' || id WHERE slug IS NULL OR slug = '';
ALTER TABLE categories ALTER COLUMN slug SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'categories_slug_key'
    ) THEN
        BEGIN
            ALTER TABLE categories ADD CONSTRAINT categories_slug_key UNIQUE (slug);
        EXCEPTION WHEN duplicate_table THEN
            NULL; -- constraint already exists under a different name
        END;
    END IF;
END $$;

-- Order/cart customer-design snapshot columns (requirement: admin must
-- see the customer's uploaded design on the order). No-ops if present.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS custom_text      VARCHAR(255);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS custom_image_url VARCHAR(255);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_color   VARCHAR(255);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_size    VARCHAR(255);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS print_position   VARCHAR(255);

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS custom_text      VARCHAR(255);
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS custom_image_url VARCHAR(255);
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS selected_color   VARCHAR(255);
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS selected_size    VARCHAR(255);
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS print_position   VARCHAR(255);
