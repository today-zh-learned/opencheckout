-- OpenCheckout Gateway DB Schema
-- 9 tables per TDD-01, ADR-001, ADR-013, ADR-014
-- Run via: pnpm --filter @opencheckout/gateway db:migrate

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Tenants ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  settings     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Idempotency Keys ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key          TEXT        NOT NULL,
  tenant_id    TEXT        NOT NULL REFERENCES tenants(id),
  status       TEXT        NOT NULL DEFAULT 'pending',  -- pending | completed
  response     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  PRIMARY KEY (key, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- ── Addresses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS addresses (
  id             TEXT        PRIMARY KEY,
  tenant_id      TEXT        NOT NULL REFERENCES tenants(id),
  user_id        TEXT,
  road_address   TEXT        NOT NULL,
  jibun_address  TEXT,
  zip_code       TEXT        NOT NULL,
  city           TEXT        NOT NULL,
  province       TEXT        NOT NULL,
  country_code   TEXT        NOT NULL DEFAULT 'KR',
  extra_info     TEXT,
  version        BIGINT      NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addresses_tenant ON addresses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(tenant_id, user_id);

-- ── Orders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               TEXT        PRIMARY KEY,
  tenant_id        TEXT        NOT NULL REFERENCES tenants(id),
  user_id          TEXT,
  status           TEXT        NOT NULL DEFAULT 'draft',
  shipping_address_id TEXT     REFERENCES addresses(id),
  currency         TEXT        NOT NULL DEFAULT 'KRW',
  subtotal_amount  BIGINT      NOT NULL DEFAULT 0,
  shipping_amount  BIGINT      NOT NULL DEFAULT 0,
  duty_amount      BIGINT      NOT NULL DEFAULT 0,
  total_amount     BIGINT      NOT NULL DEFAULT 0,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(tenant_id, status);

-- ── Payments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                   TEXT        PRIMARY KEY,
  tenant_id            TEXT        NOT NULL REFERENCES tenants(id),
  order_id             TEXT        NOT NULL REFERENCES orders(id),
  status               TEXT        NOT NULL DEFAULT 'authorized',
  amount               BIGINT      NOT NULL,
  currency             TEXT        NOT NULL DEFAULT 'KRW',
  provider             TEXT        NOT NULL DEFAULT 'toss',
  provider_payment_key TEXT        NOT NULL,
  raw_response_hash    TEXT,           -- HMAC-SHA256 of raw provider response (ADR-014)
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_key ON payments(provider_payment_key);

-- ── Shipments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id               TEXT        PRIMARY KEY,
  tenant_id        TEXT        NOT NULL REFERENCES tenants(id),
  order_id         TEXT        NOT NULL REFERENCES orders(id),
  carrier          TEXT        NOT NULL,
  tracking_number  TEXT,
  label_url        TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending',
  address_snapshot JSONB       NOT NULL,  -- ADR-013 §2: non-propagating after LABEL_PURCHASED
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);

-- ── Outbox ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outbox (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id      TEXT        NOT NULL,
  aggregate_type TEXT        NOT NULL,
  aggregate_id   TEXT        NOT NULL,
  event_type     TEXT        NOT NULL,
  payload        JSONB       NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending',  -- pending | dispatched | failed
  attempts       INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(status, created_at) WHERE status = 'pending';

-- ── Audit Log ─────────────────────────────────────────────────────────
-- Hash chain for tamper evidence (ADR-014 §2)
CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT        NOT NULL,
  actor_id      TEXT        NOT NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   TEXT        NOT NULL,
  diff          JSONB,
  prev_hash     TEXT,       -- hash of previous row for chain
  row_hash      TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, created_at DESC);

-- ── FX Rates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fx_rates (
  base_currency   TEXT        NOT NULL,
  quote_currency  TEXT        NOT NULL,
  rate            NUMERIC(18,8) NOT NULL,
  provider        TEXT        NOT NULL DEFAULT 'toss-fx',
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 hour',
  PRIMARY KEY (base_currency, quote_currency)
);

-- ── Cron Lease (FX leader election) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS cron_leases (
  job_name    TEXT        PRIMARY KEY,
  holder_id   TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
