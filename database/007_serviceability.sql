-- ===========================================================
-- 007_serviceability.sql
--
-- Admin-configured delivery coverage. ddl-auto=update creates
-- these on the next backend start, so this file is optional.
--
-- NO STATES ARE SEEDED, deliberately - not even Karnataka.
-- An empty table means "delivery not configured yet", and the
-- API says exactly that rather than claiming to deliver.
-- Add coverage at /admin/serviceability.
--
-- Safe to re-run.
-- ===========================================================

CREATE TABLE IF NOT EXISTS delivery_states (
    id                  BIGSERIAL PRIMARY KEY,
    name                VARCHAR(120) NOT NULL UNIQUE,
    delivery_charge     NUMERIC(10,2),
    estimated_min_days  INTEGER DEFAULT 2,
    estimated_max_days  INTEGER DEFAULT 5,
    pincode_range_start VARCHAR(10),
    pincode_range_end   VARCHAR(10),
    active              BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS delivery_pincodes (
    id                 BIGSERIAL PRIMARY KEY,
    pincode            VARCHAR(10) NOT NULL UNIQUE,
    state_id           BIGINT REFERENCES delivery_states(id),
    city               VARCHAR(120),
    delivery_charge    NUMERIC(10,2),
    estimated_min_days INTEGER,
    estimated_max_days INTEGER,
    active             BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_delivery_pincodes_state
    ON delivery_pincodes (state_id);
