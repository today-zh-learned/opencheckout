# ADR-006: Observability, SLO, Error Budget & Tamper-Evident Audit

- **Status**: Proposed
- **Date**: 2026-04-23
- **Last normalized**: 2026-04-24 (ADR-019)
- **aggregates_touched**: [Payment, Order, Shipment]
- **Deciders**: Platform/SRE, Payments Lead, Security Lead
- **Consulted**: Toss Payments integration, Ops Console lead, Compliance
- **Related**: PRD-v0 §4 D9 (OpenTelemetry + Sentry), §8 (event sourcing), §9 (Ops Console + RBAC + audit log), research/08-technical-review.md (차원 7, 8), ADR-019 (Cross-ADR Normalization)
- **Supersedes**: —

---

## Context

PRD-v0 picks **OpenTelemetry + Sentry Browser** (§4 D9) and asserts "all actions require audit log" (§9-3) and "event stream enables replay for debugging/audit" (§8-5), but leaves three gaps flagged by the adversarial review (`research/08-technical-review.md` 차원 7, 8):

1. **No SLI/SLO numbers.** Confirm success, widget render, webhook delivery, FX freshness, address autocomplete — all called out in the PRD but never quantified.
2. **No tamper-evident audit.** `events` + `outbox` (§8-3) is append-only at the app layer, but a compromised operator or rogue DB write can silently mutate or drop rows. Payment systems require detectable tampering.
3. **No correlation-ID propagation rule.** Browser → Edge (Workers) → Node (Toss confirm / webhook) is the critical path, and without a shared ID incidents become unreconstructable.

We also must honor the PRD's runtime boundary: Edge handles token issuance + public read, Node handles Toss confirm + webhook ingestion (§4 D9). Observability must span both without re-implementing plumbing per runtime.

---

## Decision

Adopt a single observability stack rooted in **OpenTelemetry** (traces, metrics, logs), driven by a small set of SLOs with an explicit error-budget policy, plus a **hash-chained audit log with periodic Merkle anchoring (OpenTimestamps)** for tamper evidence. Security events go to a **separate SIEM-forwarded bucket** to prevent blast-radius contamination of general telemetry.

### 1. SLIs and SLOs (binding numbers)

> **ADR-019 정규화 적용 (2026-04-24)**: v1 SLO는 보수적 하향 + **Toss 업스트림 귀속 carve-out** 명시 (ADR-019 §3.9). Post-GA 6개월 shadow 데이터 후 ratchet. "confirm path"는 **gateway-local** 기준 (Toss 라운드트립 제외).

SLOs are per-tenant (aggregated monthly) and per-fleet (aggregated weekly). Numbers chosen so that error budget = user-noticeable pain, not vendor-caused noise.

| # | SLI | v1 SLO (28-day window) | Post-GA target | Measurement surface | Carve-out |
|---|-----|---|---|---|---|
| 1 | Payment confirm success rate (gateway-local: Toss confirm 2xx + `payment.authorized` persisted) | **99.5%** | 99.9% | Node gateway; event store commit | 분모에서 Toss 5xx (업스트림 귀속) 제외 |
| 2 | Payment confirm latency p95 (gateway-local) | **≤ 500 ms** | 400 ms | Server-timing of `/v1/payments/confirm` | Toss 라운드트립 제외 |
| 3 | Payment confirm latency p99 | **< 2.0 s** | < 1.5 s | same | Toss slow path 태그만 |
| 4 | Widget first render p95 (TTI for iframe `ready` event) | **< 2.5 s** on 4G emulated | < 2.0 s | RUM (Sentry Browser) | — |
| 5 | Webhook delivery success within 24h (HMAC-signed, 2xx) | **99.5%** | 99.95% | outbox + delivery worker | 머천트 5xx는 태그만, SLO 분자에 포함 |
| 6 | FX quote freshness (cached KRW rate age) | **≤ 24h** 99.9% of reads | — | KV TTL probe | §5-9 pricing accuracy |
| 7 | Address autocomplete p95 | **< 500 ms** | — | Edge gateway | typeahead UX |
| 8 | Event store write durability (commit → outbox visible) | **99.99%** | 99.99% | PG txn + LISTEN/NOTIFY probe | projection integrity |

**Definitions**
- Denominators exclude: buyer-aborted flows, requests blocked by rate limits, 4xx caused by invalid input (except 429).
- Latency measured **server-side** for 1-3,6,7; **real user monitoring** for 4.
- Webhook "success" = HTTP 2xx from merchant endpoint within 24h, across all retries.

### 2. Error Budget Policy

