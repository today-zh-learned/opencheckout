# TDD-01 — `services/gateway` Tech Design

- Status: Draft
- Author: Gateway WG
- Date: 2026-04-23
- Supersedes: —
- Related: PRD §4 D9 (런타임 경계, 스택), §6 (Payment Module), §8 (Lifecycle/Events), ADR-001 (Hexagonal), review §1·§10

## 1. 목적 & 범위

`services/gateway`는 `@opencheckout/widget-*`, `@opencheckout/sdk-*`, 머천트 서버의 유일한 트래픽 진입점이다. Hono 단일 코드베이스로 **Edge**와 **Node** 두 런타임을 동시 타겟하고, 결제·주소·주문 유스케이스를 Hexagonal 포트-어댑터(ADR-001)로 노출한다. 본 문서는:

- 런타임 경계 & 라우트 분할
- 미들웨어 스택 / 에러 계약
- 디렉토리 레이아웃 (Hexagonal)
- DB 스키마 10개 테이블 DDL·인덱스
- Outbox poller, cron, health, shutdown
- 설정·배포·관측성·성능 목표

를 구현 가능한 수준까지 고정한다. 다른 차원(위협 모델, DR, 에러 카탈로그)은 ADR-003/007/010에서 개별 다룬다 — 본 TDD는 **차원 1 (아키텍처)와 차원 10 (배포/릴리스)**을 해소한다.

## 2. 런타임 경계 (D9 강제)

| 책임 | 런타임 | 근거 |
|---|---|---|
| 위젯 토큰 발급 `POST /v1/widget/tokens` | **Edge** (Cloudflare Workers / Vercel Edge) | 저지연·DDoS 흡수, 위젯 bootstrap CDN 인접 |
| 공개 조회 `GET /v1/public/orders/:publicId` | **Edge** | 읽기 전용, cache-friendly |
| `POST /v1/payments/confirm` (Toss 승인) | **Node** (Fastify-compat Hono) | 고정 IP allowlist, 긴 타임아웃, Node `crypto` |
| `POST /v1/webhooks/toss` | **Node** | 재시도·DLQ·서명검증·큰 body |
| `POST /v1/orders`, `/shipments`, `/addresses` 외 쓰기 | **Node** | PG 트랜잭션·outbox·RLS |
| cron (`fx:update`, `outbox:retry`, `quote:expire`) | **Node** | 장시간 잡 |

**강제 방법**: `src/adapters/inbound/http/routes/` 아래 `edge/*.ts`와 `node/*.ts`를 분리. 각 파일은 독자적 `Hono<Env>` 인스턴스를 export하고, `infrastructure/server.edge.ts` / `server.node.ts`가 각 라우터만 마운트. 타입 레벨 `RuntimeBrand = "edge" | "node"`를 `Env["Variables"]`에 싣고, Node 전용 어댑터(예: `pg` repo)는 `RuntimeBrand extends "node"` 제약으로만 주입되게 강제한다. Edge 번들러가 Node 어댑터를 import하면 `tsup` `--platform=browser`에서 빌드 실패 → CI에서 차단.

## 3. Hono 미들웨어 스택

**순서 불변** (아래에서 위로 응답이 되감긴다).

```ts
// src/adapters/inbound/http/pipeline.ts
import { Hono } from 'hono'
import type { Env } from './env'

export const buildApp = (deps: Deps) => {
  const app = new Hono<Env>()

  // 1. requestId — ULID + W3C traceparent
  app.use('*', requestId())
  // 2. audit — 원본 요청(헤더·body hash·IP·UA) 기록. write는 별도 async queue
  app.use('*', audit({ sink: deps.auditSink }))
  // 3. cors — allowlist는 tenant 설정에서 로드
  app.use('*', corsPerTenant(deps.tenantCache))
  // 4. bodyLimit — 기본 1MB, webhook 경로 10MB
  app.use('/v1/webhooks/*', bodyLimit({ maxSize: 10 * 1024 * 1024 }))
  app.use('*', bodyLimit({ maxSize: 1024 * 1024 }))
  // 5. authn — API key(HMAC prefix ok_live_*) | JWT(RS256, JWKS rotate) | mTLS
  app.use('*', authn(deps.keyStore, deps.jwks))
  // 6. tenancy — PG session var `SET LOCAL app.tenant_id = $1` 주입 (RLS)
  app.use('*', tenancy(deps.pg))
  // 7. rateLimit — sliding window, per-tenant + per-route, Redis
  app.use('*', rateLimit(deps.redis))
  // 8. idempotency — POST/PATCH/DELETE, Idempotency-Key 헤더, payload hash 비교
  app.use('*', idempotencyForWrites(deps.pg))
  // 9. authz — route-declared scope vs token scope
  app.use('*', authz())

  // routes
  mountEdgeRoutes(app, deps) // or mountNodeRoutes
  // errorHandler — RFC 7807 application/problem+json
  app.onError(rfc7807(deps.logger))
  app.notFound(notFound7807)
  return app
}
```

