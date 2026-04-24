# PRD v0 기술 관점 적대적 리뷰 (red-team)

source: reviewer agent, 2026-04-23

**Verdict**: **Request changes**. "product discovery + domain research 문서"로는 우수. "기술 PRD"로는 상위 10건 중 최소 6건(1, 2, 4, 5, 7, 9)이 채워지기 전 구현 착수 비권고.

## 차원별 등급

| 차원 | 등급 | 핵심 누락 |
|---|---|---|
| 1. 클린 아키텍처 / 도메인 분리 | 🟡 | Hexagonal 용어 부재, aggregate 경계 미정, Canonical Record가 도메인/DB/API 3역 |
| 2. STRIDE 위협 모델 | 🔴 | CSRF·SSRF·XSS·timing·header smuggling·replay·brute-force 전무 |
| 3. 인증/인가 | 🔴 | 머천트↔Gateway 스킴 미정, JWT 알고리즘/JWKS 없음, mTLS 없음 |
| 4. 멱등성 깊이 | 🔴 | 저장소·TTL·payload hash·saga·webhook replay·projection dedup 전무 |
| 5. 동시성/경쟁조건 | 🔴 | 낙관적 잠금 ETag/If-Match 없음, 분산락 없음, read-after-write 없음 |
| 6. 장애·부분실패 | 🟡 | Circuit breaker 없음, retry budget 없음, timeout 표 없음 |
| 7. 관측성 | 🔴 | SLI/SLO 숫자 없음, tamper-evident audit 없음, correlation-id 전파 규칙 없음 |
| 8. 데이터 일관성 | 🟡 | Event schema evolution·projection rebuild 절차 없음 |
| 9. 재해 복구 | 🔴 | RTO/RPO 0자, breach 72h playbook 없음, key loss 없음 |
| 10. 배포/릴리스 | 🟡 | Zero-downtime migration·canary·rollback SOP 없음 |
| 11. 공급망 보안 | 🔴 | npm 2FA·provenance·SBOM·socket.dev·lockfile policy 없음 |
| 12. 멀티테넌시 | 🟡 | Postgres RLS 없음, per-tenant KMS DEK 없음, quota 없음 |
| 13. 에러 핸들링 | 🔴 | 에러 카탈로그 자체 없음, RFC 7807 미사용, i18n 파이프라인 없음 |
| 14. PII/GDPR 실무 | 🟡 | DSAR·crypto-shred·cross-border 없음, rawResponse 무기한 보관과 erasure 충돌 |
| 15. API 호환성 | 🟡 | webhook/SDK/GraphQL 버저닝 동조 규칙 없음 |
| 16. 접근성 | 🟡 | axe-core 자동화·RTL·스크린리더 매트릭스 없음 |
| 17. 고위험 경로 | 🔴 | 환불 재입금·복수 웹훅·주소 변경·관세 만료 시나리오 전무 |

## 반드시 보완해야 할 상위 10건 (심각도 순)

1. STRIDE 위협 모델 문서 — 결제 SDK 공개 전 필수
2. 멱등성 전체 설계 (저장소·TTL·payload-hash·saga·webhook replay·consumer dedup)
3. 재해복구 + 유출 대응 (RTO/RPO/breach 72h)
4. 인증/인가 ADR (API key·JWT·mTLS·JWKS rotation·scope)
5. 공급망 보안 (npm 2FA + provenance + SBOM + socket.dev)
6. 에러 카탈로그 + RFC 7807 + i18n 매핑
7. 멀티테넌시 격리 (RLS·per-tenant KMS DEK·quota)
8. 동시성/경쟁조건 매트릭스 (낙관/비관·advisory lock·read-after-write)
9. PII/GDPR 실무 (DSAR·crypto-shred·cross-border·rawResponse 충돌 해결)
10. 관측성 SLO/SLI + tamper-evident audit log

## 제안 ADR 분리 목록

- ADR-001 Hexagonal layering & aggregate boundaries
- ADR-002 Idempotency and exactly-once (saga 포함)
- ADR-003 Threat model (STRIDE)
- ADR-004 Authn/Authz (API key + JWT + mTLS + scopes)
- ADR-005 Multi-tenancy isolation (RLS + KMS per tenant + quotas)
- ADR-006 Observability (SLI/SLO + tamper-evident audit + correlation-id)
- ADR-007 DR & Incident Response (RTO/RPO/breach)
- ADR-008 Supply-chain security (2FA/provenance/SBOM)
- ADR-009 PII lifecycle (DSAR/erasure/portability/cross-border)
- ADR-010 Error contract & i18n
- ADR-011 API/Webhook/SDK versioning matrix
- ADR-012 High-risk flow sequences (refund, concurrent webhooks, address change post-label, expired duty quote)
- ADR-013 Concurrency & locking strategy
- TDD-01 `services/gateway` detailed design
- TDD-02 Event sourcing + projection rebuild playbook

## 핵심 인용 (리뷰어 원문)

> "Payment PRD가 아닌 'product+shipping' PRD에 가까운 불균형"
>
> "§5-6 `AddressCanonicalRecord`는 DB 스키마이자 도메인 모델이자 API schema — 세 역할 혼재. Anemic model 유발"
>
> "§5-6 `source.rawResponse` 원본 무기한 보관이 default처럼 기술됨 — right to erasure와 **정면 충돌** (Q17에 질문만)"
>
> "결제 데이터를 보관하는 시스템의 DR plan이 0자"