Monthly budget = `(1 - SLO) * 28d`. Example: SLO #1 at 99.9% → **40m 19s** downtime budget / 28d.

| Burn rate (over 1h) | Monthly budget burnt | Action |
|---|---|---|
| < 1x | — | normal |
| 1x–2x | < 25% | page on-call, investigate, no release gate |
| 2x–6x | 25–50% | **release freeze on affected service** until cause identified |
| 6x–14.4x (fast burn) | > 50% | incident declared, all non-hotfix merges blocked |
| > 14.4x | catastrophic | kill-switch allowed, customer notification drafted |

- Budget exhaustion in a calendar month triggers **next-month release freeze** on the affected service (opt-out requires VP Eng sign-off).
- 3 consecutive months > 75% burn triggers mandatory architecture review.
- Sustained burn during Toss outage is counted but excluded from freeze decision (dependency carve-out logged).

### 3. Correlation-ID Propagation

Every request carries two IDs, propagated end-to-end:

- **`X-OC-Request-ID`** — ULID, generated **browser-side** at widget mount. Opaque. Logged verbatim at every hop. This is what CS quotes to buyers.
- **`traceparent`** — W3C Trace Context (version-format-traceId-parentId-flags). Generated by OTel SDK, links to the distributed trace.

**Propagation rules**
- Browser widget → Edge gateway: both headers on every fetch. If absent, Edge generates and **echoes back** in response headers.
- Edge → Node: both headers forwarded verbatim. Edge MUST NOT regenerate.
- Node → Toss (outbound): `traceparent` only (Toss ignores `X-OC-*`). Response's Toss `Idempotency-Key` + our request-id stored together.
- Webhook ingress (Toss → Node): new request-id generated, but `causationId` set to the original `payment.authorized` event ID (§8-1).
- Every log line, metric exemplar, Sentry event, and audit row includes both IDs.
- Browser surfaces `X-OC-Request-ID` on any unrecoverable error ("문제 ID: 01HX..."). Ops Console search indexes it.

### 4. OpenTelemetry Attributes & Sampling

**Resource attributes** (all spans): `service.name`, `service.version`, `deployment.environment`, `oc.tenant_id`, `oc.runtime` (`edge|node`), `oc.region`.

**Span attributes**
- HTTP: follow OTel semconv (`http.request.method`, `http.response.status_code`, `url.path` only — never `url.query`, never full URL).
- Payments: `oc.payment.psp` (`toss`), `oc.payment.flow` (`confirm|cancel|refund`), `oc.amount.currency`, `oc.amount.bucket` (log-scale bucket, never raw amount).
- Idempotency: `oc.idempotency_key` (hashed, first 12 chars of SHA-256).
- Order: `oc.order_id`, `oc.event_type`. Never `oc.buyer.*` unprocessed.

**Metrics** (RED + USE): `http.server.request.duration` histogram, `oc.payment.confirm.outcome` counter by `outcome` label, `oc.webhook.delivery.attempts` histogram, `oc.event.lag` (outbox → projection) gauge. All payment metrics carry `tenant_id` as low-cardinality hashed bucket (mod 256) for top-talker detection without cardinality explosion.

**Sampling**
- Prod default: **head-based 10%** via parent-based sampler.
- **Always sample**: spans with `error=true`, `http.response.status_code >= 500`, any payment flow span, any webhook span, any span containing `oc.risk_flag`.
- Tail sampling (Collector): keep 100% of traces where any span is error, or root p95 exceeded; drop 90% of sub-200ms healthy traces.
- Staging: 100%. Dev: 100% with PII redactor still active.

### 5. Redaction (OTel Collector Processor)

Applied in the **Collector**, not the SDK, so a misbehaving SDK cannot leak. Failure-mode: if processor errors, the Collector **drops** the span rather than forwarding raw.

Redaction matrix:

| Field pattern | Action |
|---|---|
| `*.card_number`, `*.pan`, `*.cvc`, `*.cvv` | **Drop attribute** (never hash — PCI) |
| `*.dob`, `*.birth*`, `*.ssn`, `*.tax_id`, `CPF/CNPJ/RFC/NIK/身份证` | Drop attribute |
| `*.phone`, `*.email` | Replace with `sha256(value + tenant_salt)` prefix-12 |
| `*.address.*` except `country_code`, `admin_area`, `postal_code` prefix-3 | Replace with hash bucket |
| `http.request.header.authorization`, `*.api_key`, `*.bearer` | Drop |
| `rawResponse` from PSP/carrier | **Not allowed in telemetry.** rawResponse lives only in encrypted object store with KMS DEK; spans carry a pointer `oc.raw_response.ref` = S3 key |
| `Idempotency-Key` | Hash prefix-12 |
| Stack traces / exception messages | Regex scrub for 16-digit PAN, E.164 phones, emails |

