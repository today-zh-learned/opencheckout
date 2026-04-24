# Architecture Decision Records (ADR)

OpenCheckout의 기술 결정 기록. MADR 포맷 기반. PRD v0가 제품 스코프를 정의하고, 이 ADR들이 **cross-cutting 기술 결정**을 정의한다.

| # | 제목 | 우선순위 | 상태 |
|---|---|---|---|
| [ADR-001](./ADR-001-hexagonal-and-aggregates.md) | Hexagonal layering & aggregate boundaries | 🟠 Phase 1 | Accepted |
| [ADR-002](./ADR-002-idempotency-and-saga.md) | Idempotency, Saga, effectively-once semantics | 🔴 **블로커** | Proposed |
| [ADR-003](./ADR-003-threat-model-stride.md) | Threat model (STRIDE) | 🔴 **블로커** | Proposed |
| [ADR-004](./ADR-004-authn-authz.md) | Authn/Authz (API key / JWT / mTLS / scopes) | 🔴 **블로커** | Proposed |
| [ADR-005](./ADR-005-multi-tenancy.md) | Multi-tenancy isolation (RLS + per-tenant KMS DEK) | 🟠 Phase 1 | Proposed |
| [ADR-006](./ADR-006-observability-slo.md) | Observability, SLI/SLO, audit log integrity | 🟠 Phase 1 | Accepted |
| [ADR-007](./ADR-007-dr-and-ir.md) | Disaster Recovery & Incident Response | 🔴 **블로커** | Accepted |
| [ADR-008](./ADR-008-supply-chain-security.md) | Supply-chain security (SLSA L2, SBOM, Sigstore) | 🟠 Phase 1 | Proposed |
| [ADR-009](./ADR-009-pii-gdpr-lifecycle.md) | PII / GDPR lifecycle (DSAR, crypto-shred, cross-border) | 🔴 **블로커** | Accepted |
| [ADR-010](./ADR-010-error-contract-i18n.md) | Error contract (RFC 7807) + i18n | 🟠 Phase 1 | Proposed |
| [ADR-011](./ADR-011-versioning-matrix.md) | API / SDK / Webhook versioning matrix | 🟡 Phase 1 중 | Accepted |
| [ADR-012](./ADR-012-high-risk-flows.md) | High-risk flow sequences (7 races) | 🟠 Phase 1 | Accepted |
| [ADR-013](./ADR-013-concurrency-and-locking.md) | Concurrency & locking strategy | 🟡 Phase 1 중 | Proposed |
| [ADR-014](./ADR-014-data-integrity.md) | Data integrity (hash chain, HMAC, SRI, WORM) | 🟠 Phase 1 | Accepted |
| [ADR-015](./ADR-015-automated-e2e-testing.md) | Automated E2E testing (pyramid, synthetic, chaos) | 🟠 Phase 1 | Accepted |
| [ADR-016](./ADR-016-reliability-engineering.md) | Reliability (circuit breakers, bulkheads, feature flags, progressive delivery) | 🟠 Phase 1 | Accepted |
| [ADR-017](./ADR-017-security-testing-and-assurance.md) | Security testing & assurance pipeline (SAST/DAST/pen test/bug bounty/PCI/SOC2) | 🟠 Phase 1 | Accepted |
| [ADR-018](./ADR-018-engineering-blueprint.md) | **Engineering blueprint** (gstack + BigTech + Karpathy, 과대스코프 방지 메타 ADR) | 🔴 P0 | Accepted |
| [ADR-019](./ADR-019-cross-adr-normalization.md) | **Cross-ADR normalization** (상태 vocab / TTL / 보관기간 / 네임스페이스 단일화) | 🔴 P0 | Accepted |

**우선순위 범례**:
- 🔴 **블로커**: 구현 착수 전 반드시 확정 필요
- 🟠 Phase 1: Phase 1 구현 착수와 동시 확정
- 🟡 Phase 1 중: Phase 1 진행 중 확정 가능

