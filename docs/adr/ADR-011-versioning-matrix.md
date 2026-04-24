# ADR-011: Versioning Matrix (API Date / SDK SemVer / Webhook Schema)

- **Status**: Accepted
- **Date**: 2026-04-23
- **Deciders**: Platform API Guild, DX, Merchant Success
- **References**: PRD §13, PRD §8-4 (GraphQL Phase 2), review 차원 15, Stripe API Versioning, GraphQL Inspector, RFC 8594 (Sunset)

## Context

OpenCheckout는 3개의 독립 소비 surface를 노출:

1. **REST API** — **날짜** 버전 (Stripe-style), 헤더 기반
2. **SDKs** (TS/Python/Go/Ruby/PHP) — **SemVer**, 각 릴리스가 default API date pin
3. **Webhooks** — **schema tag** (`v1`, `v2`, ...), API date range와 결합

GraphQL surface (Phase 2)는 additive-only, GraphQL Inspector 관리.

머천트는 각 축을 독립적으로 업그레이드 가능해야 함. Breaking change는 pinned 머천트를 절대 surprise 금지. 지원 window **≥12개월 per API date**, 월간 릴리스 cadence.

## Decision

**3-axis 버전 매트릭스** + 단일 SSOT (`/versions.json`) + 축 간 결정적 매핑.

### 1. 3축 동기화

```
┌──────────────────┐    pins default    ┌──────────────────┐
│  SDK SemVer      │ ─────────────────▶ │  API date        │
│  (e.g. 1.4.2)    │  (override via hdr)│  (e.g. 2026-04)  │
└──────────────────┘                    └──────────────────┘
                                                 │
                                                 │ emits
                                                 ▼
                                        ┌──────────────────┐
                                        │ Webhook schema   │
                                        │ (v1, v2, ...)    │
                                        └──────────────────┘
```

- **SDK → API date**: 각 SDK 릴리스가 default `OpenCheckout-Version` 헤더 embed; 호출자가 per-request override 가능
- **API date → Webhook schema**: 각 API date가 정확히 하나의 webhook schema range에 속함; 머천트가 subscription 생성 시 다른 `api_version` pin 가능
- **단일 registry**: `/versions.json` canonical mapping, build-time 생성, SDK codegen/docs/gateway 소비

### 2. API date 버저닝

**헤더**: `OpenCheckout-Version: 2026-04-23`

- **Format**: ISO date. 월간 릴리스, 첫째 목요일. 비었으면 (변경 없음 → 릴리스 없음)
- **Support window**: **≥12개월**. End-of-life ≥180일 사전 공지
- **Adopt rule (Stripe parity)**:
  - 헤더 누락 시 → 머천트 계정 pin (등록 당시 버전) 적용
  - 헤더 공급 시 → 존중 (support window 내, 초과 시 `410 Gone` + `Sunset` 헤더)
  - 계정 pin 업그레이드는 Dashboard 명시적 액션 + **72시간 롤백 윈도**

**응답 헤더** (every API call):
- `OpenCheckout-Version: 2026-04-23` (resolved)
- `OpenCheckout-Version-Default: 2026-04-23` (account pin)
- `Sunset: Sat, 23 Oct 2027 00:00:00 GMT` (RFC 8594) — deprecation window 시

### 3. SDK SemVer

| Bump | Trigger |
|------|---------|
| major | Breaking API contract, removed method, signature 변경 |
| minor | Additive: 새 메서드, 새 optional param, 새 API date pinned |
| patch | Bug fix, retry 로직, non-contract 변경 |

- SDK가 default API date를 compile-time 상수로 embed; per-client (`new OpenCheckout({ apiVersion: '2026-05-01' })`) 또는 per-request override
- Default API date bump = **minor** (caller 관점 additive, 기존 pin 유지)
- Deprecated date 강제 migration = **major**

### 4. Webhook schema

- Schema tag: `v1`, `v2`, ... `/versions.json`에서 API date range 매핑
- Endpoint 생성 시 머천트가 `api_version` (ISO date) 지정 가능. 기본은 계정 pin
- 계정 레벨 업그레이드는 기존 webhook endpoint를 **자동 migrate 하지 않음** (idempotency 보존)
- Payload envelope에 항상 `"api_version": "2026-04-23"` 포함 → consumer 라우팅

### 5. GraphQL (Phase 2)

- **Additive-only** schema evolution. Default schema breaking change 없음
- Deprecated fields는 `@deprecated(reason: "...", sunset: "2027-04-23")`
- **Sunset = 180일 minimum** (REST보다 짧음, additive 가능성 높음)
- CI gate: **graphql-inspector**가 `BREAKING` diff ADR 예외 없으면 차단

### 6. Breaking-change 분류

| Class | Examples | Axis impact |
|-------|----------|-------------|
| **Safe** | 응답에 새 필드, 요청에 새 optional 필드, output enum 새 값 | Minor SDK, 동일 API date |
| **Deprecation** | 필드 deprecated 마킹, input enum 값 제거, endpoint 대체 | 12개월 grace, Sunset 헤더 |
| **Breaking** | 타입 변경, 필수 필드 추가, 의미 변경, output enum 값 제거 | 새 API date, major SDK, 새 webhook schema tag |

Rule: 필수 요청 필드 추가는 **항상 breaking** — "server-side defaulted"이어도 SDK 타입이 변경됨.

### 7. CI 게이트

- **REST**: `oasdiff breaking --fail-on ERR prev.yaml new.yaml`
- **GraphQL**: `graphql-inspector diff schema-prev.graphql schema-new.graphql --rule considerUsage`
- **Webhook**: JSON Schema diff via `json-schema-diff-validator` on `schemas/webhooks/*.json`
- **Registry lint**: `/versions.json` 해결 가능성 — 모든 API date가 정확히 1 webhook schema 매핑, 모든 SDK 릴리스가 유효 API date 지칭

