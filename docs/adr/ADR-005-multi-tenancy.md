# ADR-005 — Multi-Tenancy Isolation for OpenCheckout

- **Status**: Proposed
- **Date**: 2026-04-23
- **Last normalized**: 2026-04-24 (ADR-019)
- **aggregates_touched**: [Order, Payment, Identity]
- **Deciders**: OpenCheckout core maintainers
- **Related**: PRD §5-6 (tenantId), §9-3 (RBAC), Review 차원 12, ADR-004

## 1. Context

OpenCheckout는 OSS self-hostable 체크아웃 플랫폼. 단일 control-plane이 여러 머천트 tenant(tenantId = UUID) 서빙. 위협 모델:
- 버그/SQL typo/누락된 `WHERE tenant_id = ?`로 데이터 노출
- 무거운 tenant(FX 배치 재계산, webhook storm)의 CPU/DB pool/Redis 독점
- Operator impersonation 감사 추적 부재
- Per-tenant 암호화 재료 공유 → key rotation/"forget this tenant" 불가

격리 모델은 **strong by default, cheap for small self-hosters, compatible with managed Postgres**.

## 2. Decision Drivers

1. 단일 Postgres self-host 안전성
2. 교차 tenant 노출은 **구조적으로** 차단 (코드 리뷰 의존 X)
3. 대형 operator는 한 tenant를 dedicated DB로 이전 가능
4. Per-tenant 암호 키 + data-subject deletion
5. Noisy neighbor가 전체 시스템 다운 금지

## 3. Isolation Model Options

| Model | Isolation | Ops cost | Migration | Self-host 적합 |
|---|---|---|---|---|
| **A. Shared DB/schema (pool) + RLS** | Row-level PG enforced | Low | 단일 | **Yes** (default) |
| **B. Schema-per-tenant** | Schema | Medium | N schemas | 수백 tenant 이상 한계 |
| **C. DB-per-tenant (silo)** | Instance | High | N DBs | Enterprise/regulated tier |

### Decision

**Model A** 기본 + **Model C** escape hatch (`tenant_residency` 라우팅 테이블). Model B 기각.

## 4. Row-Level Security (RLS)

모든 tenant-scoped 테이블에 `tenant_id UUID NOT NULL` + RLS.

```sql
-- Template per tenant-scoped table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Ops impersonation bypass (audited)
CREATE POLICY ops_bypass ON orders
  TO ops_impersonator
  USING      (current_setting('app.ops_bypass', true) = 'on')
  WITH CHECK (false);  -- read-only
```

- `FORCE ROW LEVEL SECURITY` 필수 (table owner 우회 방지)
- `WITH CHECK`으로 foreign `tenant_id` INSERT 차단
- ops_bypass 정책은 read-only, 별도 role + 감사 로그

### Per-connection session variable

```ts
import { createMiddleware } from 'hono/factory';
import { pool } from '../db';

export const tenantContext = createMiddleware(async (c, next) => {
  const tenantId = c.get('auth')?.tid;
  if (!tenantId) return c.json({ error: 'no_tenant' }, 401);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    c.set('db', client);
    await next();
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});
```

규칙:
- `set_config(..., true)` = transaction-local
- DB role(`app_api`)은 **non-superuser, non-BYPASSRLS**
- 핸들러에서 raw `pool.query` 금지 (lint 강제)

## 5. Per-Tenant KMS DEK (Envelope Encryption)

> **ADR-019 정규화 적용 (2026-04-24)**: Tenant DEK는 **PII DEK (per-tenant)** 로 명명. Audit 로그 전용 **Audit DEK** 는 별도 KMS CMK를 사용하며 crypto-shred 대상 아님 (@see ADR-019 §3.7, ADR-014 §10).

키 hierarchy:
```
KMS Master KEK (환경당, 연간 로테이션, KMS 밖 절대 미출)
   ├─ PII DEK (tenantId당, PII 필드 암호화, crypto-shred 대상)
   │     └─ Data Key  (레코드당, random 32B, cell 암호화)
   └─ Audit DEK (환경당, audit_log 전용, crypto-shred 제외, @see ADR-014 §10)
```

```sql
CREATE TABLE tenant_keys (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  dek_wrapped BYTEA NOT NULL,
  kek_version TEXT  NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at  TIMESTAMPTZ
);
```

Rotation:
- **KEK**: 연간 in KMS. 회전 시 백그라운드 re-wrap
- **Tenant DEK**: 요청 시 or 의심 compromise. lazy re-encrypt (read-old/write-new), 구버전 N일 후 tombstone
- **Data key**: record-per, ephemeral

**Data-subject deletion**: `tenant_keys` row 삭제 → 모든 ciphertext **crypto-shred** (데이터 테이블 건드리지 않음).

## 6. Quotas

```sql
CREATE TABLE tenant_quotas (
  tenant_id          UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  api_req_per_min    INT NOT NULL DEFAULT 600,
  fx_calls_per_day   INT NOT NULL DEFAULT 200,
  webhook_per_min    INT NOT NULL DEFAULT 300,
  max_order_size     INT NOT NULL DEFAULT 10000000,  -- cents
  db_pool_max        INT NOT NULL DEFAULT 20,
  storage_bytes_max  BIGINT NOT NULL DEFAULT 10737418240,  -- 10 GiB
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

3 레이어 enforcement:
1. **Edge middleware** — `api_req_per_min`
2. **Service layer** — `fx_calls_per_day`, `max_order_size`
3. **DB** — `db_pool_max` (§7)

## 7. Rate Limiting Per Tenant

**Primary**: Redis sliding window `rl:{tenantId}:{bucket}:{windowStart}`. Lua `ZADD`/`ZREMRANGEBYSCORE` 원자.

**Fallback (no Redis)**: Postgres `pg_advisory_xact_lock` + 롤링 카운터. <50 req/s self-host 적합.

```ts
const allowed = await redis.eval(SLIDING_WINDOW_LUA, 1,
  `rl:${tenantId}:api`, nowMs, windowMs, quota);
