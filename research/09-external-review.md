# External Expert Review — Consolidated Report

source: 7 parallel reviewer agents, 2026-04-23

**Overall verdict**: **BLOCK — Request Major Changes**. 문서 품질은 상위 10%(Stripe/Adyen 수준)이나 **모든 7명의 리뷰어가 독립적으로 "구현 착수 전 수정 필수"로 판정**. 비즈니스·법률·보안·정합성 전 영역에 블로커 발견.

## 리뷰어 구성 & 판정

| # | 리뷰어 | 판정 | Critical 건수 |
|---|---|---|---|
| 1 | 분산시스템/결제 아키텍트 | Block | 5 |
| 2 | SRE/관측성 | Block | 5 |
| 3 | CPO/제품 | Block Major | 4 |
| 4 | 보안/컴플라이언스 | Block | 4 |
| 5 | OSS 메인테이너/DevEx | Request Changes | 4 |
| 6 | 한국 법률/규제 | Block | 3 (법적 서비스 불가) |
| 7 | Cross-ADR 일관성 | Block | 4 |

---

## Critical 이슈 통합 (중복 제거 후 14건)

### 법률·규제 (즉시 출시 차단)

**L-1. 전자금융거래법 PG 해당성 미판정** [법률]
Hosted Gateway 모드가 "지급결제정보 송신·수신 대행"에 해당하면 전금법 §28 등록 필수. 미등록 운영 시 §49 (3년 이하 징역). 법무법인 의견서 + 금감원 비조치의견서 확보 전 한국 내 Hosted 모드 출시 **불가**.
→ **Self-host-only 모드부터 출시, Hosted는 Phase 2**로 분리

**L-2. 개보법 유출 통지 SLA 이중 의무** [법률]
KISA 24h (정통망법 §48-3) + 개보위 72h (개보법 §34 + 시행령 §39) **이중** 의무. ADR-007 현 표는 5영업일 표기로 **위법**.
→ Sev-1 플레이북 T+24h/T+72h 분리

**L-3. 개인정보 국외이전 동의 UI 부재** [법률]
개보법 §17(3) 8개 항목 고지 + 사전 동의 필수. 현재 Cloudflare 진입 즉시 미국 전송으로 **사후 동의 불가 구조**.
→ 체크아웃 진입 전 pre-consent modal + Cloudflare KR edge 강제

**L-4. Bug Bounty Safe Harbor 정통망법 §48 허위 면책** [법률+보안]
정보통신망법 §48은 형사처벌, 사인 계약으로 면책 불가 (대법원 2011도4894). 현 ADR-017 표현 재작성 필수. 국내 로펌 의견서 없이 공개 금지.
→ "민사 소송·형사고발 제기하지 않음" 한정 표현, HackerOne KR legal template 참조

**L-5. 전자상거래법 청약철회 7일 API 누락** [법률]
전자상거래법 §17(1) 머천트 법정 의무인데 SDK가 침묵 위임. "Awesome 3줄 코드" 공약과 모순.
→ `@opencheckout/payments`에 `refund({reason: 'buyer-cooling-off'})` + 7일 타이머 필수

### 비즈니스 (Block)

**B-1. Phase 1 스코프 3-4배 과대** [CPO]
14 ADR + 2 TDD × 3개월 달성 = 엔지니어 4명 × 9-12개월 분량. Stripe Elements 수준 스펙을 초기 팀으로 불가능.
→ Phase 1 = `core + address + payments + adapters-toss + adapters-juso + widget-vanilla` 6개 패키지로 축소. ADR-005/007/008/013/014/016/017 Phase 2+ 이연

**B-2. 비즈니스 섹션 0%** [CPO]
Business Model / Unit Economics / Funding / Team / GTM / Partnerships / Pricing / Competitive Response / Risk Register / North Star 전무.
→ PRD §0.5 + §14.5–18 신설 (11개 섹션)

**B-3. Toss 공식 파트너십 미확정** [CPO/법률]
Q13 미결 상태로 코드 커밋 시 Toss API 변경/경쟁 리스크 취약. 한국 법인 명의 API 키(Q14) 동시 결정 필요.
→ 코드 착수 전 Toss 영업/DX팀 미팅 + 파트너 티어 확정

**B-4. 타깃 혼재 (한국 셀러 vs 글로벌 셀러)** [CPO/OSS]
§1은 한국발 역직구, §5-4-2는 글로벌 셀러 인프라. Reaction Commerce·Spree Commerce가 이 실수로 소멸.
→ 하나 선택. 권고: "한국 셀러 역직구" 집중

### 아키텍처 정합성 (Block)

**A-1. Order/Payment 상태 vocabulary 3중 분열** [분산시스템/일관성]
PRD `captured` vs ADR-002 `approved` vs Toss `APPROVED`. Guard 로직 이중 진실.
→ `authorized/captured/settled/voided/refunded` canonical enum, Toss는 외부 매핑만

