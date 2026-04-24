# TDD-02 — Event Sourcing & Projection Rebuild Playbook

| Field | Value |
|---|---|
| Status | Draft |
| Author | Platform / Data team |
| Related | PRD §8, Review dim. 8 (🟡 "Event schema evolution·projection rebuild 절차 없음"), ADR-001 (Hexagonal), TDD-01 (Gateway) |
| References | Greg Young, *Event Sourcing*; Martin Fowler, *CQRS*; Confluent Schema Registry |

PRD §8 defines a role-based CQRS system (Buyer/Merchant/Ops/Logistics/Finance/Compliance views) fed by an append-only event log. The reviewer flagged the missing half: **how the log evolves** and **how projections are rebuilt**. This TDD fills that gap.

---

## 1. Event Store Schema

Single writer path: Postgres is the system of record. Kafka/Redis Streams/SQS are **fan-out** adapters (see §11), not the log itself.

```sql
CREATE TABLE events (
  seq            BIGSERIAL   PRIMARY KEY,
  event_id       UUID        NOT NULL UNIQUE,
  event_type     TEXT        NOT NULL,
  event_version  INT         NOT NULL,
  aggregate_type TEXT        NOT NULL,
  aggregate_id   UUID        NOT NULL,
  tenant_id      UUID        NOT NULL,
  payload        JSONB       NOT NULL,
  metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    TIMESTAMPTZ NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  correlation_id UUID        NOT NULL,
  causation_id   UUID
);

CREATE INDEX events_aggregate ON events(aggregate_type, aggregate_id, seq);
CREATE INDEX events_tenant_seq ON events(tenant_id, seq);
CREATE INDEX events_type_seq   ON events(event_type, seq);
```

Invariants:
- `seq` is the **global monotonic cursor** — subscribers checkpoint on `seq`, never on `recorded_at`.
- `event_id` is the dedup key for at-least-once producers (outbox, replay).
- `(aggregate_type, aggregate_id, seq)` serves per-aggregate replay and snapshot bounds.
- Append-only: `DELETE`/`UPDATE` denied via role grants; retention uses partition drop (§12).
- Tenant column is **physical** — RLS policy `tenant_id = current_setting('oc.tenant')::uuid` applies in every read path.

---

## 2. Event Schema Evolution

Every event type has a versioned JSON Schema checked into the repo:

```
schemas/events/
  order.created/v1.schema.json
  order.created/v2.schema.json
  payment.authorized/v1.schema.json
  ...
```

### 2.1 Compatibility rules

- **Minor (additive)** — new optional field → bump is not required, but producers may emit the same `event_version` with extra fields. Consumers MUST ignore unknown fields.
- **Major (breaking)** — rename / type change / required-field add → new version file, new upcaster, new `event_version`.

### 2.2 Upcaster pattern

Upcasters are pure functions `(oldPayload) => newPayload` registered per `(event_type, from_version → to_version)`:

```ts
// packages/eventing/src/upcasters/order.created.ts
registerUpcaster('order.created', 1, 2, (p: V1) => ({
  ...p,
  currency: p.currency ?? 'KRW',         // new required field in v2
  buyerId:  p.userId,                    // rename
  userId:   undefined,
}));
```

Loader composes a chain `v1 → v2 → v3 → preferred_version` so consumers always receive the version they declared.

### 2.3 Subscriber contract

```ts
bus.subscribe({
  eventType: 'order.created',
  preferredVersion: 2,              // upcast anything older
  maxVersion: 2,                    // refuse anything newer → stop, alert
  handler: async (evt) => { ... },
});
```

If `evt.event_version > maxVersion` the consumer **stops the partition** (fail-closed). Forward compatibility is never assumed.

### 2.4 Registry CI check

CI gate `schema-compat`:
1. For every modified `*.schema.json`, diff against `main`.
2. Reject breaking changes on an existing version.
3. Require a matching upcaster for any new major version.

---

## 3. Projection Registry

All projections are declared in a central registry so rebuild/observability tooling is uniform.

| Projection | Store | Populates PRD §8-2 view | Rebuild hot? |
|---|---|---|---|
| `BuyerOrderView` | Postgres (denormalized doc) | Buyer | Yes |
| `MerchantOrderView` | Postgres | Merchant | Yes |
| `OpsOrderView` | Postgres (normalized) | Ops | Yes |
| `LogisticsOrderView` | Postgres | Logistics | Yes |
| `FinanceOrderView` | Postgres → warehouse CDC | Finance | Nightly |
| `ComplianceOrderView` | Postgres (append-only mirror) | Compliance | Yearly |
| `SearchIndex` | OpenSearch | Ops/Merchant search | Yes |

