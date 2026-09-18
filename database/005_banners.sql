-- ===========================================================
-- 005_banners.sql
-- Admin-managed festival / seasonal hero banners.
--
-- spring.jpa.hibernate.ddl-auto=update will create these tables
-- on the next backend start, so running this file is optional.
-- It is provided so the schema can be applied deliberately
-- (staging/production) instead of relying on Hibernate.
--
-- Safe to re-run: every statement is IF NOT EXISTS.
-- ===========================================================

CREATE TABLE IF NOT EXISTS banners (
    id                BIGSERIAL PRIMARY KEY,
    title             VARCHAR(255) NOT NULL,
    subtitle          VARCHAR(255),

    -- Relative path such as /uploads/banners/<uuid>.jpg.
    -- The API turns this into an absolute URL at response time,
    -- which is why moving the backend never breaks images.
    image_url         VARCHAR(512),
    mobile_image_url  VARCHAR(512),

    cta_text          VARCHAR(120),
    cta_url           VARCHAR(512),
    accent_color      VARCHAR(32),

    start_date        TIMESTAMPTZ,
    end_date          TIMESTAMPTZ,

    display_order     INTEGER      NOT NULL DEFAULT 0,
    active            BOOLEAN      NOT NULL DEFAULT TRUE,

    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Extra images belonging to one campaign.
CREATE TABLE IF NOT EXISTS banner_images (
    banner_id  BIGINT       NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
    image_url  VARCHAR(512) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_banner_images_banner
    ON banner_images (banner_id);

-- The storefront asks for "active banners, in order" on every homepage load.
CREATE INDEX IF NOT EXISTS idx_banners_active_order
    ON banners (active, display_order);

-- NOTE: no festival rows are seeded here on purpose.
-- Deepavali, Dasara, Ugadi, Sankranti and everything after them are
-- created from /admin/banners. Nothing about a specific festival is
-- baked into the schema or the code.