**A-2. Late webhook policy ADR-002 vs ADR-012 반대 결론** [분산시스템]
ADR-002 §9 `last-write-wins` vs ADR-012 Scen 2 `first-writer-wins`. 배송 완료 후 취소 웹훅 처리가 정반대.
→ **transition-guard-first + event_time tiebreaker** 단일 표로 통합

**A-3. Saga Forward-only retry가 Toss 환불 window 미커버** [분산시스템]
6회 재시도 후 DLQ → 외부 포인트 시스템 수일 다운 시 돈/포인트 비대칭 영구화. Idempotency TTL 72h vs 실환불 6개월 충돌.
→ "reserve→commit 2-phase + suspense ledger" 재설계, Saga TTL 최소 7일

**A-4. TTL Matrix 3축 충돌** [분산시스템]
Idempotency(재시도) vs FX/Duty(가격 유효) vs 감사(조회) 단일 매트릭스 → stale replay 버그.
→ 3축 분리, replay response에 snapshot 만료 명시

**A-5. Outbox LISTEN/NOTIFY + PgBouncer transaction pooling 불호환** [분산시스템]
LISTEN은 session-scoped, PgBouncer transaction mode에서 동작 안 함. 60s polling은 p99 위반.
→ outbox listener dedicated direct connection + 1-2s polling + lag metric

### 보안·운영 (Block)

**S-1. PCI SAQ A → SAQ A-EP 재분류 필수** [보안]
OpenCheckout widget이 Toss iframe을 orchestrate → 머천트는 SAQ A-EP. postMessage PAN non-crossing 런타임 enforcement + CI test 필수. 현 주장은 **QSA 실사 즉시 실패**.
→ ADR-003 §1에 SAQ A-EP 명시, 6.4.3/11.6.1 공동 책임

**S-2. SLO 수치가 의존성 상한 초과** [SRE]
99.9% confirm + p95 800ms는 Toss 베이스 SLA 상회. ADR-006 99.95% vs ADR-007 99.9% 자기 충돌.
→ v1 99.5% 선언, 6개월 shadow 후 ratchet. SLO 분모에서 Toss 5xx 제외 수식 명시

### OSS 지속가능성 (Request Changes)

**O-1. "3줄 시작" 공약 깨짐** [OSS]
juso/수출입은행/Google Places/Toss 4개 키 사전 발급 필요. juso/Exim은 한국어 사업자 심사 → 외국 기여자 차단.
→ `@opencheckout/demo-keys` — 법인 명의 4개 키 Cloudflare Workers 중개, fixture replay 기본

**O-2. SLSA L2 + 2인 Publish Y1 불가** [OSS]
1인 메인테이너 현실에서 릴리스 0건. Socket.dev $4K + Snyk $5K + pentest $100K = $130K/yr Y1 불가.
→ pre-GA는 2FA TOTP + npm provenance만, SLSA L2 post-GA 이연. Bug bounty cash는 paid ARR 트리거 뒤

---

## High 이슈 (상위 12건 요약)

| # | 영역 | 이슈 | 조치 |
|---|---|---|---|
| H-1 | 동시성 | Address AddressSnapshot 시점 미확정 → label 발급 후 bump 시 참조 깨짐 | `label.purchased` payload에 immutable snapshot 포함 |
| H-2 | 멱등성 | 4중 Dedup (idempotency/webhook_inbox/projection/saga) GC 비대칭 → cold replay 중복 side-effect | 계층별 책임 매트릭스 + rebuild 전용 bypass flag |
| H-3 | 재무 | Chargeback이 Toss cancels[]에 등장 → ledger reconcile 오탐 | cancels[] 3종 분류(refund/chargeback/adjustment) |
| H-4 | 재무 | FX snapshot 30min 만료 시 모바일 idle 30분+ 전환율 저하 | ±0.5% silent refresh + band 초과만 강제 재확인 |
| H-5 | SRE | Circuit breaker Toss 5fail/30s false positive 피크 시 | rate-based (FAILURE_RATE_THRESHOLD 25%, min 50 calls) |
| H-6 | SRE | Synthetic probe 산술 오류 (288 vs 1728/일) + Toss sandbox 쿼터 리스크 | prod probe 12/hour로 축소, Toss 전용 test tenant 확정 |
| H-7 | SRE | DEK rotation + confirm RTO 30min 호환 불가 | dedicated replica + tenant shard throttling (1/hour) |
| H-8 | 보안 | JTI Redis 장애 fail-open이 공격자 최적 타이밍과 겹침 | fail-closed default, high-risk scope 항상 closed, Postgres mirror |
| H-9 | 보안 | argon2id 100ms hot-path DoS | Two-stage compare, Edge 전용 m=16MB/t=2, short-lived JWT 파생 |
| H-10 | 보안 | ASVS v4 L2 14장 286항목 중 미커버 10+항목 | `docs/assurance/ASVS-L2-evidence.md` trace 매트릭스 |
| H-11 | 법률 | Retention Matrix 법률 근거 오류 (전상법 시행령 §6, 신정법 §17-2/§20-2 미반영) | 목적별 분리 (대금 5년 / 철회 3년 / 불만 3년 / 신정법 분리보관 3개월) |
| H-12 | OSS | Widget 3개 래퍼 + 9개 언어 SDK 유지 불가 | vanilla + React 2개, Python 커뮤니티 인증 프로그램, Go/Java v1.x deferred |

