# ADR-013: Concurrency and Locking

- **Status**: Proposed
- **Date**: 2026-04-23
- **Last normalized**: 2026-04-24 (ADR-019)
- **aggregates_touched**: [Order, Payment, Address]
- **Owners**: OpenCheckout platform
- **Related**: ADR-002 (Idempotency), ADR-005 (Multi-tenancy), ADR-012 (High-risk flows)
- **References**: PostgreSQL 13+ docs (Concurrency Control, Explicit Locking, Advisory Locks); Kleppmann, *Designing Data-Intensive Applications*, Ch. 7 & 8

## Context

OpenCheckout는 orders, payments, addresses, shipments, idempotency records, FX refresh cron을 shared PostgreSQL 클러스터에서 조정. `orders`/`payments` 상태기계는 짧지만 non-commutative (`authorized → captured`가 `authorized → voided`와 경쟁 금지). Payment 상태는 7종 canonical enum(authorized·captured·settled·voided·refunded·partially_refunded·failed, @see ADR-019 §3.1)으로 확정. 주소/사용자 리소스는 long-lived + 빈번 read + 간헐 edit from 여러 클라이언트. 일관된 locking vocabulary가 없으면 endpoint마다 즉흥 동시성 제어를 만들게 됨.

## Decision

per-resource 전략 매트릭스. **Postgres-native primitives only**, `READ COMMITTED` default. 애플리케이션 레벨 분산 락 서비스 없음 (Redis RedLock X, Zookeeper X). Advisory locks가 cron 커버.

### 1. Resource Locking Strategy Matrix

| Resource | Lock type | Implementation |
|---|---|---|
| Order 상태 전이 | Pessimistic row lock | `SELECT ... FROM orders WHERE id = $1 FOR UPDATE` 내부 상태 전이 트랜잭션 |
| Address 업데이트 | Optimistic | `version` column + `If-Match: "version-N"` 헤더, `UPDATE ... WHERE id=$1 AND version=$2` |
| Payment 상태 | Pessimistic, non-blocking | `FOR UPDATE NOWAIT`, 충돌 → HTTP 409 + `retry_after_ms` |
| Idempotency record | Unique constraint + upsert | `INSERT INTO idempotency_keys ... ON CONFLICT (key) DO NOTHING RETURNING ...` |
| FX cron leader | Distributed lock | `pg_try_advisory_lock(42)` + lease row `expires_at` heartbeat |
| Stock decrement | Out of scope | Inventory 별도 서비스 |

### 2. Optimistic Locking Protocol (Addresses)

- 모든 row에 `version BIGINT NOT NULL DEFAULT 1`
- Response `ETag: "version-7"`
- Client `If-Match: "version-7"` on PUT/PATCH
- Server: `UPDATE addresses SET ..., version = version + 1 WHERE id=$1 AND version=$2`. 0 rows updated → `412 Precondition Failed` + current `version`
- Client read-merge-write 재시도 **max 3** (100ms, 300ms, 900ms + ±20% jitter). 3회 실패 시 사용자에게 버블
- `If-Match` 없는 write는 versioned 리소스에 대해 `428 Precondition Required`
- **label.purchased 이후 Address update non-propagating**: Order가 `LABEL_PURCHASED` 상태를 지난 뒤 Address가 변경되어도 기존 AWB에는 전파하지 않음. Amendment가 필요하면 ADR-012 Scenario 3 절차를 통해 별도 처리. (@see ADR-019 §3.11)

### 3. Pessimistic Locking — Payment State Machine

```sql
BEGIN;
SELECT status FROM payments WHERE id = $1 FOR UPDATE NOWAIT;
-- application verifies (current_status, target_status) ∈ allowed_transitions
UPDATE payments SET status = $2, updated_at = now() WHERE id = $1;
COMMIT;
```

`NOWAIT` 필수. 동시 capture/void 충돌 → `lock_not_available` (SQLSTATE `55P03`) → HTTP 409 + `Retry-After: 1`. Blocking lock은 webhook 부하 시 silently serialize — 명확한 semantics로 fail-fast.

### 4. Advisory Lock — FX Cron Leader Election

```sql
SELECT pg_try_advisory_lock(42);  -- namespace key = 42 ("fx-cron")
-- leader: lease row 삽입, expires_at = now() + '5 minutes'
-- leader heartbeat every 60s
-- on shutdown: SELECT pg_advisory_unlock(42);
```

Advisory lock은 session-scoped → connection death 시 자동 해제. Lease row는 frozen (but not disconnected) 리플리카 대비 defense-in-depth.

### 5. Read-After-Write Consistency

- **Same-request writer-reader**: 나머지 요청 동안 primary pin (request-scoped pool)
- **Subsequent requests**: replica reads 허용, **5초 lag SLO**, 초과 시 replica drain
- **Causal consistency token**: write 시 `X-OC-Read-After: <primary_lsn>` 반환. 클라 다음 read에 echo → gateway가 primary 라우팅 또는 `pg_last_wal_replay_lsn()` 대기

### 6. Transaction Isolation

- **Default: `READ COMMITTED`** — Postgres default. Row lock + optimistic `version` 조합이면 충분 (Kleppmann Ch.7)
- **`SERIALIZABLE`** — settlement/reconciliation 잡 전용. `40001 serialization_failure` → 재시도 max 5, exp backoff
- **`REPEATABLE READ`** 사용 안함 — write-skew 위험

### 7. Long-Running Query Kill

Per-connection pool 시작 시:
- Read-only: `SET statement_timeout = '30s'`
- Read-write: `SET statement_timeout = '10s'`
- Analytical/settlement: `SET statement_timeout = '120s'` (별도 pool)
- `idle_in_transaction_session_timeout = '15s'` — 누출된 트랜잭션 kill (row lock 누수 방지)

