# ADR-010: Error Contract and i18n

- **Status**: Proposed
- **Date**: 2026-04-23
- **Deciders**: OpenCheckout Platform, API Guild, Localization
- **Related**: PRD §5-6, §5-10, §7-3, §9; Review 차원 13

## Context

OpenCheckout은 머천트 프론트엔드, 서버사이드 통합자, AI 에이전트가 소비하는 public HTTP API. PRD §5-6/§5-10은 ad-hoc 에러 shape (`{message: "..."}`, 혼합 status code, 한국어 only)이 (a) 클라이언트 retry 로직 깨뜨리고 (b) 엔드 바이어 i18n 깨뜨리고 (c) 내부 stack trace 유출함을 경고. §7-3는 observability 상관(`requestId`), §9는 모든 user-visible 문자열 ko/en/ja 필수. Review 차원 13은 에러 식별자를 엔드포인트 경로만큼 안정적이어야 함을 요구 — breaking change는 SemVer-major.

## Decision

**RFC 7807 Problem Details + OpenCheckout 확장**. 단일 registry(`errors.yaml`)가 타입/문서/i18n 번들 생성.

### 1. Response schema

`Content-Type: application/problem+json`

```json
{
  "type": "https://docs.opencheckout.dev/errors/address/invalid-postal",
  "title": "Invalid postal code format",
  "status": 422,
  "detail": "Korean postal code must be 5 digits",
  "instance": "/v1/addresses",
  "code": "address.validation.postal_format",
  "category": "validation",
  "retryable": false,
  "userMessage": {
    "ko": "우편번호는 5자리 숫자여야 합니다",
    "en": "Postal code must be 5 digits",
    "ja": "郵便番号は5桁で入力してください"
  },
  "docUrl": "https://docs.opencheckout.dev/errors/address/invalid-postal",
  "requestId": "req_01HX...",
  "cause": {
    "code": "external.kpost.lookup_failed",
    "source": "kpost-adapter",
    "detail": "upstream 503",
    "requestId": "req_01HX...a"
  }
}
```

Required: `type`, `title`, `status`, `code`, `category`, `retryable`, `userMessage`, `docUrl`, `requestId`. Optional: `detail`, `instance`, `cause`, `errors[]`.

### 2. Error code rules

Format: `{domain}.{subdomain}.{reason}` — lowercase, snake_case, max 3 segments, ASCII only.

- **Stable**: public contract. 코드 추가 **minor**, rename/remove **major**.
- **Unique**: 코드 → `type` URL + HTTP status 1:1.
- **Additive**: `cause` 필드 추가 / `userMessage` 로케일 추가는 non-breaking.

### 3. Category enum

`validation | authentication | authorization | rate_limit | payment_declined | external_service | server_error | resource_not_found | conflict | compliance_blocker`

Category = coarse 클라이언트 로직 switch (retry, re-auth, surface to buyer, escalate). 세부는 `code`.

### 4. Retryability

- `retryable: true` — 동일 요청이 나중에 성공 가능. `rate_limit`, `external_service` 5xx, `server_error` 502/503/504
- `retryable: false` — `validation`, `authentication`, `authorization`, `payment_declined` (buyer action), `conflict`, `compliance_blocker`
- `retryable: true` 시 `Retry-After` 헤더 필수. Rate-limit은 `X-RateLimit-Reset`도

### 5. HTTP status 매핑

| Status | Category | Typical use |
|---|---|---|
| 400 | validation (malformed) | request unparseable |
| 401 | authentication | missing/invalid credentials |
| 403 | authorization, compliance_blocker | authenticated but forbidden |
| 404 | resource_not_found | unknown id/route |
| 409 | conflict | idempotency clash, optimistic lock |
| 422 | validation (semantic) | well-formed but invalid |
| 429 | rate_limit | throttled |
| 500 | server_error | unhandled |
| 502 | external_service | upstream bad response |
| 503 | external_service, server_error | upstream down |
| 504 | external_service | upstream timeout |

### 6. Error code registry (`errors.yaml`)

SSOT at `services/opencheckout/contracts/errors.yaml`. CI 생성:
- TS union + enum (`packages/sdk/src/errors.generated.ts`)
- Go constants (`pkg/errors/codes.generated.go`)
- OpenAPI `components.schemas.Problem*`
- Docs site `/errors/{domain}/{reason}`
- i18n source bundles for Crowdin

Schema: `code`, `status`, `category`, `retryable`, `title`, `detail_template`, `user_message.ko` (source), `owner`, `since`, `deprecated_in?`, `removed_in?`.

### 7. i18n pipeline

1. 저자가 `user_message.ko` 작성 (source-of-truth)
2. LLM **Generator**가 en/ja 초안 → LLM **Evaluator** style guide/brand glossary 스코어 → 임계 미만 regenerate (max 3)
3. 초안 **Crowdin** `opencheckout-errors` 프로젝트로 → 인간 리뷰
4. 병합된 번역이 PR bot으로 `errors.yaml` 역흐름
5. Runtime fallback: `userMessage[locale] → userMessage.en → title`. 로케일 누락은 요청 실패 X
6. Locale 선택: `Accept-Language`, `?locale=` override

### 8. `cause` chain