---

## Cross-ADR 정규화 필수 항목

**Namespace 통일**:
- Payment status: `authorized/captured/settled/voided/refunded` (canonical)
- Tenant: SQL `tenant_id`, TS `tenantId`, JSON `tenantId` (no `tid`)
- Correlation: `X-OC-Request-ID` (ULID) + W3C `traceparent` 병행
- Webhook signature: `OC-Signature` (no `X-` per RFC 6648)
- API version: `OpenCheckout-Version: YYYY-MM-DD`
- Response header registry: `X-Idempotency-{Mismatch,Replay,Original-Request-Id}`, `X-Webhook-Duplicate`

**TTL 3축 분리**:
- 재시도 window (Idempotency): confirm 24h, refund 72h→영구 refundId 기반, webhook 30d
- 가격 유효 (snapshot): FX 30m → ±0.5% silent refresh, Duty 15m+재견적
- 조회/감사: 7y WORM audit, 10y 상법 상업장부

**보관 기간 3중 충돌 해소**:
- 결제 원장 10년 (상법 §33)
- 결제 기록 5년 (전상법 시행령 §6)
- 청약철회 3년, 소비자불만 3년
- 신정법 분리보관 3개월
- PII 2년 후 pseudonymize, audit 7년
- rawResponse 원본 2년 후 DEK destroy

**암호화 계층 명시**:
- ADR-005 per-tenant KMS DEK (active→retired→pending-destruction 상태기계, 7-30d grace, 2인 승인)
- ADR-009 subject sub-key (HKDF(DEK, record_id))
- ADR-014 audit DEK 분리 (PII DEK 삭제가 audit chain 손상 불가)

**HMAC 단일 정의**:
- ADR-003이 canonical, ADR-002/004/014 참조만
- 알고리즘: HMAC-SHA256, `timingSafeEqual` 강제

---

## PRD v1 승격 전 필수 작업 (우선순위)

### Tier 0 — 법률·규제 (외부 자문 필요)
1. 법무법인 의견서 + 금감원 비조치의견서 (전금법 PG 해당성)
2. 개보법 유출 통지 SOP (24h/72h)
3. Bug Bounty Safe Harbor 문언 (국내 로펌 검토)
4. 국외이전 동의 UI 법률 검토
5. Retention Matrix 법률 매핑 (전상법/신정법/상법/세법)

### Tier 1 — 비즈니스 결정
6. 타깃 확정 (한국 셀러 역직구 권장)
7. Business Model + Pricing 초안
8. Team & Funding Plan
9. Toss 공식 파트너십 접촉
10. 15명 고객 인터뷰 + 5 LOI + 50 waitlist

### Tier 2 — 아키텍처 정합성
11. Cross-ADR 네임스페이스 정규화 ADR-018 작성
12. Order/Payment canonical state enum 확정
13. Late webhook + chargeback 통합 policy table
14. Saga 2-phase reserve/commit 재설계
15. TTL 3축 분리

### Tier 3 — 보안·운영 수정
16. PCI SAQ A → SAQ A-EP 재분류
17. SLO 하향 + Toss 의존성 carve-out 수식화
18. JTI fail-closed default
19. RLS preventive control (`app_api` BYPASSRLS 부재 CI check)

### Tier 4 — OSS 스코프 축소
20. Phase 1 패키지 6개로 축소
21. SDK 언어: TS only, Python 커뮤니티, Go/Java deferred
22. Widget 래퍼: vanilla + React만
23. Docs 스택: Docusaurus + OpenAPI plugin만 (Scalar/Sandpack/Algolia 연기)
24. Security budget Y1: $130K → $5K (tool only)

---

## 리뷰 결과 요약

**독립 7명 중 7명이 Block 판정**. 단독 결함이 아니라 구조적 과대 스코프와 법률 준비 부재가 공통 지적. 

- **제품 설계**는 상위권 품질
- **법률·비즈니스 기반**은 0%
- **아키텍처 정합성**은 중간 (3중 상태 vocab, TTL 충돌, late webhook 정반대)
- **OSS 현실성**은 낮음 (1인 운영 vs 3-4 FTE 필요 스코프)

**권고 경로**:
- PRD v0 → v1 전환 시 위 Tier 0–4 모두 반영
- v1 재리뷰 후 ADR status `Proposed` → `Accepted` 전환
- 구현 착수는 v1 accepted + Toss 파트너십 확정 + Tier 0 법률 검토 완료 후

**승인 상태**: Request Changes on all 17 ADRs + PRD v0. v1 재제출 필수.