### 3.1 Checkpoint table

```sql
CREATE TABLE projection_checkpoints (
  projection_name TEXT        PRIMARY KEY,
  last_seq        BIGINT      NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT        NOT NULL CHECK (status IN ('running','paused','rebuilding','failed')),
  error           TEXT
);
```

Each projection holds `last_seq`. The pumper SELECTs `WHERE seq > last_seq ORDER BY seq LIMIT N`, applies events in a single tx with the projection write, and advances `last_seq` atomically.

---

## 4. Projection Handler — `BuyerOrderView`

```ts
// packages/projections/src/buyer-order-view.ts
import type { Projection, EventEnvelope } from '@opencheckout/eventing';

export const buyerOrderView: Projection = {
  name: 'buyer_order_view',
  preferredVersions: { 'order.created': 2, 'payment.authorized': 1 },

  async handle(evt: EventEnvelope, tx) {
    // Idempotency: dedup table, see §10
    const fresh = await tx.insertIfNew('projection_dedup', {
      projection_name: this.name,
      event_id: evt.eventId,
    });
    if (!fresh) return;

    switch (evt.eventType) {
      case 'order.created':
        await tx.upsert('buyer_order_view', {
          order_id: evt.aggregateId,
          tenant_id: evt.tenantId,
          status: 'created',
          created_at: evt.occurredAt,
          total: evt.payload.total,
          currency: evt.payload.currency,
        });
        break;

      case 'payment.authorized':
        await tx.update('buyer_order_view',
          { order_id: evt.aggregateId },
          { status: 'paid', paid_at: evt.occurredAt });
        break;

      case 'shipment.delivered':
        await tx.update('buyer_order_view',
          { order_id: evt.aggregateId },
          { status: 'delivered', delivered_at: evt.occurredAt });
        break;
    }
  },
};
```

Handlers are pure functions of `(event, tx)` — no external calls — so they replay deterministically.

---

## 5. Lag Monitoring

Every pumper emits three metrics, labelled by `projection`:

- `projection_last_seq` — gauge, current checkpoint.
- `projection_lag_events` — `primary.max(seq) − projection.last_seq`.
- `projection_lag_seconds` — `now() − events.occurred_at WHERE seq = last_seq`.

Alerts (Review dim. 7 ties in):
- **warn** `projection_lag_seconds > 10s` for 2 min
- **page** `projection_lag_seconds > 30s` for 2 min
- **page** `status = 'failed'` immediate

Dashboard shows `primary seq` and each projection's `last_seq` on the same time axis — visual lag.

---

## 6. Rebuild Procedures

### 6.1 Full rebuild (schema change, corruption, new projection)

```
1. projection_checkpoints.status = 'rebuilding'
2. TRUNCATE projection tables (inside same tx as checkpoint reset)
3. UPDATE projection_checkpoints SET last_seq = 0
4. Start pumper with larger batch (N=5_000), 4 worker shards hashed on aggregate_id
5. Monitor projection_lag_events; when 0, flip status='running'
6. Readers continue to see stale-but-consistent data (see Shadow, §6.3)
```

### 6.2 Partial rebuild (single aggregate / tenant / time window)

```
1. projection_checkpoints.status = 'paused'
2. DELETE FROM <view> WHERE aggregate_id = :id
   DELETE FROM projection_dedup WHERE event_id IN (
     SELECT event_id FROM events WHERE aggregate_id = :id)
3. Replay: SELECT * FROM events WHERE aggregate_id = :id ORDER BY seq
4. Apply handler.handle(evt) per event
5. Resume pumper (status='running'); it simply skips dedup rows already seen
```

No global checkpoint rewind — only the affected rows are rewritten.

### 6.3 Shadow rebuild (zero-downtime schema change)

```
1. Create buyer_order_view__v2 with new schema
2. Spawn shadow pumper writing only to __v2 from seq=0
3. When shadow lag = 0, run consistency check:
   SELECT COUNT(*) FROM view WHERE row_hash <> shadow.row_hash  -- must be 0
4. Flip reader DSN / view name in a single migration (rename-in-tx)
5. Keep old table for 7 days, then drop
```