**핵심 규칙**:

- `requestId` 이 **가장 먼저**. traceparent가 없으면 생성, 있으면 계승 → 이후 모든 로그/메트릭/Toss 호출 헤더에 전파.
- `audit`를 `authn` 앞에 둔다. 실패한 인증도 감사로그에 남아야 차원 7 (tamper-evident)을 만족.
- `tenancy`는 `authn` 직후. RLS를 켜고 전 쿼리에 `SET LOCAL app.tenant_id`가 세션 변수로 박힌 채 흘러야 한다.
- `idempotency`는 멱등 저장소 hit 시 204 회귀 전에 `authz`를 통과시켜 권한 누락을 감추지 않는다. 순서는 위와 같이 `authz` 바로 앞이 정답이지만, `Idempotency-Key` 추출만 먼저 수행하고 **응답 캐시 반환**은 `authz` 이후에 일어난다 (2-phase: extract → gate → replay).
- `errorHandler`는 반드시 **마지막**. 모든 throw는 `AppError`로 정규화되어 RFC 7807로 나간다.

## 4. 디렉토리 구조 (Hexagonal, ADR-001과 정합)

```
services/gateway/
  src/
    domain/                         # 의존성 0개, 순수 TS
      order/
        Order.ts                    # aggregate root
        OrderStateMachine.ts
        events.ts                   # domain event types
      payment/
        Payment.ts
        PaymentIntent.ts
      address/
        Address.ts                  # canonical, 내부 전용
        AddressDisplayDTO.ts        # 사용자 노출 projection
      shared/
        Money.ts, TenantId.ts, Ulid.ts, Result.ts

    application/                    # use-cases, ports (interfaces)
      ports/
        inbound/  (ConfirmPayment, CreateOrder, IssueLabel, ...)
        outbound/ (PaymentGateway, Clock, Repo<T>, KmsCrypter, Publisher)
      use-cases/
        ConfirmPayment.ts
        CreateOrder.ts
        HandleTossWebhook.ts
        IssueShippingLabel.ts
        QuoteDuty.ts
        UpsertAddress.ts

    adapters/
      inbound/
        http/
          env.ts                    # Hono Env 타입
          pipeline.ts               # buildApp()
          routes/
            edge/  widgetTokens.ts, publicOrders.ts
            node/  payments.ts, webhooks.ts, orders.ts, addresses.ts, shipments.ts
          middleware/  requestId.ts, audit.ts, cors.ts, bodyLimit.ts,
                       authn.ts, tenancy.ts, rateLimit.ts, idempotency.ts,
                       authz.ts, rfc7807.ts
        cron/    fxUpdate.ts, outboxRetry.ts, quoteExpire.ts
      outbound/
        toss/     TossClient.ts, sign.ts, retry.ts
        juso/     JusoClient.ts
        ems/      EmsClient.ts
        db/       PgOrderRepo.ts, PgPaymentRepo.ts, PgIdempotencyRepo.ts,
                  PgOutboxPublisher.ts, PgAuditSink.ts
        kms/      AwsKmsCrypter.ts, LocalDevCrypter.ts
        cache/    RedisRateLimiter.ts, RedisFxCache.ts
        bus/      LocalPublisher.ts, SqsPublisher.ts (플러그인)

    infrastructure/
      server.node.ts                # Node entry, fastify-compat Hono
      server.edge.ts                # Workers entry
      config.ts                     # zod validation
      db.ts                         # pg Pool, search_path, RLS
      kms.ts
      otel.ts                       # tracer/meter/logger provider
      health.ts
      shutdown.ts
```

**규칙**: `domain/*`는 `application/*`만 import 가능. `application/*`은 `domain/*`과 `ports/*`만. `adapters/*`은 `application/ports`를 구현한다. 이 규칙은 `eslint-plugin-boundaries` + `depcruise` CI로 강제.