### 8. Deadlock 방지 — Resource Ordering

모든 multi-row write 트랜잭션은 canonical 순서로 row lock 획득:

```
order_id → payment_id → shipment_id → address_id
```

`locks.acquire_in_order(resources)` helper로 강제. Raw `FOR UPDATE`는 lint rule 금지. 같은 리소스 타입 내에서는 PK 오름차순. Postgres가 여전히 deadlock 감지 시 (`40P01`) 핸들러 재시도 max 3 + backoff → 실패 시 `503` + 내부 alert.

### 9. Connection Pooling

- **PgBouncer in `transaction` pooling mode**
- 결과: server-side prepared statements는 트랜잭션 간 캐시 불가. 드라이버를 disable server-side prepares로 설정 (`prepareThreshold=0` 등)
- `transaction` mode에서 advisory lock이 session identity 의존 시 **transaction-scoped** `pg_advisory_xact_lock` 사용. FX cron은 **dedicated non-pooled connection** 사용해 session-scoped `pg_try_advisory_lock` 유지
- `SET statement_timeout`은 session 시작 시, reuse 시 reset — pool startup script 검증

### 10. Idempotency 상호작용

- Idempotency-Key lookup은 **hot-path, lock-free read**: `SELECT response FROM idempotency_keys WHERE key = $1`
- 캐시 hit 시 write 트랜잭션 열지 않음 → row lock 0
- Miss 시만 `INSERT ... ON CONFLICT (key) DO NOTHING RETURNING id`. Losing insert = 동시 요청 → row poll max 3× over 300ms → 여전히 pending 시 `409`
- Pessimistic lock은 **idempotency row reserve 이후** 획득 (중복 재시도가 contention 증폭 안 함)

### 11. Batch Workloads — `FOR UPDATE SKIP LOCKED`

```sql
SELECT id, payload
  FROM outbox
 WHERE status = 'pending'
 ORDER BY created_at
 LIMIT 100
 FOR UPDATE SKIP LOCKED;
```

다중 poller 워커 병렬 소비, 데드락/HOL 블로킹 없음. 각 워커 배치 1 트랜잭션. 사용자 리소스 상태 전이에는 **금지** — 충돌이 관찰 가능해야 함 (NOWAIT).

### 12. Testing

- **pg-deadlock-tests** 하네스 — 파라미터화 시나리오, N concurrent 트랜잭션, 기대 결과 분포 assert (1 winner, N-1 재시도/`409`)
- 커버: double-capture on payment, 동시 address edit, outbox poller fan-out, FX cron leader SIGKILL 후 failover, `If-Match` 재시도 소진, deadlock ordering lint
- CI: 실제 Postgres (`fsync=off` 속도) + nightly `fsync=on` prod-like
- Chaos job: load 중 random 3-6s replica pause → lag SLO + `X-OC-Read-After` 라우팅 검증

## Consequences

**긍정**: 단일 locking vocabulary (`FOR UPDATE`, `FOR UPDATE NOWAIT`, `FOR UPDATE SKIP LOCKED`, `pg_try_advisory_lock`, `version` CAS). 분산 락 인프라 불필요. Fail-fast `NOWAIT`로 tail latency 제한. `SKIP LOCKED`로 outbox 수평 throughput.

**부정/비용**: PgBouncer transaction mode가 모든 드라이버에 prepared statement 규율 강제 — regression 쉬움. `READ COMMITTED` + row lock은 개발자 교육 필요. `If-Match`가 클라 복잡도 추가 — SDK가 retry loop 표준화. Advisory lock은 `pg_locks` 쿼리에 안 보임 — 런북 명시.

## Checklist (reviewer gate)

- [ ] 신규 상태 전이 엔드포인트가 `FOR UPDATE NOWAIT` 사용 (raw `FOR UPDATE` X)
- [ ] 모든 versioned 리소스가 `If-Match` 핸들러 강제
- [ ] `FOR UPDATE`는 `locks.acquire_in_order` helper만 통해 호출
- [ ] 신규 poller는 `SKIP LOCKED`, 신규 상태기계는 금지
- [ ] `statement_timeout` + `idle_in_transaction_session_timeout` 풀 부트스트랩
- [ ] Advisory-lock 사용처가 session (`pg_advisory_lock`) vs transaction (`pg_advisory_xact_lock`) scope 문서화
- [ ] Serialization-failure 재시도 bounded (≤5) + jittered backoff
- [ ] 신규 multi-row write 경로에 deadlock 테스트

## Open Questions

1. `version` column을 BIGINT counter vs monotonic `xmin`-derived ETag? counter 가독성 우선
2. Advisory-lock key namespace — 수동 registry (현 `42 = fx-cron`) vs `hashtext('fx-cron')`? 충돌 이론적 가능 → 현재 registry
3. FX cron lease TTL 5분 — PRD §6-3 실제 cadence 확인 후 조정
4. `SELECT ... FOR NO KEY UPDATE` 필요? 강하게 참조되는 parent row (e.g., `orders`) FK-lock contention 관찰 후
5. Replica-lag SLO 5s는 guess — 프로덕션 `pg_stat_replication` 히스토그램으로 calibrate
6. 인과 일관성 토큰 (`X-OC-Read-After`) 공개 API vs 내부 — 내부 유지 권고

## Sources

- PostgreSQL docs: Concurrency Control, Explicit Locking, Advisory Locks
- Martin Kleppmann, *Designing Data-Intensive Applications* Ch.7-8