## Related Tech Design Docs

| # | 제목 |
|---|---|
| [TDD-01](../tdd/TDD-01-gateway-design.md) | Gateway (Hono) 상세 설계 — 런타임 경계, 미들웨어, DB 스키마, 배포 |
| [TDD-02](../tdd/TDD-02-event-sourcing-rebuild.md) | Event sourcing + projection rebuild 플레이북 |
| [spec/openapi.yaml](../../spec/openapi.yaml) | OpenAPI 3.1 SSOT — 5 primitive endpoints, AIP-132/134/136, Problem Details, x-webhooks (1070줄, 2026-04-24) |
| [plan/phase1-plan.md](../../plan/phase1-plan.md) | Phase 1 Implementation Plan — 12주 1인 메인테이너 스케줄, M1/M2/M3 게이트, DoD (2026-05-01~07-31) |

## ADR-019 정규화 현황 (2026-04-24)

12개 ADR에 `Last normalized: 2026-04-24 (ADR-019)` 적용 완료. 패치 범위: PaymentStatus canonical enum, late-webhook guard-first, TTL 3축 분리, 보관기간 (신정법 3개월·상법 10년·전상법 5년 추가), namespace (OC-Signature), PII DEK / Audit DEK 분리 명시, SLO v1 하향, AddressSnapshot non-propagation, PCI SAQ A→A-EP, KR breach 이중 SLA, Safe Harbor 민사 한정.

## 리뷰 리포트

| | |
|---|---|
| [research/08-technical-review.md](../../research/08-technical-review.md) | PRD v0 기술 관점 적대적 리뷰 (17 차원 감사) |

## 주요 상호 참조 관계

```
ADR-001 (Hexagonal) ──┬── ADR-005 (Multi-tenancy RLS)
                      ├── TDD-01 (Gateway 배치)
                      └── TDD-02 (Projection 배치)

ADR-002 (Idempotency/Saga) ─┬── ADR-012 (Refund/Webhook races)
                            ├── ADR-013 (Locking 상호작용)
                            └── TDD-02 (Projection dedup)

ADR-003 (STRIDE) ──┬── ADR-004 (Authn/Authz 세부)
                   ├── ADR-008 (Supply chain)
                   └── ADR-014 (Tampering 매핑)

ADR-005 (Multi-tenancy) ──── ADR-009 (per-tenant DEK)
                                    │
ADR-006 (Observability) ──┬── ADR-014 (Audit hash chain 구현)
                          └── ADR-007 (Incident alerting)

ADR-007 (DR/IR) ──┬── ADR-009 (Breach notification 72h)
                  └── ADR-014 (WORM + backup integrity)

ADR-009 (PII) ──── ADR-014 (rawResponseHash 무결성)

ADR-011 (Versioning) ──── ADR-010 (Error code stability)
```

## PRD Open Question 해소 현황

| PRD Q# | 주제 | 해소 ADR |
|---|---|---|
| Q6 | 한국 주민등록번호 배제 | ADR-009 §9 (완전 차단 확정) |
| Q17 | rawResponse 보관 vs erasure 충돌 | ADR-009 §3 (2년 pseudonymize + DSAR 삭제) |
| Q18 | PII 암호화 공급자 | ADR-005 (KMS 어댑터 인터페이스), ADR-009 (키 계층) |
| Q19 | Canonical Record 공개 범위 | ADR-004 (`address:internal:read` scope) |
| Q23 | 제재국 blocklist | ADR-003 §5-2 SSRF + compliance 매핑 |
| Q35 | 이벤트 버스 default | TDD-02 (Postgres outbox + LISTEN/NOTIFY) |
| Q38 | Read-model 저장소 | TDD-02 (read replica + OpenSearch 90일) |
| Q41 | Gateway Node vs Edge | TDD-01 §1 (경계 확정) |

나머지 Open Questions는 제품 범위 결정(PRD)으로 남음.