### 6.4 Time budget

```
rebuild_minutes ≈ total_events / (throughput_per_second * 60)
```

With a single pumper at ~3k events/s on warm Postgres, **10M events ≈ 55 min**. At 4 shards partitioned by `aggregate_id` hash, ~15 min. Plan based on `SELECT max(seq) FROM events` at rebuild time, publish ETA on the ops dashboard.

---

## 7. Breaking Event-Type Migration

When a type must change shape beyond what an upcaster can handle (e.g. `payment.authorized` → `payment.authorized.v2` with split amount/fx fields):

1. Introduce new type `payment.authorized.v2` at the producer with both emitted for one release.
2. Run a **historical clone**: `INSERT INTO events (...) SELECT ... derived ... FROM events WHERE event_type = 'payment.authorized'` — new rows get fresh `event_id`, `causation_id = old.event_id`, `metadata.migrated_from = old.event_id`.
3. Rebuild all projections that read the type (§6.1).
4. Stop producing the old type; keep the old type's upcaster for **at least 90 days** to support out-of-order consumers and cold-store replays.

Cloning is **additive** — the original events are never deleted (Greg Young: "the log is the truth").

---

## 8. Snapshots

For aggregates exceeding **100 events**, the aggregate loader takes a snapshot every **50 events**:

```sql
CREATE TABLE snapshots (
  aggregate_type TEXT NOT NULL,
  aggregate_id   UUID NOT NULL,
  seq            BIGINT NOT NULL,
  state          JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (aggregate_type, aggregate_id, seq)
);
```

Loader: `load(id)` = latest snapshot + events with `seq > snapshot.seq`. Snapshots are a **cache, not a source of truth** — they can be dropped and regenerated. Schema-change protocol: drop snapshots before bumping aggregate version.

---

## 9. Replay for Debug — `oc-replay`

```
oc-replay \
  --order 018f2c...           # aggregate_id (or --tenant, --correlation)
  --from 2026-04-20T00:00Z    # optional time filter
  --until 2026-04-21T00:00Z
  --project BuyerOrderView    # simulate projection into temp schema
  --dry-run                   # do not write; print diff vs live
  --format table|json|ndjson
```

Behaviour:
- Reads from event store with RLS bound to the operator's tenant scope.
- Materializes into `_replay_<session_id>` schema for isolation.
- Prints the per-event state diff — essential for "why did this order end up refunded twice" investigations.
- Writes an audit record `audit.replay_invoked` (tamper-evident, tied to dim. 7).

---

## 10. Exactly-once at the Projection

The log is at-least-once (outbox + retry). Exactly-once is enforced **at the consumer**:

```sql
CREATE TABLE projection_dedup (
  projection_name TEXT NOT NULL,
  event_id        UUID NOT NULL,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (projection_name, event_id)
);
```

Handler rule: **insert into `projection_dedup` and write the projection row in the same transaction**. If the insert fails on unique conflict, the event is a duplicate — skip.

Garbage collection: after 30 days `event_id`s older than the oldest consumer checkpoint can be pruned per projection; full rebuild truncates the table as part of §6.1.

---

## 11. Consumer Groups & Partitioning

When fan-out moves from Postgres LISTEN/NOTIFY to Kafka (Phase 2, `>10k events/s`):

- **Partition key**: `hash(aggregate_id)` — preserves per-aggregate order, which handlers rely on.
- **Partition count**: start at 12, multiple of expected peak shard count. Never shrink (Kafka limitation); grow with `kafka-reassign-partitions`.
- **Consumer group per projection**: `cg.buyer_order_view`, `cg.ops_order_view`, ….
- **One handler instance per partition** — concurrency-inside-partition is forbidden so handler ordering guarantees hold.
- **Offset = checkpoint**: on restart consume `last_seq` translated to `(topic, partition, offset)`; dedup table makes offset drift safe.

Tenant isolation in Kafka: shared topic + `tenant_id` claim-check header. Per-tenant topics are reserved for regulated tenants only (cost prohibitive by default).

---

## 12. Cold Storage

PRD §8-3 calls for cold storage. Detailed design:

- Partition `events` by `recorded_at` monthly (`events_2026_04`, …).
- Nightly job exports partitions ≥ 12 months old to S3 as **Parquet** under `s3://oc-events/<tenant>/<yyyy>/<mm>/events.parquet`, keyed with SSE-KMS per-tenant DEK (ADR-005 tie-in).
- After export + checksum, `DETACH PARTITION` + `DROP TABLE` frees OLTP storage.
- Cold replays: `oc-replay --cold --from ...` streams Parquet via DuckDB, upcasts, re-projects.
- Retention: 7 years for finance/compliance events, tenant-configurable for others (GDPR crypto-shred: destroy the DEK → rows unreadable).

---

## 13. Idempotent Consumer Checklist

All projection/webhook/saga consumers must satisfy:

- [ ] Dedup on `(consumer_name, event_id)` inside the write tx.
- [ ] No external side effects before the tx commits (outbox the side effect instead).
- [ ] Upcaster registered for every historical version the consumer declares.
- [ ] Explicit `preferredVersion` / `maxVersion` — no "latest" wildcard.
- [ ] Handler is pure: `(event, tx) → void`, no `Date.now()`, no network calls.
- [ ] Replay-safe: running the handler twice on the same event must produce identical state.
- [ ] Poison-pill queue wired (`projection_dlq`) after 5 retries with exponential backoff.

---

## 14. CLI Surface

```
oc-events tail        --tenant <id> [--type <t>] [--since <seq|ts>]
oc-events show        --event <event_id>
oc-events stats       --projection <name>          # lag, last_seq, error

oc-projection list
oc-projection pause   <name>
oc-projection resume  <name>
oc-projection rebuild <name> [--shadow] [--from-seq N] [--shards 4]
oc-projection rebuild-aggregate <name> --aggregate <id>
oc-projection verify  <name>                       # row-hash vs recomputed

oc-replay             --order <id> [--project <name>] [--dry-run]
oc-replay cold        --from <ts> --until <ts> --project <name>

oc-schema check                                    # CI gate: compat
oc-schema upcast      --type <t> --from v1 --to v2 --payload <file>
```

Every mutating command emits an `audit.ops_action` event with operator identity, reason, and resulting `last_seq`.

---

## 15. Consequences

Positive:
- Review dim. 8 turns from 🟡 to 🟢: schema evolution and rebuild are defined, not assumed.
- Adding a new projection becomes a day-one task (handler + registry entry + rebuild), not a migration project.
- Debugging ("why is this order wrong?") collapses to `oc-replay` — a huge Ops/Support win (ties to PRD §9).
- Exactly-once-ish semantics achieved without a distributed transaction (Fowler CQRS).

Negative / cost:
- Projection dedup table grows until GC — operational overhead.
- Every breaking event change costs a rebuild window (plan in sprint).
- Snapshots are a cache people will be tempted to trust — enforce "drop on schema bump" in code, not docs.
- Cold storage + KMS per-tenant compounds ADR-005 complexity.

---

## 16. Checklist (pre-merge for any event/projection change)

- [ ] New event version has a JSON schema file.
- [ ] Upcaster added and unit-tested for every older version still in the store.
- [ ] Producer sets `event_id`, `correlation_id`, `causation_id`, `tenant_id`, `occurred_at`.
- [ ] Consumer declares `preferredVersion` and `maxVersion`.
- [ ] Projection handler idempotent; dedup row written in same tx.
- [ ] Lag metrics + alert rules added for any new projection.
- [ ] Rebuild rehearsal run in staging; time-budget recorded.
- [ ] `oc-projection verify` passes against a representative tenant.

---

## 17. Open Questions

1. **Primary store** — stay on Postgres `events` table indefinitely, or cut over to EventStoreDB when `seq > 10^9`? Decision criterion: p99 append latency and per-aggregate replay speed.
2. **Cross-tenant projections** — Finance warehouse needs a blended view. Propagate via CDC from the per-tenant projection, or project directly? (ADR-005 conflict.)
3. **Partition migration** — monthly partitions work for events, but projections like `BuyerOrderView` grow unbounded. Tenant-based sharding vs time-based? Decide before 1 M orders/tenant.
4. **OpenSearch drift** — rebuild OpenSearch from Postgres projection or from event log directly? Event-log rebuild is authoritative but 5–10× slower.
5. **Retention vs GDPR** — crypto-shred destroys readability; compliance view may still require a redacted audit trail. Needs ADR-009 alignment.
6. **Snapshot format** — JSON now; switch to CBOR/Protobuf when snapshot tables exceed 50 GB?