Breaking diff + 새 API date 없음 + ADR 링크 없음 → CI red.

### 8. Codemod

`@opencheckout/codemods` (각 major SDK 릴리스에 동봉).

```js
// codemods/2026-10-01-charge-source-to-pm.js
module.exports = function (file, api) {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.MemberExpression, { property: { name: 'source' } })
    .filter(p => /charge/i.test(p.node.object.name || ''))
    .replaceWith(p => j.memberExpression(p.node.object, j.identifier('payment_method')))
    .toSource();
};
```

Invocation: `npx @opencheckout/codemods 2026-10-01 ./src`.
모든 major API date는 최소 1개 codemod 출시. 기계 변환 불가 시 릴리스 노트에 "manual" 명시.

### 9. Deprecation 4채널 동시 공지

1. **Runtime**: `Sunset: <RFC 1123 date>` + `Deprecation: true` + `Link: <changelog>; rel="deprecation"`
2. **SDK logs**: deprecated method 최초 사용 시 console warning per process
3. **Changelog**: `CHANGELOG.md` + `/changelog` 페이지 `### Deprecated` 섹션
4. **Email**: 머천트 계정 owner + billing contact에 T-180d, T-90d, T-30d, T-7d 자동 발송

### 10. 버전 매핑 테이블 (`/versions.json` 발췌)

| API date | SDK range | Webhook schema | Released | EoL |
|----------|-----------|----------------|----------|-----|
| 2026-04-23 | 0.1.x – 0.5.x | v1 | 2026-04-23 | 2027-04-23 |
| 2026-07-01 | 0.6.x – 0.9.x | v1 | 2026-07-01 | 2027-07-01 |
| 2026-10-01 | 1.0.x – 1.4.x | v2 | 2026-10-01 | 2027-10-01 |
| 2027-01-15 | 1.5.x – 1.9.x | v2 | 2027-01-15 | 2028-01-15 |

`v1 → v2` webhook 전환은 post-GA 최초 breaking change(2026-10-01)와 동조.

### 11. 공존 구현 — Version Handler 패턴

```ts
// gateway/version-router.ts
interface VersionHandler {
  date: string;                          // '2026-04-23'
  applyRequest(req: InternalReq): InternalReq;
  applyResponse(res: InternalRes): InternalRes;
}

const HANDLERS: VersionHandler[] = [
  require('./handlers/2026-04-23'),
  require('./handlers/2026-07-01'),
  require('./handlers/2026-10-01'),
].sort((a, b) => a.date.localeCompare(b.date));

export function handle(req, merchant) {
  const requested = req.header('OpenCheckout-Version') ?? merchant.pinnedVersion;
  assertSupported(requested);

  const forward = HANDLERS.filter(h => h.date > requested);
  let internal = forward.reduce((r, h) => h.applyRequest(r), req.body);

  const rawRes = core.execute(internal);

  const backward = [...forward].reverse();
  let out = backward.reduce((r, h) => h.applyResponse(r), rawRes);

  return withVersionHeaders(out, requested, merchant.pinnedVersion);
}
```

각 handler 파일은 **pure, additive, 릴리스 후 절대 수정 금지**. Handler 제거는 API date EoL + 어느 머천트도 pinning 안 함 (account-pin 테이블 deploy check) 보장 후.

## Consequences

**긍정**: 머천트가 SDK/API/webhook 독립 업그레이드. 12개월 window + 72h 롤백으로 low-risk. CI 게이트로 accidental break 방지. Handler chain이 old shape bit-for-bit 보존, 소급 수정 없음.

**부정**: Handler chain 단조 증가, pruning은 EoL + zero-pin 필요. `/versions.json` 배포 critical path. Email deprecation 파이프라인 지원 부담 (verified owner contact 필요). Codemod 매 major 의무.

**위험**: 머천트가 업그레이드 안 하고 4채널 무시 후 EoL 도달 → 30일 hard stop 후 `410 Gone` 강제 migration. Account pin ↔ endpoint pin drift → payload `api_version` 항상 포함으로 커버.

## Checklist (API 변경 PR)

- [ ] OpenAPI / GraphQL / JSON schema snapshot 업데이트
- [ ] `oasdiff` / `graphql-inspector` / JSON schema diff 통과 또는 새 API date
- [ ] 새 API date면 `/versions.json` entry 추가
- [ ] Codemod 작성 (또는 "manual migration" 릴리스 노트 justified)
- [ ] Deprecated path에 Sunset 헤더 와이어드
- [ ] Changelog `### Added / ### Deprecated / ### Removed` 채움
- [ ] Email 템플릿 큐 (deprecation)
- [ ] Version handler 파일 추가 `gateway/handlers/<date>.ts` + round-trip 테스트 green

## Open Questions

1. Per-endpoint override (path prefix `/v2026-10-01/charges`) — Stripe 헤더-only 충분?
2. Webhook replay cross schema version — 원본 `api_version` vs 현재?
3. GraphQL persisted queries — API date pin vs 실행 시 계정 pin?
4. SDK auto-upgrade 텔레메트리 (API date 수집) — privacy 수용 가능?
5. 변경 없는 월 empty date entry vs skip?

## Sources

- https://stripe.com/blog/api-versioning
- https://docs.stripe.com/upgrades
- https://docs.stripe.com/api/versioning
- https://brandur.org/api-upgrades
- https://github.com/kamilkisiela/graphql-inspector