`cause`는 upstream 에러를 담는 nested Problem-like 객체. Depth cap 3. `cause.source`가 adapter 식별 (`toss-pg`, `stripe`, `kpost-adapter`). 내부 stack trace/PII는 **절대** `cause`에 넣지 않음 — `requestId` 키 로그만.

### 9. Deprecation

- `deprecated_in: "1.14.0"` + `successor: "<new.code>"` + `sunset` (min 180d)
- 응답에 `Sunset` + `Deprecation` 헤더 (RFC 8594)
- `removed_in`은 major + CHANGELOG migration note

## Example catalog (26개)

| Code | Status | Category | Retryable |
|------|--------|----------|-----------|
| `address.validation.postal_format` | 422 | validation | false |
| `address.validation.country_unsupported` | 422 | validation | false |
| `address.lookup.not_found` | 404 | resource_not_found | false |
| `auth.token.missing` | 401 | authentication | false |
| `auth.token.expired` | 401 | authentication | false |
| `auth.token.invalid_signature` | 401 | authentication | false |
| `auth.scope.insufficient` | 403 | authorization | false |
| `cart.item.out_of_stock` | 409 | conflict | false |
| `cart.item.price_changed` | 409 | conflict | false |
| `cart.idempotency.key_reused` | 409 | conflict | false |
| `checkout.session.expired` | 410 | resource_not_found | false |
| `checkout.session.not_found` | 404 | resource_not_found | false |
| `payment.card.declined` | 402 | payment_declined | false |
| `payment.card.insufficient_funds` | 402 | payment_declined | false |
| `payment.card.3ds_required` | 402 | payment_declined | false |
| `payment.method.unsupported_country` | 422 | validation | false |
| `shipping.rate.unavailable` | 422 | validation | false |
| `shipping.carrier.timeout` | 504 | external_service | true |
| `tax.calculation.upstream_unavailable` | 503 | external_service | true |
| `compliance.sanction.blocked` | 403 | compliance_blocker | false |
| `compliance.age_gate.failed` | 403 | compliance_blocker | false |
| `ratelimit.tenant.exceeded` | 429 | rate_limit | true |
| `ratelimit.endpoint.exceeded` | 429 | rate_limit | true |
| `server.internal.unhandled` | 500 | server_error | false |
| `server.dependency.database_unavailable` | 503 | server_error | true |
| `webhook.signature.invalid` | 401 | authentication | false |

## Testing / CI

- **Registry lint**: `errors.yaml` schema validation (unique codes, valid category, status ∈ allowed)
- **i18n coverage gate**: 모든 active code에 ko/en/ja 존재 CI. `scripts/check-i18n-coverage.ts` PR 실행
- **Contract snapshot**: 각 코드 응답 shape ↔ OpenAPI schema golden test
- **Doc URL reachability**: `type`/`docUrl` 배포 후 smoke 확인
- **Stability test**: 릴리스간 코드 제거/rename은 major 태그 없으면 CI fail

## Consequences

**긍정**: 단일 와이어 포맷, 클라이언트 파서 1개. Stable 코드 → 결정적 retry/alert/support 라우팅. Registry 기반 생성 → SDK/문서/런타임 드리프트 제거. i18n first-class. `cause` + `requestId` 온콜 엔지니어가 내부 유출 없이 추적.

**부정**: Registry가 hot file, code-owners 리뷰 필요. userMessage 번들 payload 증가 — gzip + `?locale=` 요청만 번역 embed로 완화. 기존 엔드포인트는 feature flag 뒤에서 legacy → new code 매핑 migration 필요.

**중립**: Problem Details 비친숙 — SDK가 `OpenCheckoutError` 타입 wrapper로 raw JSON 숨김.

## Checklist

- [ ] `contracts/errors.yaml` seed 20+ entries
- [ ] Codegen TS/Go/OpenAPI/docs
- [ ] Crowdin 프로젝트, Generator/Evaluator 프롬프트 커밋
- [ ] 런타임 미들웨어가 Problem Details + `requestId` emit
- [ ] `Retry-After` 전 retryable 응답
- [ ] i18n coverage CI gate
- [ ] 문서 사이트 `/errors/{domain}/{reason}` 렌더
- [ ] SDK `OpenCheckoutError` 타입 wrapper 퍼블리시
- [ ] Deprecation 헤더 (`Sunset`, `Deprecation`)
- [ ] Runbook: 신규 에러 코드 추가 방법

## Open Questions

1. `userMessage` 전 3 로케일 vs negotiated + `en` 폴백? (→ 후자 leaning, payload 절약)
2. `errors[]` (RFC 7807 확장) 필드 레벨 validation 채택 vs flat? → `validation` category만
3. AI 에이전트 소비자에게 retry semantics 노출 — body에 `retryAfterSeconds` mirror?
4. Source-of-truth locale 한국어 오늘 — en-first 글로벌 런치 시 Generator/Evaluator 방향 전환 (product call)
5. `compliance_blocker` `detail` 노출 — 규제 "no-tipping-off" 충돌 (legal review)

## Sources

- RFC 7807 — Problem Details for HTTP APIs
- RFC 8594 — Sunset header
- Stripe — Error codes
- AWS — Error handling best practices