Processor config is versioned in `platform/observability/otel-collector/redact.yaml`. Any PR touching it requires Security review (CODEOWNERS).

### 6. Tamper-Evident Audit Log (hash chain + Merkle anchoring)

PRD §9-3 requires audit logs for all Ops actions. We make them **detection-capable** against malicious DB writes.

**SQL schema** (PostgreSQL, separate logical DB from event store):

```sql
CREATE TABLE audit_log (
  seq          BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id    UUID NOT NULL,
  actor        JSONB NOT NULL,          -- {role, user_id, session_id}
  action       TEXT NOT NULL,           -- e.g. "order.refund.partial"
  payload      JSONB NOT NULL,          -- diff or command
  request_id   TEXT NOT NULL,           -- X-OC-Request-ID (ULID)
  trace_id     TEXT,                    -- W3C traceparent trace-id
  prev_hash    BYTEA NOT NULL,          -- sha256 of previous row's hash
  hash         BYTEA NOT NULL           -- sha256(prev_hash || canonical_json(row))
);
CREATE INDEX ON audit_log (tenant_id, occurred_at);
CREATE UNIQUE INDEX ON audit_log (seq);
-- Revoke UPDATE/DELETE at role level:
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC, app_rw;
GRANT INSERT, SELECT ON audit_log TO app_rw;
```

**Canonicalization**: RFC 8785 JCS over `{seq, occurred_at, tenant_id, actor, action, payload, request_id, trace_id}`. Bytes hashed with SHA-256.

**Chain invariant**: `hash_n = SHA256(hash_{n-1} || JCS(row_n))`. `hash_0` is a published genesis constant per deployment.

**Merkle anchoring**
- Every **15 minutes**, a batch job computes a Merkle root over `hash` values in `[last_anchor.seq+1, now]`.
- Root is submitted to **OpenTimestamps** (free, Bitcoin-anchored) and also cross-posted to an internal WORM bucket and a public GitHub repo (`opencheckout/audit-anchors`, commit signed with platform GPG key).
- Anchor row stored in `audit_anchor(anchor_id, last_seq, merkle_root, ots_proof BYTEA, github_commit_sha, created_at)`.
- Verifier CLI `oc-audit verify --from ANCHOR_A --to ANCHOR_B` walks the chain and rebuilds the root from live rows; mismatch = tamper detected. Run in CI nightly.

**Retention**: 7 years (aligned with §5-6 address history and general financial records). After retention, rows are **crypto-shredded** by destroying tenant DEK; anchors remain to prove non-existence.

### 7. Security Event Bucket (SIEM-forward)

Separate from general telemetry and from `audit_log`. `security_events` table + Kafka topic `sec.events`, forwarded to SIEM (Elastic/Splunk/Wazuh — adapter).

Events captured:
- `auth.failure` (merchant API key / JWT / admin login) — rate, IP, user-agent hash
- `webhook.signature.invalid` (HMAC mismatch on inbound merchant webhooks or PSP webhook)
- `rbac.violation` (role lacking scope attempted action — PRD §9-3)
- `rls.violation` (Postgres RLS deny — ADR-005) — Postgres log parser
- `idempotency.replay.mismatch` (same key, different payload hash — ADR-002)
- `kms.decrypt.failure`
- `rate_limit.tripped` (sustained, not one-off)

These never go through the normal redaction pipeline; they carry minimal safe context and are the **source of alerting for compromise scenarios**. Retention 2 years hot, 7 years cold.

### 8. Alert Rules

Two tiers: **page** (on-call pager) vs **ticket** (Jira/Linear).

**Multi-window burn-rate (Google SRE canonical)**, per SLO:

| Condition | Tier |
|---|---|
| 1h burn > 14.4x **AND** 5m burn > 14.4x | page (fast burn) |
| 6h burn > 6x **AND** 30m burn > 6x | page (slow burn) |
| 24h burn > 3x **AND** 2h burn > 3x | ticket |
| 3d burn > 1x | ticket (trend) |

**Categorical pages** (bypass burn-rate):
- Any `security_events.*` with severity=high (RLS violation, repeated HMAC failure from single IP, KMS failure)
- Audit chain verify failure (nightly CI red)
- OpenTimestamps anchor miss > 2 consecutive windows
- Event store → projection lag > 5 min p95
- Webhook DLQ depth > 1000 or oldest message > 1h

**Ticket-only**: sampling anomaly, cardinality explosion, dashboard widget error rate.