if (!allowed) return c.json({ error: 'rate_limited' }, 429);
```

헤더: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (RFC 9331).

## 8. Noisy Neighbor Controls

- **Per-tenant DB pool cap**: wrapper가 in-flight per tenant 추적, `db_pool_max` 초과 시 queue
- **Per-tenant Redis namespace**: prefix `t:{tenantId}:…`, `maxmemory-policy allkeys-lru`
- **Long-query kill switch**: `pg_stat_activity`에서 30s+ 쿼리 (application_name에 tenantId 인코딩) → `pg_cancel_backend`
- **Outbox poller**: fair scheduler, 라운드로빈 by tenantId (≤ N per tick) — FIFO 아님
- **Scheduler**: cron 작업 tenant-sharded
- **OpenSearch**: <1k tenant는 index-per-tenant, 초과 시 alias-per-tenant on shared index

## 9. Cross-Tenant 금지

Defense in depth:
1. **DB**: RLS (§4)
2. **App**: repository 함수가 `tenantId` 명시 인자 + `ctx.tenantId` 일치 assertion. lint(`no-raw-pool-query`)로 우회 차단
3. **예외**: Ops impersonation — 단기 signed `impersonation_token`, admin console 발급. 모든 impersonated 요청은 `audit.impersonation_events` row + `x-oc-impersonated-by: <operator-id>` 헤더

## 10. Shared Resource Isolation

| Resource | 격리 수단 |
|---|---|
| Postgres rows | RLS + `app.tenant_id` GUC |
| Redis keys | `t:{tenantId}:*` namespace |
| OpenSearch | 인덱스/alias per tenant |
| Outbox/Scheduler | Fair-share round-robin |
| S3 | Prefix `tenants/{tenantId}/…` + bucket policy |
| KMS | Per-tenant DEK |
| Log streams | `tenant_id` 필드 **필수** |
| Metrics | Prometheus label `tenant_id` (cardinality 관리 hashing) |

## 11. Audit Trail

```ts
logger.info({ tenant_id, actor_id, action, resource, request_id }, 'msg');
```

- `tenant_id`는 요청 스코프 내 **모든 로그 필수**. shim이 missing 시 throw (dev) / drop+alert (prod)
- 모든 mutation → `audit.events` with `(tenant_id, actor_id, action, before, after, ts)`
- Impersonation: 추가 `ops_actor_id` column

## 12. Verification Scenarios (자동 테스트)

`packages/db/test/rls.spec.ts`:

1. **RLS smoke** — `app.tenant_id=A`에서 `SELECT * FROM orders`는 A의 row만
2. **Forced write isolation** — `INSERT ... tenant_id=B` → `new row violates row-level security policy`
3. **Unset GUC = deny** — no `app.tenant_id` → row count 0 (default tenant 없음)
4. **Pool reuse leak** — connection release 후 다음 checkout에 GUC leak 없음
5. **Superuser audit** — prod에서 `postgres` 쿼리 → alert
6. **Impersonation trail** — 모든 `ops_bypass=on` 세션에 `impersonation_events` row
7. **Rate-limit fairness** — tenant A 10x quota 부하 시 tenant B p99 <10% 저하
8. **Key shred** — `tenant_keys[A]` 삭제 → A ciphertext 복호 불가, B unaffected
9. **Cross-tenant join** — 정적 분석기가 두 tenant 테이블 join without matching `tenant_id` flag

## 13. Consequences

**긍정**: 구조적 DB-enforced 격리. 단일 schema/migration — self-host 친화. Enterprise DB-per-tenant escape path. Crypto deletion per tenant.

**부정**: RLS 플랜 오버헤드 <5% 벤치. PgBouncer는 **transaction pooling** + `SET LOCAL` 필수. Per-tenant pool 복잡도. `postgres`/`rds_superuser` 사용 금지 규율.

## 14. Checklist (pre-merge)

- [ ] 신규 tenant-scoped 테이블: `tenant_id UUID NOT NULL`, FK to `tenants(id)`, RLS + FORCED, policy
- [ ] Migration이 `CREATE POLICY` + regression test 포함
- [ ] Repository 함수 `tenantId` 명시 인자, lint 통과
- [ ] Logger call sites에 `tenant_id` (type-checked)
- [ ] 신규 sensitive column은 envelope encryption helper 사용
- [ ] Rate-limit bucket이 `tenant_quotas` 선언
- [ ] Chaos test: noisy-neighbor 업데이트

## 15. Open Questions

1. `tenant_residency` 테이블 버저닝 vs config reload
2. OpenSearch cardinality 1k 경계 (load test 필요)
3. PgBouncer vs pgcat (per-tenant pool 네이티브)
4. Redis-less 배포에서 Postgres-only 레이트리미터 충분?
5. Regional sharding (tenantId → region) 별도 ADR
6. Ops bypass를 hosted tier에서 완전 금지?
