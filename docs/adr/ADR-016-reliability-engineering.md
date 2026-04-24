# ADR-016: Reliability Engineering — Resilience, Degradation, Flags, Chaos

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-04-23 |
| **Deciders** | Platform/SRE, Payments Lead, Logistics Lead, Product |
| **Consulted** | Google SRE Book Ch.22 (Cascading Failures), *Release It!* 2e (Nygard), Netflix Hystrix postmortems, AWS Well-Architected Reliability Pillar, OpenFeature spec, DORA metrics |
| **Related** | PRD-v0 §6 (고위험 플로우), §14 (Phase plan), ADR-002 (Idempotency/Saga), ADR-005 (Multi-tenancy), ADR-006 (SLO/Error budget), ADR-007 (DR/IR), ADR-012 (High-risk races), ADR-013 (Concurrency) |
| **Supersedes** | — |

---

## Context

ADR-006 locks SLOs and burn-rate alerts; ADR-007 contracts DR/IR and RTO/RPO; ADR-012 catalogs seven race-condition flows and saga rules; ADR-013 codifies locking vocabulary. What is still missing for v1 release: the **runtime resilience plane** that sits between "a request arrives" and "a dependency breaks." PRD §6 names Toss, Juso, Google Places, 수출입은행 FX, carriers, outbound PG webhooks as external hops — each with independent availability, independent latency distribution, independent blast radius. Without a shared vocabulary (timeouts, retries, breakers, bulkheads, load shedding, feature flags, progressive delivery, chaos), each service invents its own and the system degrades **inconsistently** under stress.

This ADR contracts **seventeen** reliability mechanisms that apply across every runtime (Edge Workers and Node gateway), every tenant, and every dependency class. Numbers are chosen so that: (a) Timeout Budget stays under the 15-second user cap, (b) Retry Budget stays below 10% of requests (Google SRE canonical), (c) Circuit breaker state transitions are observable in `cb_state{dep,tenant}` and feed back into ADR-006 burn-rate alerts.

---

## Decision

### 1. Resilience Patterns Matrix (per dependency)

| Dependency | Timeout (connect / read) | Retry (budget, backoff) | Circuit Breaker (threshold, half-open) | Fallback |
|---|---|---|---|---|
| Toss `confirm` | 5s / 30s | 3 attempts, exp `1s–2s–4s` + full jitter | 5 fail / 30s → OPEN 60s → HALF_OPEN 1 probe | Reconcile polling (ADR-012 Scen 5) |
| Toss `cancel` | 5s / 15s | 3 attempts, same | same | Saga dead letter (ADR-002) |
| Juso 주소 | 3s / 5s | 2 attempts | 10 fail / 60s | Kakao Local → client lib → human review |
| Google Places | 2s / 5s | 1 attempt | 10 fail / 60s | HERE fallback |
| 수출입은행 FX | 3s / 10s | 2 attempts | 3 fail / 60s | Stale cache (24h) → then **fail-closed** |
| Carrier rate API (DHL/FedEx) | 3s / 10s | 2 attempts | 5 fail / 60s | Table-based quote |
| PG webhook (outbound to merchant) | 2s / 15s | 8 attempts, exp `1s → ∞` until 72h wall | n/a (queue-backed) | Dead-letter queue, merchant notify |