Pages route via PagerDuty with tenant_id in payload; noise-control: dedup window 5 min, auto-resolve on recovery.

### 9. Dashboard Templates

Grafana JSON dashboards checked into `platform/observability/dashboards/`:
- `payment-slo.json` — SLOs 1-3 with burn-rate panels (inspired by Backstage SLO plugin layout).
- `widget-rum.json` — SLO 4 from Sentry Browser via OTel bridge.
- `webhook-delivery.json` — SLO 5, DLQ depth, retry histogram.
- `fx-address.json` — SLOs 6, 7.
- `event-pipeline.json` — SLO 8, outbox lag, projection lag per view.
- `audit-integrity.json` — chain length, last anchor age, verify status, forbidden-write attempts.
- `security-events.json` — RLS/HMAC/RBAC violations over time, top tenants.

Honeycomb users get equivalent boards via the same OTLP feed (exporter swap only, per PRD §4 D9).

---

## Consequences

**Positive**
- Numbers for SLOs end §4 D9's ambiguity; error-budget policy gives product a non-arbitrary release gate.
- Hash-chain + OpenTimestamps gives detectable tampering without notarization fees; survives full DB compromise.
- Separate security bucket prevents SIEM from drowning in happy-path spans.
- Correlation-ID rule fixes §8's "events have correlationId" gap at the HTTP layer where incidents actually surface.
- Redaction at Collector (not SDK) is fail-closed — PCI leak path blocked even if a dev mis-instruments.

**Negative**
- Audit Merkle + OTS adds a batch job + external dependency (OpenTimestamps availability). Mitigation: anchor submission is idempotent; missing submissions queued and retried; nightly verify detects gaps.
- Hashing phones/emails in telemetry prevents some ad-hoc queries — Ops Console must resolve request-id → buyer via the privileged path, not via trace search.
- Per-tenant cardinality cap (mod-256 bucket) loses precision for outlier-tenant detection; compensating control = nightly OLAP over raw audit log.
- OTel Collector becomes a single point of silence if misconfigured — mitigated by CI e2e test that emits a known span and asserts redaction + export shape.

**Trade-offs vs alternatives rejected**
- **AWS QLDB / managed immutable ledger**: vendor lock-in, violates PRD "self-host first" (§4 D9). OpenTimestamps + WORM + GitHub anchor = three independent witnesses, free.
- **Datadog-only stack**: rejected per PRD (exporter-swap principle).
- **Trace-only (no Merkle)**: doesn't detect DB-level tampering — insufficient for payments audit.

---

## Checklist (implementation)

- [ ] Define SLOs in `platform/observability/slo/*.yaml` (Pyrra or Sloth format)
- [ ] Ship OTel SDK wrappers for Hono (edge + node) with request-id extractor
- [ ] OTel Collector redact processor config + CI e2e test
- [ ] `audit_log` schema migration + role grants + JCS canonicalizer
- [ ] Merkle anchor cron + OpenTimestamps submitter + GitHub anchor repo
- [ ] `oc-audit verify` CLI + nightly CI job
- [ ] `security_events` table + SIEM forwarder adapter (Elastic default)
- [ ] Grafana dashboards committed + provisioning
- [ ] Burn-rate alerts in Prometheus/Grafana Alerting
- [ ] Runbook: error-budget policy, freeze procedure, chain-break triage
- [ ] Ops Console: request-id search, audit-log viewer with chain-verify badge
- [ ] Load test: Collector redaction throughput at 5× prod peak

---

## Open Questions

1. **OTS anchor cadence**: 15 min vs 1 h — trade-off between detection lag and Bitcoin tx fees (OTS aggregates, but latency varies). Start at 15 min, revisit post-launch.
2. **Tenant-level SLOs**: do enterprise merchants get per-tenant SLOs in contracts, or only fleet-wide? Blocks ADR on contract terms.
3. **Audit log encryption at rest**: payload may contain PII diffs. Encrypt payload column with tenant DEK, or rely on DB-level encryption + RLS? Leaning tenant DEK for crypto-shred compatibility.
4. **RUM vendor**: Sentry Browser (PRD default) vs OTel-native browser SDK — the latter is still 0.x; revisit Q3.
5. **Webhook SLO denominator**: should we exclude merchants with persistently 5xx endpoints (self-inflicted), or include and let them see their own reliability reflected? Favoring "include with tag".

---

*References: Google SRE Book chs. 3-4 (SLIs/SLOs, error budgets, burn-rate alerts); Backstage SLO plugin dashboard conventions; Honeycomb tail-based sampling patterns; RFC 8785 (JCS); OpenTimestamps spec; W3C Trace Context.*