## 5. DB 스키마 (PostgreSQL 15+, 10 core tables)

모든 테이블: `id ulid PRIMARY KEY`, `tenant_id ulid NOT NULL`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`, **Row Level Security 활성**.

```sql
-- 5.1 merchants
CREATE TABLE merchants (
  id            ulid PRIMARY KEY,
  slug          text UNIQUE NOT NULL,
  legal_name    text NOT NULL,
  country       char(2) NOT NULL,
  status        text NOT NULL CHECK (status IN ('active','suspended','closed')),
  settings      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX merchants_status_idx ON merchants(status);

-- 5.2 tenants  (merchant 당 1..N — prod/sandbox 분리)
CREATE TABLE tenants (
  id            ulid PRIMARY KEY,
  merchant_id   ulid NOT NULL REFERENCES merchants(id),
  env           text NOT NULL CHECK (env IN ('live','test')),
  region        text NOT NULL,
  dek_ciphertext bytea NOT NULL,       -- KMS로 감싼 per-tenant DEK
  quota         jsonb NOT NULL DEFAULT '{}',
  UNIQUE (merchant_id, env)
);
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- 5.3 api_keys
CREATE TABLE api_keys (
  id            ulid PRIMARY KEY,
  tenant_id     ulid NOT NULL REFERENCES tenants(id),
  prefix        text NOT NULL,          -- ok_live_abc...
  hash          bytea NOT NULL,         -- argon2id(secret)
  scopes        text[] NOT NULL,
  expires_at    timestamptz,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX api_keys_prefix_uq ON api_keys(prefix);
CREATE INDEX api_keys_tenant_idx ON api_keys(tenant_id) WHERE revoked_at IS NULL;

-- 5.4 orders
CREATE TABLE orders (
  id            ulid PRIMARY KEY,
  tenant_id     ulid NOT NULL REFERENCES tenants(id),
  public_id     text NOT NULL,         -- 구매자 노출용 KR-2026-0423-0001
  status        text NOT NULL,         -- state machine enum
  currency      char(3) NOT NULL,
  amount_total  bigint NOT NULL,       -- minor units
  buyer_email_enc bytea,               -- envelope-encrypted PII
  locale        text NOT NULL,
  country       char(2) NOT NULL,
  version       int  NOT NULL DEFAULT 0,  -- 낙관적 락 (If-Match)
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX orders_tenant_public_uq ON orders(tenant_id, public_id);
CREATE INDEX orders_tenant_status_created_idx ON orders(tenant_id, status, created_at DESC);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_tenant_rls ON orders
  USING (tenant_id = current_setting('app.tenant_id')::ulid);

-- 5.5 payments
CREATE TABLE payments (
  id              ulid PRIMARY KEY,
  tenant_id       ulid NOT NULL,
  order_id        ulid NOT NULL REFERENCES orders(id),
  pg              text NOT NULL,        -- 'toss'
  payment_key     text,                 -- Toss paymentKey
  method          text NOT NULL,
  currency        char(3) NOT NULL,
  amount          bigint NOT NULL,
  status          text NOT NULL,        -- authorized|captured|canceled|refunded|failed
  fx_rate_snapshot numeric(18,8),
  raw_response_enc bytea,               -- 암호화 원본, retention 정책 적용
  approved_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments(order_id);
CREATE UNIQUE INDEX payments_paymentkey_uq ON payments(pg, payment_key) WHERE payment_key IS NOT NULL;

-- 5.6 shipments
CREATE TABLE shipments (
  id              ulid PRIMARY KEY,
  tenant_id       ulid NOT NULL,
  order_id        ulid NOT NULL REFERENCES orders(id),
  carrier         text NOT NULL,
  service_code    text NOT NULL,
  tracking_number text,
  label_url       text,
  status          text NOT NULL,        -- preparing|handed_over|in_transit|...
  purchased_at    timestamptz,
  delivered_at    timestamptz
);
CREATE INDEX shipments_order_idx ON shipments(order_id);
CREATE INDEX shipments_tracking_idx ON shipments(carrier, tracking_number);

-- 5.7 addresses  (canonical, server-only)
CREATE TABLE addresses (
  id              ulid PRIMARY KEY,
  tenant_id       ulid NOT NULL,
  owner_type      text NOT NULL,        -- 'order' | 'buyer'
  owner_id        ulid NOT NULL,
  country         char(2) NOT NULL,
  canonical_json_enc bytea NOT NULL,    -- AddressCanonicalRecord, envelope-encrypted
  display_hash    bytea NOT NULL,       -- dedup용 해시
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX addresses_owner_idx ON addresses(owner_type, owner_id);

-- 5.8 idempotency_records
CREATE TABLE idempotency_records (
  tenant_id       ulid NOT NULL,
  key             text NOT NULL,        -- Idempotency-Key 헤더
  method          text NOT NULL,
  path            text NOT NULL,
  payload_hash    bytea NOT NULL,       -- sha256(body)
  response_status int,
  response_body   bytea,                -- gzipped
  state           text NOT NULL CHECK (state IN ('in_flight','completed','failed')),
  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz NOT NULL, -- 24h
  PRIMARY KEY (tenant_id, key, method, path)
);
CREATE INDEX idem_expires_idx ON idempotency_records(expires_at);

-- 5.9 outbox
CREATE TABLE outbox (
  id              bigserial PRIMARY KEY,
  tenant_id       ulid NOT NULL,
  aggregate_type  text NOT NULL,
  aggregate_id    ulid NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  headers         jsonb NOT NULL,       -- correlationId, causationId, traceparent
  status          text NOT NULL DEFAULT 'pending',  -- pending|dispatched|failed|dead
  attempts        int  NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox(status, next_attempt_at)
  WHERE status IN ('pending','failed');

-- 5.10 audit_log
CREATE TABLE audit_log (
  id              bigserial PRIMARY KEY,
  tenant_id       ulid,
  actor           text,                 -- api_key:prefix | user:ulid | system
  ts              timestamptz DEFAULT now(),
  method          text, path text, status int,
  request_hash    bytea,
  ip              inet, user_agent text,
  request_id      text,
  prev_hash       bytea,                -- hash chain → tamper-evident
  row_hash        bytea NOT NULL
);
CREATE INDEX audit_tenant_ts_idx ON audit_log(tenant_id, ts DESC);
```

**RLS**: `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` + `CREATE POLICY ... USING (tenant_id = current_setting('app.tenant_id')::ulid)` 를 `orders/payments/shipments/addresses/outbox`에 적용. `api_keys`/`tenants`는 `service_role`만 접근.

## 6. Outbox Poller (LISTEN/NOTIFY + 폴백 polling)

```ts
// adapters/outbound/db/OutboxDispatcher.ts
export class OutboxDispatcher {
  constructor(private pg: Pool, private publisher: Publisher, private log: Logger) {}

  async start(signal: AbortSignal) {
    const listener = await this.pg.connect()
    await listener.query('LISTEN outbox_new')
    listener.on('notification', () => this.drain().catch(e => this.log.error(e)))
    // 폴백: NOTIFY 유실 방지, 5초 주기 polling
    const timer = setInterval(() => this.drain().catch(() => {}), 5000)
    signal.addEventListener('abort', () => { clearInterval(timer); listener.release() })
  }

  private async drain() {
    // FOR UPDATE SKIP LOCKED → 다중 워커 안전
    const batch = await this.pg.query(`
      SELECT * FROM outbox
       WHERE status IN ('pending','failed') AND next_attempt_at <= now()
       ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`)
    for (const row of batch.rows) {
      try {
        await this.publisher.publish(row.event_type, row.payload, row.headers)
        await this.pg.query(`UPDATE outbox SET status='dispatched' WHERE id=$1`, [row.id])
      } catch (err) {
        const attempts = row.attempts + 1
        const backoff = Math.min(2 ** attempts, 900) // max 15m
        const dead = attempts >= 12
        await this.pg.query(
          `UPDATE outbox SET attempts=$2, next_attempt_at=now() + ($3 || ' seconds')::interval,
                             status=$4, last_error=$5 WHERE id=$1`,
          [row.id, attempts, backoff, dead ? 'dead' : 'failed', String(err)])
      }
    }
  }
}
```

쓰기 경로는 `INSERT INTO outbox (...)` 후 `NOTIFY outbox_new` 를 같은 트랜잭션에 묶는다 (application/use-case가 `UnitOfWork`로 감쌈).

## 7. Cron Jobs

| Job | 스케줄 | 책임 |
|---|---|---|
| `fx:update` | `*/5 10-17 * * 1-5 Asia/Seoul` | 수출입은행 API 호출·Redis `fx:{cur}:{date}:{slot}` 저장, fail-closed 플래그 관리 |
| `outbox:retry` | `*/1 * * * *` | polling fallback (NOTIFY 유실 대비) |
| `quote:expire` | `*/5 * * * *` | `duty_quote.valid_until < now()` → `status=expired`, 관련 주문 재견적 필요 플래그 |
| `idem:gc` | `0 3 * * *` | `idempotency_records.expires_at < now()` 하드 삭제 |
| `audit:chain_verify` | `0 4 * * *` | `row_hash = h(prev_hash || canonical(row))` 연속성 검사, 불일치 alert |

구현은 `node-cron` + `distributed-lock(Redis)` 조합: 복수 Node pod 중 하나만 실행.

## 8. Health Checks

```ts
// infrastructure/health.ts
export const liveness = async () => ({ ok: true, ts: Date.now() })

export const readiness = async (deps: Deps) => {
  const [db, kms, toss] = await Promise.allSettled([
    deps.pg.query('SELECT 1'),
    deps.kms.ping(),
    deps.toss.ping(),   // HEAD https://api.tosspayments.com  (300ms budget)
  ])
  const ok = [db, kms, toss].every(r => r.status === 'fulfilled')
  return {
    ok,
    checks: { db: db.status, kms: kms.status, toss: toss.status },
  }
}

app.get('/healthz', c => c.json(await liveness()))
app.get('/readyz',  c => { const r = await readiness(deps); return c.json(r, r.ok ? 200 : 503) })
```

K8s `livenessProbe` → `/healthz` (프로세스 alive 판단), `readinessProbe` → `/readyz` (트래픽 수신 가능 판단). Fly.io는 `[[services.http_checks]]`로 `/healthz`, `[[services.checks]]`로 `/readyz` 설정.

## 9. Graceful Shutdown

```ts
// infrastructure/shutdown.ts
export function wireShutdown(server: Server, deps: Deps) {
  const ctl = new AbortController()
  let draining = false
  const stop = async (sig: string) => {
    if (draining) return
    draining = true
    deps.log.info({ sig }, 'draining')
    // 1. readiness false 로 즉시 전환 → LB에서 빠짐
    deps.healthFlags.ready = false
    // 2. 새 연결 거부, 진행 중 요청은 완료까지 대기 (최대 25s)
    server.close()
    await Promise.race([
      deps.inflight.wait(),              // zero-inflight 대기
      new Promise(r => setTimeout(r, 25_000)),
    ])
    // 3. 백그라운드 stop
    ctl.abort()                           // outbox, cron stop
    await deps.pg.end()
    await deps.redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT',  () => stop('SIGINT'))
  return ctl.signal
}
```

K8s `terminationGracePeriodSeconds: 30` 과 정합. Edge 런타임(Workers)은 자체적으로 `event.waitUntil`로 완료 보장 → 별도 구현 불요.

## 10. Configuration (zod)

```ts
// infrastructure/config.ts
import { z } from 'zod'

const Schema = z.object({
  NODE_ENV: z.enum(['development','test','staging','production']),
  RUNTIME: z.enum(['node','edge']).default('node'),
  PORT: z.coerce.number().int().default(8080),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KMS_PROVIDER: z.enum(['aws','local']).default('aws'),
  KMS_KEY_ID: z.string().min(1),
  TOSS_SECRET_KEY: z.string().min(10),
  TOSS_CLIENT_KEY: z.string().min(10),
  TOSS_WEBHOOK_SECRET: z.string().min(10),
  JUSO_API_KEY: z.string().min(10),
  EXIM_AUTH_KEY: z.string().min(10),
  JWT_ISSUER: z.string().url(),
  JWT_JWKS_URL: z.string().url(),
  CORS_ALLOW_ORIGINS: z.string().default(''),        // csv
  RATE_LIMIT_DEFAULT_RPS: z.coerce.number().default(50),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug','info','warn','error']).default('info'),
  SHUTDOWN_GRACE_MS: z.coerce.number().default(25_000),
})
export type Config = z.infer<typeof Schema>
export const loadConfig = (): Config => Schema.parse(process.env)
```

로드 실패 = 프로세스 즉시 종료 (fail-closed). 시크릿은 Doppler/1Password에서 주입, 코드는 `process.env`만 본다.

## 11. 배포

### 11.1 Docker Compose (dev/staging)

```yaml
# services/gateway/docker-compose.yml
services:
  gateway:
    build: .
    image: opencheckout/gateway:${TAG:-dev}
    ports: ["8080:8080"]
    env_file: .env
    depends_on: [postgres, redis]
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/readyz"]
      interval: 10s
      timeout: 3s
      start_period: 20s
  postgres:
    image: postgres:15
    environment: [POSTGRES_PASSWORD=dev]
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
volumes: { pgdata: {} }
```

### 11.2 Fly.io

```toml
# fly.toml
app = "opencheckout-gateway"
primary_region = "nrt"
[build]
  dockerfile = "Dockerfile"
[env]
  RUNTIME = "node"
  PORT    = "8080"
[[services]]
  internal_port = 8080
  protocol = "tcp"
  [[services.ports]]
    port = 443
    handlers = ["tls","http"]
  [[services.http_checks]]
    path = "/healthz"
    interval = "10s"
    timeout = "2s"
  [[services.checks]]
    path = "/readyz"
    interval = "5s"
    grace_period = "20s"
[deploy]
  strategy = "bluegreen"
  wait_timeout = "5m"
[vm]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 1024
```

### 11.3 Kubernetes Helm `values.yaml`

```yaml
image:
  repository: ghcr.io/opencheckout/gateway
  tag: ""                  # set by CI
  pullPolicy: IfNotPresent
replicaCount: 3
service:
  type: ClusterIP
  port: 80
  targetPort: 8080
resources:
  requests: { cpu: 500m, memory: 512Mi }
  limits:   { cpu: 2,    memory: 1Gi }
probes:
  liveness:  { path: /healthz, initialDelaySeconds: 10, periodSeconds: 10 }
  readiness: { path: /readyz,  initialDelaySeconds: 5,  periodSeconds: 5  }
terminationGracePeriodSeconds: 30
strategy:
  type: RollingUpdate
  rollingUpdate: { maxSurge: 25%, maxUnavailable: 0 }
hpa:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 60
podDisruptionBudget:
  minAvailable: 2
env:
  - { name: DATABASE_URL, valueFrom: { secretKeyRef: { name: gw-secrets, key: db } } }
  - { name: OTEL_EXPORTER_OTLP_ENDPOINT, value: http://otel-collector:4318 }
```

배포 순서 (zero-downtime, review 차원 10 해소):
1. DB migration은 **expand → deploy code → contract** 3-phase.
2. bluegreen 또는 rolling with `maxUnavailable=0`.
3. CI에서 `oasdiff breaking` 차단, `Spectral` lint pass.
4. Canary: 5% → 25% → 100%, 각 단계 SLI (`p95_confirm_ms`, `5xx_rate`) green 확인.
5. Rollback SOP: `helm rollback gateway <rev>` + DB contract 단계는 되돌리지 않음 (expand 단계가 backward-compat 보장).

## 12. Observability (OpenTelemetry)

```ts
// infrastructure/otel.ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter }  from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes as R } from '@opentelemetry/semantic-conventions'

export const startOtel = (cfg: Config) => {
  const sdk = new NodeSDK({
    resource: new Resource({
      [R.SERVICE_NAME]: 'opencheckout-gateway',
      [R.SERVICE_VERSION]: process.env.GIT_SHA ?? 'dev',
      [R.DEPLOYMENT_ENVIRONMENT]: cfg.NODE_ENV,
    }),
    traceExporter: new OTLPTraceExporter({ url: `${cfg.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` }),
    metricExporter: new OTLPMetricExporter({ url: `${cfg.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics` }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  })
  sdk.start()
  return sdk
}
```

**필수 계측**:
- HTTP server span: `http.route`, `tenant.id`, `request.id`.
- DB span: `db.statement` (sanitized), `db.system=postgresql`.
- 커스텀 메트릭: `payments.confirm.duration` (histogram), `outbox.lag.seconds` (gauge), `idem.hit_ratio` (counter), `toss.call.duration{outcome}` (histogram).
- Log correlation: pino + `trace_id`/`span_id` injection. 구조화 JSON만.

## 13. 성능 목표 (SLO)

| 지표 | 목표 | 측정 |
|---|---|---|
| `POST /v1/payments/confirm` p95 | **≤ 800ms** | server-timing + Toss span |
| `POST /v1/payments/confirm` p99 | ≤ 1500ms | 동 |
| `GET /v1/public/orders/:id` p95 (edge) | ≤ 80ms | edge log |
| Throughput per Node pod | **≥ 500 RPS** | k6 smoke, 2 vCPU / 1GB |
| Outbox end-to-end lag p95 | ≤ 10s | `outbox.lag.seconds` |
| Error budget (5xx) | ≤ 0.1% /30d | SLO burn alert 14×1h + 6×6h |
| Cold start (Edge) | ≤ 50ms | Workers metric |

부하 시험 프리셋: k6 `ramping-arrival-rate` 0→500 RPS over 2m, hold 10m. PR 병합 전 staging 벤치 green 필수.

## 14. Consequences

**Pros**
- Edge/Node 단일 코드베이스로 지연·IP allowlist 요구를 동시 충족.
- 미들웨어 순서 고정 → 감사·RLS·멱등 빠짐 불가능.
- RLS + per-tenant DEK로 멀티테넌시 격리(차원 12) 상당 부분 해소.
- Outbox + LISTEN/NOTIFY로 exactly-once-effect 전달, Kafka 도입 전 V1 단순성.
- Hexagonal로 Toss/JUSO/KMS 벤더 교체 비용 국지화(ADR-001과 정합).

**Cons / Trade-offs**
- Edge에서 pg driver 불가 → 공개 조회는 read-model을 별도 저장소(Workers KV/D1 또는 CDN cache)로 복제해야 함. 본 TDD는 "Edge는 조회 전용 + Node API 경유 허용" 2안을 모두 허용, Phase 1은 후자.
- LISTEN/NOTIFY는 단일 PG 한정. 멀티리전 쓰기는 V2에서 Kafka로 이관.
- RLS 세션변수 누락 시 데이터 유출 → `tenancy` 미들웨어 누락을 CI로 차단 (integration test: 해당 미들웨어 제거 시 모든 쿼리 empty).

## 15. Implementation Checklist

- [ ] `pnpm create hono` 기반 스캐폴딩, `src/` 레이아웃 고정.
- [ ] `depcruise`, `eslint-plugin-boundaries` 규칙으로 도메인→어댑터 방향 강제.
- [ ] 10개 테이블 마이그레이션 (sqitch 또는 node-pg-migrate), RLS 정책·audit 해시체인 포함.
- [ ] 미들웨어 9종 + `rfc7807` 에러 핸들러 + `AppError` 카탈로그 stub.
- [ ] `TossClient` (서명·재시도·circuit breaker), `JusoClient`, `AwsKmsCrypter`.
- [ ] `OutboxDispatcher` + NOTIFY 트리거, distributed lock.
- [ ] Cron 5종, Redis 분산락.
- [ ] `/healthz`, `/readyz`, `wireShutdown`, SIGTERM smoke test.
- [ ] `tsup` 듀얼 빌드 + Workers 전용 번들 분리, CI에서 Node import 차단 테스트.
- [ ] k6 부하 시험 500 RPS 확인, OTel dashboard 제공.
- [ ] Helm chart, fly.toml, docker-compose 3종 배포 산출물.
- [ ] Runbook: 배포·롤백·outbox dead letter 수습·RLS 누락 alert.

## 16. Open Questions

1. **Edge 공개 조회 캐시 소스**: Workers KV vs Node API 프록시. V1은 프록시로 단순화, V2는 projection replicator 검토.
2. **Audit 해시체인 스토리지**: audit_log가 append-only지만 per-tenant 파티션/보존기간 정책은 ADR-007에서 확정.
3. **멀티리전**: 현 TDD는 단일 리전(nrt) 전제. 리전간 outbox 복제는 V2 Kafka 이관과 같이 설계.
4. **mTLS terminator**: 머천트 mTLS는 Fly proxy/K8s ingress 중 어디서 종결할지 — 인증서 rotation 운영성 평가 필요.
5. **Idempotency replay와 authz 순서**: extract-gate-replay 2-phase 방식으로 결정했으나 구현체는 `Idempotency-Key`가 없을 때 500이 아니라 명확히 400으로 떨어지도록 테스트 잠그기.
6. **Edge runtime에서의 Toss 호출 금지 규칙**을 lint rule로 만들 것 (`no-restricted-imports` + 경로 기반).