Timeouts are **connect** + **read** split so that a slow-to-accept peer fails fast (connect) while a slow-to-respond peer gets the operation-specific read budget. Retries always use **full jitter** (`delay = random(0, cap)` per Amazon Builders' Library), never deterministic exponential.

### 2. Circuit Breaker Implementation

Use `resilience4j-ts` (mature, open-source port of Resilience4j) behind an internal wrapper `@opencheckout/breakers`. Reasons: uniform metric shape, per-tenant isolation, API stable across runtimes.

**State machine**: `CLOSED → OPEN → HALF_OPEN → CLOSED`. OPEN rejects calls immediately with `CircuitOpenError` (no sleep). HALF_OPEN admits **one** probe; success closes, failure re-opens with a doubled cooldown up to 10 min ceiling.

**Isolation granularity**: **per-tenant × per-dependency**. A tenant hammering Juso must not open Juso's breaker for other tenants; a global Toss outage must open the breaker for all tenants simultaneously (group-wide).

**Metrics**: `cb_state{dep, tenant}` (gauge 0/1/2 for CLOSED/OPEN/HALF_OPEN), `cb_transitions_total{dep, tenant, from, to}`, `cb_rejected_total{dep, tenant}`. Exported via Prometheus, alerted per ADR-006 categorical-page rules.

### 3. Bulkhead (Resource Isolation)

Resource contention is the most common path to cascading failure (Nygard). We segregate at three layers:

- **Per-dependency connection pool**: Toss = 20, Juso = 50, Google Places = 30, 수출입은행 = 5, Carriers = 20. Pool exhaustion returns `BulkheadFullError` → fallback path.
- **Per-tenant semaphore**: 50 concurrent in-flight requests per tenant (matches p95 observed load × 3 headroom). Excess → 429 `Retry-After: 1`.
- **Per-endpoint priority queue**: `confirm = high`, `address lookup = medium`, `bulk refund = low`. Low drains only when high queue empty.
- **Thread-pool separation**: Node `worker_threads` for CPU-heavy work (Korean romanization, PDF label generation, PGP webhook signing). I/O-bound work stays on the main event loop.

### 4. Timeout Budget (call-chain cumulative)

Hard cap per user-facing request: **15s**. Each hop subtracts from a shared budget propagated via `X-OC-Budget-Remaining-MS` header.

Example chain (happy path):
```
Browser (2000ms client SLA)
  → Gateway auth (100ms)
  → Toss confirm (5000ms)
  → DB write (200ms)
  → webhook enqueue (50ms)
Total = 7350ms; 7650ms headroom
```

OTel span attribute `oc.budget.remaining_ms` updated at each hop. When remaining < 100ms, a gateway middleware **skips non-critical steps** (analytics emit, optional address enrichment, nice-to-have RUM beacon). Critical steps (Toss confirm, DB commit, outbox) never skip — instead they return 504 to the caller so the client sees truth rather than a silent truncation.

### 5. Retry Storms Prevention

- **Retry budget** (Google SRE, *SRE Workbook* Ch.22): sliding window where `retries / total_requests < 10%`. Measured per-dependency. Budget exhausted → retries disabled until window refills.
- **Token bucket**: each dependency has a bucket of `retry_tokens = requests × 0.1`; each retry consumes one token; bucket refills with cooldown.
- **Jittered exponential backoff**: always full jitter. Synchronised retries after an outage recovery are the #1 cause of secondary outages.
- **Retry-After honoring**: if upstream returns `Retry-After` (HTTP 429/503), the breaker respects it verbatim — no override by local policy.

### 6. Load Shedding

When p99 latency exceeds its SLO **and** node CPU > 85%, gateway enters **shed mode**:
- Reject **low-priority** requests (batch refunds, analytics replays, admin reports) with 503 + `Retry-After: 30`.
- Keep confirm, webhook ingress, refund, address canonicalize.
- Client priority declared via `X-Priority: high|normal|low` header, verified against tenant's contract (low is opt-in for cost savings).
- Graceful degradation menu: address autocomplete → manual input; rate quote → table-based; duty quote → cached band (±5% per ADR-012 Scen 4).

### 7. Rate Limiting (Defense-in-Depth, Multi-Layer)

Independent layers so a bypass at one layer is caught at the next:

- **Edge** — Cloudflare WAF IP-based anomaly detection (DDoS, bot patterns).
- **Gateway** — per-tenant quota (ADR-005), per-endpoint cap (`POST /v1/payments/confirm` = 100 req/min/tenant, `GET /v1/addresses/search` = 600 req/min/tenant).
- **Deep** — DB connection pool cap (PgBouncer per-db `pool_size`, ADR-013 §9). A runaway tenant hits pool exhaustion long before the DB itself is threatened.

Each layer emits `rate_limit_tripped{layer, tenant}` into the SIEM bucket (ADR-006 §7) for compromise detection.

### 8. Graceful Degradation Matrix

| Dependency down | System behavior |
|---|---|
| FX API | **fail-closed** — payment block with "환율 조회 불가" message; no guessed rate |
| Juso + Kakao + Google Places | manual address entry + warning banner; canonicalize async on recovery |
| Outbound webhook target (merchant) | queue accumulates, merchant dashboard shows "지연 중 N건"; no retries after 72h → DLQ |
| Ops Console backend | read-only mode — existing sessions retain view; no mutations |
| Admin login (IdP) | existing successful session retains read-only access for up to **1h**; new logins blocked |
| Toss | confirm blocked, status page auto-updates, merchants notified via SDK `status` endpoint |
| KMS | per ADR-007 §5 — halt encrypt, allow decrypt via cached DEK short-TTL |

Fail-closed is the default for anything touching money. Fail-open is allowed **only** for Redis JTI/nonce cache (logged + alerted), because blocking logins during a Redis blip is worse than the short-window replay risk.

### 9. Feature Flags

- **Standard**: OpenFeature spec (`@openfeature/server-sdk`, vendor-neutral). Primary backend: **flagd** (self-hostable, OSS). Adapter for LaunchDarkly retained for enterprise merchants who mandate a SaaS.
- **Flag types**:
  - *Release* — gradual rollout of new code paths (`payments.v2_confirm.enabled`).
  - *Ops* — kill switches (`payments.jpy.enabled`, `duties.ddp.auto`, `widget.webauthn`).
  - *Experiment* — A/B tests with analytics binding.
  - *Permission* — tenant-scoped capability gates (`feature.self_serve_refund`).
- **Lifecycle**: every flag has `createdAt` + `owner` + `expiresAt`. After 6 months, CI build emits a warning; at 9 months it blocks PRs until the flag is removed or explicitly promoted to permanent configuration.
- Flag evaluation is **side-effect-free** and cache-friendly (5s TTL local, SSE stream from flagd for kill-switch propagation < 500ms).

### 10. Progressive Delivery

- **Canary**: 1% → 5% → 25% → 100%. Each stage: minimum **30 minutes** + SLO verification (no burn-rate alert firing per ADR-006 §8).
- **Blue-green**: Kubernetes rolling deploy with HPA + PodDisruptionBudget. For edge (Cloudflare Workers), versioned rollout via `wrangler` gradual deployments.
- **Automated rollback**: if 1h-burn rate crosses 14.4× during canary, CI triggers `kubectl rollout undo` (or Worker version pin back) within 60s.
- **Dark launch**: feature-flag-gated code paths ship disabled. Code-deploy and feature-activate are separated by at least one release cycle, so rollback of a bad flag is a config flip, not a deploy.

### 11. Chaos Engineering (Scheduled)

Builds on ADR-007 §9 quarterly Game Days; adds a higher-cadence **staging** cycle:

- **Weekly automated chaos (staging)**: random pod kill (1 per hour during business), 200ms network delay injected into one dependency per day, 5% packet loss between gateway and DB for 10-minute windows, random DB connection kill.
- **Monthly**: region failover drill (Seoul → Tokyo), validated against ADR-007 RTO/RPO targets.
- **Quarterly**: the four Game Day faults from ADR-007 §9 (DB primary kill, Toss 503 injection, KMS 503, full region failover).
- Tooling: `chaos-mesh` (K8s CRDs) + `toxiproxy` (network-layer). Every fault is logged in `chaos_events` table with `before_slo` / `after_slo` snapshots for postmortem.

### 12. Backpressure

- **Webhook enqueue**: when queue depth > 10 × steady-state p95 or oldest message > 5 min, gateway returns **429** to the producer (Toss → OpenCheckout: logs + alerts since Toss will re-send; merchant → OpenCheckout: client SDK applies backoff).
- **Outbox poller**: dynamic batch size, starts at 100, scales between 50–500 based on `projection_lag_seconds`. When lag > 60s, batch grows; when lag < 5s, batch shrinks to reduce lock pressure (ADR-013 §11).
- **Redis pub/sub slow-consumer detection**: if a subscriber falls > 1000 messages behind, the publisher disconnects it (so the broker's buffer does not bloat) and the consumer reconnects with a replay cursor.

### 13. Health Endpoints

- `GET /healthz` — liveness, returns 200 with `{"status":"ok","version":"..."}` and no dependency checks. Used by K8s liveness probe.
- `GET /readyz` — readiness, checks DB connectivity, KMS reachable, Redis reachable. Returns 200 only if all green.
- `GET /dependenciesz` — diagnostic aggregate (internal only, RBAC-gated): status of Toss, Juso, 수출입은행, carriers, flagd, each with circuit breaker state + last success timestamp. Exposed on status page in aggregated form.
- K8s probe tuning: `livenessProbe` initialDelay=30s, failureThreshold=3, period=10s. `readinessProbe` initialDelay=5s, failureThreshold=2, period=5s. Tight enough to pull unhealthy pods, loose enough to survive a GC pause.

### 14. Dependency Downgrade Playbook

Runbook pointers (full text in `docs/runbooks/`):

- **Toss down** → payment block + status page post + merchant SDK status broadcast (links to `rb-toss-outage.md`, ADR-007 §8-2).
- **Postgres primary down** → ADR-007 §8-1 (`rb-db-failure.md`): promote standby, DNS flip, outbox resume. Gateway enters read-only 30s → 30min depending on failover path.
- **Redis down** → JTI/nonce cache fail-open **logged + alerted**; rate limiting falls back to per-pod in-memory counters (coarse, acceptable for short windows).
- **KMS down** → ADR-007 §8-3.
- **flagd down** → SDK serves last-known-good flag values from local cache (30 min stale allowed); ops flags treated as their last known state.

### 15. Capacity Planning

- **Annual demand forecast**: seasonal peaks — Korean Black Friday (11월), 발렌타인/화이트데이 (2월/3월), 연말 (12월). Provision **3× baseline headroom** at peak forecast.
- **HPA**: scale on CPU > 70% or p95 latency > 400ms, whichever fires first. Min replicas = 3 (one per AZ), max = 40. `scaleDown.stabilizationWindow` = 10 min (avoid flapping).
- **DB connection formula**: `connections = sum(pod_count × pool_size_per_pod) < max_connections × 0.8`. PgBouncer as session multiplexer keeps the figure sane. Alerts fire at 60%, page at 75%.
- **Load test cadence**: before each seasonal peak, run `k6` scenario replaying 2× forecast peak for 1 hour against staging-with-prod-DR-copy.

### 16. Reliability Metrics (DORA + classic)

| Metric | Target | Source |
|---|---|---|
| MTBF (mean time between failures) | > 90 days per Sev-1 | ADR-007 incident ledger |
| MTTR (mean time to recovery) | < 30 min per Sev-1/2 | PagerDuty time-to-ack + time-to-resolve |
| Error budget (99.9% confirm SLO) | 43.2 min / month | ADR-006 burn-rate |
| Deploy frequency | daily (at least 1 prod deploy/weekday) | CI/CD pipeline |
| Change failure rate | < 15% | deploys requiring rollback / total deploys |
| Lead time for changes | < 1 hour (commit → prod) | CI pipeline duration |

Metrics exported monthly to the engineering scorecard; sustained regression triggers architecture review (same rule as ADR-006 §2: 3 consecutive months > 75% budget burn).

### 17. Operational Wiring

- Breakers, bulkheads, retries, timeouts are all configured via a single `resilience.config.ts` per dependency — no per-call-site overrides (lint rule).
- OTel spans carry `oc.resilience.*` attributes: `timeout_ms`, `retry_attempt`, `cb_state`, `bulkhead_used`, `budget_remaining_ms`. These feed the Grafana `reliability-overview.json` dashboard.
- Every new external dependency requires a PR that fills in a row of the §1 matrix. Lint rule blocks merges that introduce an outbound HTTP call without a matching config entry.

---

## Consequences

**Positive**
- One resilience vocabulary across Edge + Node; prevents per-service invention of ad-hoc timeouts and retries that caused the largest Netflix/Amazon postmortems.
- Per-tenant × per-dependency breaker isolation makes the common case of "one noisy tenant" observable and containable without blast radius.
- Retry budgets prevent synchronized retry storms after dependency recovery — historically the second outage that follows the first.
- Feature-flag lifecycle rule prevents the known anti-pattern of flag proliferation and dead code.
- Progressive delivery + automated rollback closes the loop between ADR-006 SLOs and operational actuation.

**Negative**
- `@opencheckout/breakers` is a wrapper library — team owns maintenance; a bug in the wrapper is a fleet bug. Mitigation: extensive unit tests + chaos validation in staging.
- Timeout Budget header adds per-hop overhead (small; sub-millisecond serialization). Worth the observability.
- Full chaos cadence consumes ~4 SRE-days/month. Budgeted.
- Bulkhead pool sizing is a guess until prod data; likely 1–2 tuning passes in first quarter.

**Trade-offs vs alternatives rejected**
- **Istio/Envoy for retries + breakers at mesh level**: would bypass per-tenant logic (hard to encode tenant_id in L7 policy without heavy config). Library-level chosen for tenant isolation fidelity.
- **LaunchDarkly as primary flag backend**: SaaS, cost + latency + vendor dependency. flagd primary with LD adapter preserves choice per tenant.
- **No circuit breakers, only timeouts**: proven inadequate — timeouts alone do not prevent resource exhaustion when a dependency is slow-but-alive. Breakers convert slow failure into fast failure.

---

## Checklist (release gate)

- [ ] `@opencheckout/breakers` published with per-tenant × per-dep state
- [ ] Resilience matrix §1 seeded for all 7 dependencies; lint rule blocks new outbound calls without a row
- [ ] Bulkhead pools provisioned with values from §3; alarms on `bulkhead_full_total`
- [ ] Timeout Budget header implemented at gateway + propagated in OTel attributes
- [ ] Retry-budget token bucket live with `retry_budget_exhausted_total` metric
- [ ] Load-shedding path verified against `X-Priority` contract in integration tests
- [ ] flagd deployed, `payments.jpy.enabled` and `duties.ddp.auto` kill switches registered
- [ ] Canary pipeline with SLO gate + automated rollback validated in staging
- [ ] chaos-mesh + toxiproxy weekly jobs running in staging; `chaos_events` populated
- [ ] Health endpoints (`/healthz`, `/readyz`, `/dependenciesz`) live + K8s probes tuned
- [ ] `reliability-overview.json` Grafana dashboard committed and provisioned
- [ ] DORA metrics pipeline (deploy frequency, change failure rate) instrumented
- [ ] HPA policies + PDB deployed; min-replica-per-AZ invariant verified
- [ ] Runbooks linked from `rb-toss-outage.md`, `rb-db-failure.md`, `rb-kms-failure.md` (ADR-007) cross-referenced here
- [ ] Load test at 2× forecast peak executed pre-season (blackfriday, 발렌타인, 연말)
- [ ] Retry-After header honoring verified end-to-end (Toss → gateway → SDK)
- [ ] Tenant noisy-neighbor scenario (one tenant at 10× normal) tested without cross-tenant breaker contamination

---

## Open Questions

1. **Per-tenant breaker memory footprint**: per-tenant × per-dep state is O(tenants × deps). At 10k tenants × 7 deps = 70k objects in RAM per pod. Acceptable now; revisit when we hit 100k tenants (sharded breaker registry).
2. **LaunchDarkly adapter maintenance**: flagd evolves faster than the LD adapter. Who owns the parity? Platform team for now; offer contracted enterprise tier if merchants require formal LD SLA.
3. **Retry budget window length**: 60s rolling chosen from Google SRE example — our traffic shape may prefer 5min sliding (smoother but slower-reacting). Calibrate from first month's production data.
4. **Browser-emitted priority header**: allowing clients to declare `X-Priority: high` is abuse-prone. Current plan: client SDK signs the value with a short-lived ticket from the merchant's server. Needs ADR-009 revision.
5. **Chaos in production**: staging-only weekly plus quarterly prod Game Day. Should we run **continuous low-amplitude** prod chaos (Netflix Chaos Monkey style)? Hold until year 2; prod blast radius risk not worth it pre-GA.
6. **flagd HA topology**: single-region flagd creates a regional coupling. Multi-region flagd with CRDT-like replication or simply per-region independent instances reading from Git? Lean toward Git-backed config as source of truth.
7. **Budget header trust boundary**: internal service trusts `X-OC-Budget-Remaining-MS` from the gateway; malicious injection at internal boundary could cause starvation. Gateway strips + re-computes at ingress — confirm lint rule.

---

*References*: Google SRE Book Ch. 22 (Addressing Cascading Failures) and Workbook Ch. 9 (Incident Response); Michael Nygard, *Release It!* 2nd ed., ch. on Stability Patterns; Resilience4j documentation; OpenFeature spec v0.7; Amazon Builders' Library — *Timeouts, Retries, and Backoff with Jitter*; DORA *State of DevOps* 2024; AWS Well-Architected Reliability Pillar (REL-09, REL-10, REL-11).
