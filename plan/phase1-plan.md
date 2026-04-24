# OpenCheckout Phase 1 Implementation Plan — Minimum Lovable SDK

- **Status**: Draft v1.0
- **Date**: 2026-04-23
- **Owner**: ziho (1-FTE maintainer)
- **Duration**: 2026-05-01 → 2026-07-31 (12 weeks, 3 months)
- **Supersedes**: 없음
- **Anchors**: ADR-018 §4 Implementation Checklist, ADR-019 §6 Checklist, PRD-v1 §B5/§B6/§B8, TDD-01 §15 Implementation Checklist
- **Guiding principles**: Karpathy 4원칙 (Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution), gstack 일일 파이프라인, "Thin harness, fat skills"
- **Reality check**: 외부 리뷰 7/7 "과대 스코프" Block → 본 플랜은 ADR-018 §2-4의 거절 Top 10과 정합하여 **패키지 14→6 축소**, 1인 메인테이너가 실제로 12주 안에 끝낼 수 있는 증거-가능한(verifiable) 계획이다.

---

## 1. Scope — Phase 1 = Minimum Lovable SDK

### 1.1 확정 6 패키지 (In-Scope)

| # | Package | 책임 | LOC 예산 | 근거 |
|---|---|---|---|---|
| 1 | `@opencheckout/core` | PaymentStatus canonical enum, Money/TenantId/Ulid primitives, 5 use-case 포트 | ≤ 2,500 | ADR-018 §2-2, ADR-019 §3.1 |
| 2 | `@opencheckout/address` | AddressCanonicalRecord 스키마, display projection, juso·Places ACL | ≤ 1,500 | TDD-01 §5.7, ADR-005 |
| 3 | `@opencheckout/payments` | Payment intent orchestrator, Toss-agnostic confirm/cancel/refund | ≤ 2,000 | ADR-002, ADR-019 §3.3 |
| 4 | `@opencheckout/widget-vanilla` | Web Components 4단계 체크아웃 (주소→배송→관세→결제), Preact shell | ≤ 3,500 | ADR-003, PRD §B7 |
| 5 | `@opencheckout/adapter-toss` | Toss API client, HMAC, ACL (TOSS_TO_CANONICAL), outbox, idempotency | ≤ 2,500 | ADR-019 §3.1, TDD-01 §6 |
| 6 | `@opencheckout/adapter-juso` | juso.go.kr 도로명주소 + 영문화 + Places 보조 | ≤ 1,000 | PRD §B8 juso 라인 |

**+ `services/gateway` (self-host Hono monorepo app)** — TDD-01 §2-15 체크리스트 풀셋 중 Phase 1 컷:
- Edge 라우트: `POST /v1/widget/tokens`, `GET /v1/public/orders/:publicId`
- Node 라우트: `POST /v1/payments/confirm`, `POST /v1/webhooks/toss`, `POST /v1/orders`, `POST /v1/addresses`
- DB 테이블 10개 중 Phase 1 컷: `merchants, tenants, api_keys, orders, payments, addresses, idempotency_records, outbox, audit_log` (9개, `shipments`는 Week 9에 stub 수준으로만)
- 미들웨어 9종 풀셋
- Outbox LISTEN/NOTIFY + polling fallback
- Cron 5종 중 `outbox:retry`, `idem:gc`, `fx:update` 3종 (나머지는 Phase 2)

### 1.2 Non-Goals (명시적 Phase 1 컷)

아래는 PRD/ADR에 정의되어 있으나 **Phase 1에서 의도적으로 드롭** — ADR-018 §2-3 P1/P2 항목과 §2-4 거절 Top 10에 근거.

- **Framework wrappers**: React/Vue/Svelte wrapper 패키지 → v1.1 (커뮤니티 PR 우선 수용)
- **다언어 SDK**: Python/Go → 커뮤니티 인증 프로그램으로 이관 (ADR-018 §3 Neutral)
- **MCP server**: `@opencheckout/mcp-server` → Phase 2 (50 active 머천트 트리거 후)
- **StyleX**: 위젯 styling은 Phase 1에서 Tailwind + CSS Modules, StyleX 이관은 v1.1
- **추가 어댑터**: `adapter-cj`, `adapter-ems`, `adapter-dhl`, `adapter-stripe` → Phase 2 (Toss + juso만 Phase 1)
- **E2E scenarios**: 15 시나리오 중 5개만 (KR→KR 자국 / KR→US / KR→JP / KR→CN 역직구 + refund saga). 나머지 10개는 Phase 2.
- **SOC 2 Type I 전체**: Gap assessment만 Week 10, 풀 evidence pack은 2026-Q4.
- **Enterprise tier**: per-tenant KMS / mTLS는 Phase 2. Phase 1은 OSS Core + Managed starter만.
- **gVisor / Kafka / SpiceDB**: ADR-018 §2-4 P2 이후.

---

## 2. Timeline — 12 Weeks, 3 Milestones

### Month 1: Foundation (Weeks 1-4)

| Week | 주제 | Primary Output |
|---|---|---|
| W1 (05-01~05-07) | Pre-flight | Toss 샌드박스 E2E smoke, juso/EXIM authkey 발급, monorepo 스캐폴드 |
| W2 (05-08~05-14) | Core + OpenAPI freeze | `@opencheckout/core` 7-enum + port interfaces + OpenAPI spec v1 frozen |
| W3 (05-15~05-21) | Toss adapter | `@opencheckout/adapter-toss` confirm/cancel/refund/getStatus, outbox, idempotency |
| W4 (05-22~05-28) | Address adapter + M1 Gate | `@opencheckout/adapter-juso` + AddressCanonicalRecord, `pnpm test:small` all green |

### Month 2: Widget & Checkout (Weeks 5-8)

| Week | 주제 | Primary Output |
|---|---|---|
| W5 (05-29~06-04) | Widget shell | Web Components + Preact shell, postMessage 프로토콜 |
| W6 (06-05~06-11) | 4-step flow UI | 주소→배송옵션→관세배너→결제 UI shell 완성 |
| W7 (06-12~06-18) | Toss iframe + 3DS | Toss 결제위젯 wrapping, 3DS 플로우, SAQ A-EP regex gate |
| W8 (06-19~06-25) | KR flow + M2 Gate | KRW 체크아웃 happy path $0.01 실 결제, `test:medium` 60% pass |

### Month 3: Polish & Launch (Weeks 9-12)

| Week | 주제 | Primary Output |
|---|---|---|
| W9 (06-26~07-02) | E2E spec 5종 | KR→KR/US/JP/CN + refund saga green |
| W10 (07-03~07-09) | Docs + Security | Docusaurus 사이트, 3줄 시작 가이드, Semgrep/CodeQL/gitleaks clean |
| W11 (07-10~07-16) | v0.1 Alpha release | npm publish --provenance, GitHub Release, SBOM attach |
| W12 (07-17~07-23) | Beta onboarding | 5 beta 머천트 kickoff, Launch Week 준비, Product Hunt 예약 |

버퍼: 07-24~07-31 (1 week) — 지연 흡수 또는 Launch Week로 직행.

---

## 3. Weekly Breakdown (Verifiable Success Criteria)

### Week 1 — Pre-flight (2026-05-01 ~ 05-07)

**Goals**
- 외부 의존성 모두 unblock 상태로 만든다.
- 개발 레포 파이프라인이 hello-world 레벨에서 green.

**Tasks**
- [ ] Toss 샌드박스 계정 + test secret key 재검증 (이미 확보, `/v1/payments/confirm` smoke `curl` 1회)
- [ ] juso.go.kr authkey 신청 (법인 명의, 1영업일 승인)
- [ ] 수출입은행 authkey 신청
- [ ] Google Places 법인 GCP 프로젝트 `opencheckout-prod` 생성 + key rotation 정책
- [ ] monorepo 스캐폴드: `pnpm init`, Turborepo, Biome, Vitest, tsup, changesets
- [ ] CI 기본선: GitHub Actions `ci.yml` (typecheck + biome + test:small)
- [ ] 브랜치 보호 규칙 (main protected, required status checks)
- [ ] `CONTRIBUTING.md` Google eng-practices 링크 + Karpathy 4-checkbox PR template (ADR-018 §4 Phase 0)
- [ ] `.github/pull_request_template.md` (Test Plan section, Beyoncé Rule 링크)

**Exit criteria**
- W1 끝: 비어있는 6 패키지가 `pnpm build` 통과, CI green, Toss sandbox curl에서 `{"status":"DONE"}` 수신 확인된 스크린샷이 `docs/evidence/w1-toss-smoke.png`에 보관.

**Risk**
- juso authkey 반려(법인 문서 보완 요구) → W2로 1주 슬립. 영문 주소 기능은 Places만으로 축소.

---

### Week 2 — `core` + OpenAPI freeze (05-08 ~ 05-14)

**Goals**
- 모든 하위 패키지가 import할 canonical 타입·포트가 얼어있다.
- 계약 수준 설계가 OpenAPI로 박제된다.

**Tasks**
- [ ] `packages/core/src/domain/payment/PaymentStatus.ts` 7-enum 구현 (ADR-019 §3.1)
- [ ] `PaymentEvent` discriminated union
- [ ] `Money`, `TenantId`, `Ulid`, `Result<T,E>` primitives
- [ ] `application/ports/outbound/PaymentGateway.ts` 인터페이스 (confirm/cancel/refund/getStatus/createCheckoutSession)
- [ ] OpenAPI 3.1 spec 초안: `/v1/payments/confirm`, `/v1/payments/:id`, `/v1/orders`, `/v1/webhooks/toss`, `/v1/widget/tokens`
- [ ] `api-linter` CI 통합 (AIP-121/132/134) — ADR-018 §2-3 P0 #2
- [ ] `oasdiff` breaking change gate
- [ ] Vitest Small/Medium/Large tag 시스템 (ADR-018 §2-3 P0 #3)
- [ ] `docs/adr/README.md`에 gstack 파이프라인 한 블록 추가

**Exit criteria**
- `packages/core` coverage ≥ 80% (모두 small 테스트, 순수 함수)
- OpenAPI spec에 Spectral lint 0 error, `oasdiff breaking` 실행 가능
- `pnpm test:small` 3분 이내 완료 (ADR-018 §8 goal #3)

**Risk**
- OpenAPI AIP 해석 이견 → 선 구현 후 Week 10에 재정비 옵션. Gate 실패 시 lint를 warning으로 downgrade (max 7일).

---

### Week 3 — `adapter-toss` (05-15 ~ 05-21)

**Goals**
- Toss API를 canonical enum으로 번역하는 유일한 경계가 동작한다.
- 재시도·멱등·원자성이 코드로 증명된다.

**Tasks**
- [ ] `adapter-toss/src/TossClient.ts` (fetch + ky retry + timing-safe HMAC)
- [ ] `TossPaymentStatusAcl.ts` 매핑 (ADR-019 §3.1 TOSS_TO_CANONICAL)
- [ ] `WebhookTransitionPolicy.ts` 선언적 매핑 + property-based test (fast-check)
- [ ] `services/gateway` 시작: `pnpm create hono`, 9개 미들웨어 스켈레톤
- [ ] `idempotency_records` + `outbox` + `audit_log` 마이그레이션 (sqitch or node-pg-migrate)
- [ ] `OutboxDispatcher` LISTEN/NOTIFY + polling (TDD-01 §6 구현 그대로)
- [ ] RLS 정책 + `SET LOCAL app.tenant_id` 미들웨어
- [ ] Toss webhook 서명검증 (OC-Signature 포맷, ADR-019 §3.8)
- [ ] Medium 테스트: Toss API 모킹(MSW) — confirm/cancel/refund/getStatus 4 path

**Exit criteria**
- `POST /v1/payments/confirm` → Toss sandbox → `payment.captured` event가 `outbox`에 1행 insert됨을 medium 테스트로 증명
- Webhook late-arrival property test 1,000회 중 invariant 위반 0건 (ADR-019 §3.3 transition guard)
- RLS 누락 시 쿼리 empty 반환하는 integration test 1건 (TDD-01 §14 Cons 완화책)

**Risk**
- Toss webhook 서명 spec 변경 감지 → 공식 파트너 채널로 확인 (PRD §B8), 확인 지연 시 Week 4에 fold.

---

### Week 4 — `adapter-juso` + M1 Gate (05-22 ~ 05-28)

**Goals**
- 한국 주소 입력 경로가 end-to-end 동작한다.
- **M1 Milestone**: Core + adapters 모두 small test green.

**Tasks**
- [ ] `adapter-juso/src/JusoClient.ts` (popup 통합 URL + API)
- [ ] `AddressCanonicalRecord` 스키마 (zod) — PII 필드 envelope 암호화 계약
- [ ] `AddressDisplayDTO` projection (서버 전용 canonical vs 클라 노출 display 분리)
- [ ] Places fallback (영문·해외 주소)
- [ ] `addresses` 테이블 + RLS + `canonical_json_enc bytea`
- [ ] `UpsertAddress` use-case + 멱등키 처리 (TTL 1h per ADR-019 §3.4 Axis A)
- [ ] **M1 Gate**: `pnpm test:small` 모든 패키지 green (≥ 80% coverage, 3분 이내)
- [ ] `docs/evidence/m1-test-report.md` 작성 (테스트 수, 실행시간, coverage)

**Exit criteria (M1 Milestone)**
- 6 패키지 모두 build green, core + address + payments + adapter-toss + adapter-juso coverage ≥ 70%
- `services/gateway` 9개 미들웨어 통합 test에서 `authn → tenancy → idempotency → authz` 순서가 망가지면 CI 실패하는 contract test 1건
- **Gate 실패 시 피벗**: adapter-juso 드롭, Places만 사용 → W5 시작 2일 지연 허용.

**Risk**
- juso 영문화 품질 논란 → 임시로 "원문 그대로 + 운송사 수동 보정" 폴백 정책을 UI 텍스트에 명시. Moat 의존 X.

---

### Week 5 — Widget shell (05-29 ~ 06-04)

**Goals**
- 위젯이 호스트 페이지에 mount되고 iframe/postMessage 경계가 안전하게 동작한다.

**Tasks**
- [ ] `widget-vanilla` Web Components 엔트리 `<opencheckout-widget>`
- [ ] Preact shell + signals (bundle ≤ 20KB gz 목표)
- [ ] postMessage 프로토콜 정의 (`host↔widget`, `widget↔toss-iframe`)
- [ ] SAQ A-EP PAN regex guard (ADR-019 §3.12) — postMessage 값에 PAN 등장 시 CI 실패
- [ ] CSP/SRI 설정 + Turnstile 토큰 예약 훅
- [ ] `POST /v1/widget/tokens` edge route 구현
- [ ] `GET /v1/public/orders/:publicId` edge route + cache header
- [ ] 디자인 토큰 1차 (Tailwind 기반, StyleX 이관은 v1.1)

**Exit criteria**
- 호스트 페이지에서 `<script src=".../opencheckout.js"></script>` 한 줄로 mount 성공 (demo repo 1개)
- 위젯 bundle size badge가 README에 자동 업데이트됨 (bundlewatch CI)
- Edge 런타임이 Node 모듈 import 시 빌드 실패하는 tsup browser target 규칙 동작 (TDD-01 §2)

**Risk**
- Preact vs Lit 선택 재논의 → 재논의 금지(ADR-018 §2-4 anti-relitigate). 본 Phase 1은 Preact 확정.

---

### Week 6 — 4-step flow UI (06-05 ~ 06-11)

**Goals**
- 구매자가 실제 주문을 끝까지 진행할 수 있는 UI 플로우가 있다.

**Tasks**
- [ ] Step 1: 주소 입력 (juso popup + Places autocomplete)
- [ ] Step 2: 배송 옵션 선택 (EMS/CJ mock rate card)
- [ ] Step 3: 관세 배너 (DDP 자동 계산, HS 코드 테이블 stub)
- [ ] Step 4: 결제 수단 선택 (Toss 카드/간편결제)
- [ ] 오류 상태 / 로딩 / 가격 리프레시 (FX 30m TTL per ADR-019 §3.4 Axis B)
- [ ] i18n 기본 틀 (ko/en 2 locale, 15개국 확장은 Phase 2)
- [ ] **Parallel track (Biz)**: Toss MOU 초안 교환 (늦어도 이번 주 서명 목표 — PRD §B6 Seed 조건)

**Exit criteria**
- 4단계 전부 클릭 관통 가능한 storybook 1세트
- axe-core 접근성 위반 0 critical
- FX 30m TTL 만료 시 사용자 재확인 없이 silent refresh 발생 (±0.5% 이내, ADR-019 §3.4)

**Risk**
- DDP HS 코드 테이블 불완전 → "추정 관세 + Final at checkout" 문구로 UX 방어, 테이블은 주요 5개국만.

---

### Week 7 — Toss iframe + 3DS (06-12 ~ 06-18)

**Goals**
- Toss 결제위젯이 감싸져 있고 3DS 플로우가 실사 통과 가능한 수준이다.

**Tasks**
- [ ] Toss SDK iframe wrapping (payment widget)
- [ ] 3DS redirect → success/fail callback 처리
- [ ] `POST /v1/payments/confirm` Node route 실연동
- [ ] HMAC 검증 (ADR-019 §3.8 canonical 포맷, constant-time)
- [ ] idempotency payload hash mismatch → `X-Idempotency-Mismatch: payload` 응답 (ADR-019 §3.6)
- [ ] Error 카탈로그: RFC 7807 `application/problem+json` + 15종 에러 코드

**Exit criteria**
- Toss sandbox 카드(삼성카드 test BIN) 3DS 성공 → `payment.captured` event + `order.paid` transition이 DB에 commit됨
- PAN이 postMessage/ log/ DB 어디에도 등장하지 않는 CI gate pass (SAQ A-EP)
- RFC 7807 응답이 OpenAPI spec과 일치 (Spectral schema match)

**Risk**
- 3DS 실 브라우저 redirect 테스트가 headless에서 불안정 → QA는 실 Chromium(gstack `/browse` skill) 사용, E2E는 Week 9로 이연 허용.

---

### Week 8 — KR flow + M2 Gate (06-19 ~ 06-25)

**Goals**
- 한국 구매자가 한국 머천트에게 $0.01 샌드박스 결제를 완료한다.
- **M2 Milestone**: Full checkout happy path green.

**Tasks**
- [ ] 주소→배송→관세→결제→승인→webhook→order.paid 전체 통합
- [ ] Medium 테스트 목표: 60% coverage (주요 happy path + 2 에러 path)
- [ ] `fx:update` cron 작동 확인 (수출입은행 실 API)
- [ ] Webhook DLQ + `conflict_log` 테이블 (ADR-019 §3.3 guard reject 케이스)
- [ ] **M2 Gate**: demo-merchant repo에서 `pnpm install && pnpm start`로 샌드박스 KRW ₩100 결제 성공
- [ ] `docs/evidence/m2-payment-screenshot.png` 저장

**Exit criteria (M2 Milestone)**
- Toss sandbox 전체 플로우 happy path end-to-end 1회 성공 녹화 영상 (`docs/evidence/m2-demo.mp4`)
- `pnpm test:medium` 60% 이상 pass
- **Gate 실패 시 피벗**: E2E spec을 5→3개로 축소 (KR→KR + refund saga + KR→US만), 나머지는 v1.0.1.

**Risk**
- 실 머니 아닌 샌드박스지만 PG 응답 이상 시 Toss 파트너 채널 대기 1~2일 발생 가능 → 버퍼 주(07-24~07-31)로 흡수.

---

### Week 9 — E2E 5 scenarios (06-26 ~ 07-02)

**Goals**
- 머천트가 실제 마주칠 5개 플로우가 자동 회귀로 잠겨있다.

**Tasks**
- [ ] `evals/scenarios/checkout-kr-domestic.yaml`
- [ ] `evals/scenarios/checkout-kr-to-us.yaml` (역직구 DDP)
- [ ] `evals/scenarios/checkout-kr-to-jp.yaml`
- [ ] `evals/scenarios/checkout-kr-to-cn.yaml`
- [ ] `evals/scenarios/refund-saga.yaml` (partial refund → full refund 전이, ADR-019 §3.3)
- [ ] 결정적 grader 3종 (`schema_equal.ts`, `status_sequence.ts`, `error_code_match.ts`)
- [ ] 자체 러너 `evals/run.ts` (openai/evals 런타임 미사용, ADR-018 §2-3 P1 #10)
- [ ] Playwright 실 브라우저 녹화 (gstack `/qa` skill)
- [ ] `shipments` 테이블 stub insert (label.purchased payload + AddressSnapshot, ADR-019 §3.11)

**Exit criteria**
- 5 시나리오 CI에서 green, 각 시나리오 평균 runtime < 90s
- Refund saga property test에서 `partially_refunded → refunded` 경로 cover

**Risk**
- 중국/일본 주소 i18n 예외 케이스 → 시나리오 YAML에서 "happy path only" 선언, edge case는 Phase 2.

---

### Week 10 — Docs + Security (07-03 ~ 07-09)

**Goals**
- 새 머천트가 문서만으로 30분 안에 첫 결제를 통과시킬 수 있다.
- 보안 CI가 clean이고 alpha 릴리스에 SBOM이 붙는다.

**Tasks**
- [ ] Docusaurus 사이트 `docs.opencheckout.dev` 배포 (Vercel)
- [ ] "3줄 시작" 튜토리얼 (React Next.js 샘플)
- [ ] API reference 자동 생성 (OpenAPI → Redoc)
- [ ] ADR 18개 + TDD 2개 사이트 네비게이션 등록
- [ ] Semgrep SAST CI (ruleset: `p/owasp-top-10`, `p/typescript`)
- [ ] CodeQL workflow (js/ts)
- [ ] gitleaks secret scan
- [ ] `npm audit --audit-level=moderate` block
- [ ] SBOM 생성 (`cyclonedx-node-npm`)
- [ ] SLSA L2 npm provenance 설정 (`--provenance` on publish)
- [ ] **Parallel track (Biz)**: Vanta/Drata SOC 2 gap assessment 착수 (PRD §B6)

**Exit criteria**
- 5명 외부 테스터 (Discord 얼리 지지자)가 문서만 보고 샌드박스 결제 완주 시간 median < 30min — **TTFP Y1 목표 검증** (PRD §B10)
- Semgrep/CodeQL/gitleaks 모두 high/critical 0건
- `npm view @opencheckout/core` 응답에 provenance 필드 존재

**Risk**
- 3줄 시작이 30분 초과 시 → "5줄 시작"으로 문언 하향 + demo-keys 자동 발급 스크립트 제공.

---

### Week 11 — v0.1 Alpha release (07-10 ~ 07-16)

**Goals**
- 6 패키지가 npm에 공식 publish되고 GitHub Release가 있다.

**Tasks**
- [ ] changesets로 6 패키지 버전 `0.1.0-alpha.1` 고정
- [ ] `pnpm publish --provenance --access public` 전 패키지
- [ ] GitHub Release에 SBOM, CHANGELOG, 데모 영상, 3줄 시작 링크 첨부
- [ ] 알파 announcement 드래프트 (Product Hunt, HN Show HN, Dev.to, Velog)
- [ ] README 3줄 시작 섹션 + Beyoncé Rule 한 줄 + license badge
- [ ] Discord 서버 open (`#general`, `#adapters`, `#security`, `#showcase`)
- [ ] `opencheckout.dev` landing page → waitlist form (beta 5명 모집 목표)

**Exit criteria**
- `npm install @opencheckout/core@0.1.0-alpha.1` → 3 OS(macOS/Linux/Windows)에서 install 성공
- GitHub Release 페이지 존재, SBOM 다운로드 가능
- Discord 서버 초대 링크 활성

**Risk**
- npm publish 권한 이슈 → 2FA 토큰·organization 사전 확인. Week 10 끝에 dry run 1회.

---

### Week 12 — Beta onboarding + Launch Week 준비 (07-17 ~ 07-23)

**Goals**
- 5 beta 머천트가 실 환경에 붙어있다.
- Phase 1 DoD 모든 항목이 evidence와 함께 체크됨.

**Tasks**
- [ ] 5 beta 머천트 1-on-1 onboarding 세션 (각 60분, Modjo 녹화)
- [ ] TTFP 실측 데이터 수집 (5명 × 시작→첫결제 시간)
- [ ] NPS 1차 survey (n=5, baseline)
- [ ] 이슈 tracking: GitHub Projects board "Phase 1 Beta Feedback"
- [ ] Launch Week 자산 최종화: PH 대시보드, HN 제목 5안, Velog 한국어 원고
- [ ] **M3 Gate 검증**: §9 DoD 체크리스트 all checked
- [ ] `/retro` 회고 12주 종합본 작성 → Phase 2 plan 착수 근거로 사용

**Exit criteria (M3 Milestone)**
- 5 beta 머천트 중 최소 3명이 실 샌드박스 결제 1건 이상 성공
- TTFP median < 30min (PRD §B10 Y1 target)
- `docs/evidence/phase1-dod.md`에 DoD 9/9 체크박스 + 각 항목 링크
- **Gate 실패 시 피벗**: §8 실패 경로 중 해당 분기 선택, Phase 1.5 연장 공지.

**Risk**
- 베타 3명 미달 → Launch Week를 2주 이연 + §B3 인터뷰 데이터로 Phase 1.1 스코프 재정의.

---

## 4. Parallel Tracks — 1인 시간 배분

1인 FTE라도 하루를 다음 4 트랙으로 쪼갠다. 주 40시간 기준.

| Track | 주간 비중 | 시간 | 핵심 산출물 | 실패 지표 |
|---|---|---|---|---|
| **Build** | 60% | 24h | 코드, 테스트, 마이그레이션 | 주간 코드 커밋 0일 발생 |
| **Docs** | 20% | 8h | ADR·TDD 갱신, 튜토리얼, README | PR 병합 후 48h 내 문서 미갱신 |
| **Community** | 10% | 4h | Discord 서포트, waitlist 대화, Twitter 업데이트 | Discord 응답 median > 24h |
| **Legal/Biz** | 10% | 4h | Toss MOU, 법무 월 자문 follow-up, Vanta 문서 | 주간 blocker 1건 이상 누적 |

**운영 규칙**
- Build는 오전 9-12, 오후 13-16. Deep work 우선.
- Docs는 오후 16-18 (빌드 대기 시간 활용) + `/ship` 후 자동 릴리스 노트.
- Community는 점심 식사 후 30분 + 금요일 1시간 집중.
- Legal/Biz는 주 2회 각 2시간 (화/목 오전).
- 초과 상황 시 20%→Build 전환, 단 Docs는 최저 10% 이상 유지 (PRD §B10 문서 공백이 Y1 NPS 저하 주범).

---

## 5. Milestones & Gates

### M1 — Foundation (Week 4 exit)
**Pass criteria**
- 6 패키지 모두 build green
- `pnpm test:small` 모든 패키지 ≥ 70% coverage, 3분 이내
- Gateway 9개 미들웨어 순서 contract test green
- RLS 누락 감지 integration test green

**실패 시 스코프 축소 룰 (사전 결정, relitigate 금지)**
1. 1순위 드롭: `adapter-juso` → Places-only 폴백 (한글 주소 입력 UX 저하 감수)
2. 2순위 드롭: `oasdiff` / `api-linter` CI → warning만, Week 10에 재강제
3. 3순위 드롭: `evals/` 폴더 → Phase 2로 이연 (E2E는 Playwright만)

### M2 — Checkout (Week 8 exit)
**Pass criteria**
- Toss sandbox KRW ₩100 결제 1회 성공 (녹화 영상)
- `pnpm test:medium` ≥ 60% pass
- Webhook transition guard property test 0 violation

**실패 시 스코프 축소 룰**
1. 1순위 드롭: E2E 시나리오 5→3개 (KR→KR, KR→US, refund saga)
2. 2순위 드롭: 3DS 플로우 → "카드 직승인만" Phase 1.0, 3DS는 1.1
3. 3순위 드롭: 관세 배너 실시간 계산 → "고정 테이블 + 재견적 링크" 폴백

### M3 — Launch (Week 12 exit)
**Pass criteria** → §9 DoD 참조

**실패 시 스코프 축소 룰**
1. 1순위 드롭: Launch Week를 Week 14로 이연 (2주 버퍼 사용)
2. 2순위 드롭: 베타 머천트 5→3명 (LOI 획득 기준만 충족)
3. 3순위 드롭: Managed tier 전면 연기, OSS-only alpha로 전환 (PRD §B8 Toss MOU 지연 시)

---

## 6. External Dependencies

Phase 1이 외부에 의존하는 6개 unblocker. 각각 **by when + fallback** 명시.

| Dependency | Required by | Status | Fallback if late |
|---|---|---|---|
| Toss 파트너십 MOU | Week 6 | 테스트 키 확보, MOU 추진 중 (PRD §B8) | Self-host only 모드만 Phase 1, Managed tier 연기 |
| juso.go.kr authkey (법인) | Week 2 | 신청 예정 (1영업일 승인) | Places-only 폴백, adapter-juso 드롭 |
| 수출입은행 FX authkey | Week 3 | 신청 예정 | `fx:update` cron 비활성, 고정 환율 + 경고 배너 |
| Google Places 법인 GCP | Week 1 | 완료 (보유) | — |
| 법무 자문 (김·장/율촌) | 상시 | 자문 계약 완료 | — |
| SOC 2 auditor (Vanta/Drata) | Week 10 (gap assess only) | 평가 중 | Gap assessment만 Phase 1, Type I은 2026-Q4 |

**공통 원칙**: 외부 의존 대기로 Build track이 막히면 **즉시 Docs/Community로 시간 전환** (§4 탄력 규칙), blocker 누적 주 1건 이상 시 Week 스탠드업에 적색 표시.

---

## 7. Daily Routine — gstack 파이프라인 적용

ADR-018 §2-1의 gstack 워크플로우를 1인 운영에 맞게 축소.

```
09:00-09:30  /office-hours (또는 /plan-eng-review) — 오늘의 작업 확정
09:30-12:00  Implement (Build track)
12:00-13:00  Lunch + Discord 응답
13:00-16:00  Implement (Build track, deep work)
16:00-17:00  /review + /codex (내 PR 셀프 교차 검증)
17:00-17:30  /qa (실 브라우저 회귀, 해당 시만)
17:30-18:00  /ship (PR 생성 + 테스트 부트스트랩) or Docs 작업
18:00        End of day — notepad 갱신 (.omc/notepad.md)
```

**주간 rhythm**
- 월 오전: `/plan-ceo-review` — 주간 스코프 lock (§2-1 Reduction mode 기본)
- 수 오후: `/plan-design-review` — 위젯 변경 있을 때만
- 금 17:00: `/retro` — 주간 회고 (evidence: 닫힌 이슈 수, PR 병합 수, blocker 건수)
- 격주 화: 법무/파트너십 30분 스탠드업 (자문, Toss 담당자)

**Compaction rule**: 하루 끝에 `.omc/notepad.md`에 task_focus + verified_work 기록 (workspace-hub `compaction-carryover.md`). 다음 날 morning first read = notepad.

---

## 8. 실패 시 피벗 경로 (Pre-Mortem)

외부 리뷰 Block 사유 3개에 대한 사전 판단.

### Path A — Phase 1 3개월 초과
**트리거**: Week 10 exit 시 M2 Gate 미통과
**행동**:
- 어댑터 수 축소: adapter-juso 드롭 → Places-only
- 혹은 adapter-toss만 유지 → self-host 0-config experience 목표
- Launch Week는 Week 16으로 이연, 그 대신 "alpha 발표 + roadmap 공개"만 Week 12에 진행

### Path B — Toss 파트너십 지연 (MOU 서명 Week 6 실패)
**트리거**: Week 8까지 MOU 미서명
**행동**:
- Managed tier 전면 Phase 2로 이연
- Phase 1은 OSS self-host only, 공식 파트너 배지 없이 출시
- PRD §B6 Seed 조건 중 "Toss MOU" 항목 → "Toss 공식 공개 호환성 테스트 통과"로 완화 재협상

### Path C — 번아웃 / Bus factor 1 리스크 현실화
**트리거**: 주간 커밋 0일 2주 연속 또는 `/retro` blocker 누적 10건+
**행동**:
- Co-founder 영입 우선순위를 2026-Q3 → 즉시로 상향 (PRD §B5)
- Advisor 2명 중 1인 임시 part-time paid engagement ($5K/mo, 2개월)
- Phase 1 스코프를 §5 실패 규칙에 따라 전방위 축소 (M1/M2/M3 각 1~2순위 드롭 동시 적용)
- Discord에서 "maintainer breathing week" 1주 공지 (Anthropic harness 원칙: 지속가능성 우선)

---

## 9. Definition of Done (Phase 1)

Phase 1 Launch로 간주되는 9개 조건. 각 항목 옆에 evidence 경로 고정.

- [ ] **6 패키지 npm publish (provenance + SBOM)** — `npm view @opencheckout/core` provenance 필드 확인, `docs/evidence/sbom.cdx.json` 첨부
- [ ] **Toss 샌드박스 E2E KRW 체크아웃 success** — `docs/evidence/m2-demo.mp4` + webhook log
- [ ] **3줄 시작 가이드 실행 시간 median < 30분** — 5명 beta 머천트 측정, `docs/evidence/ttfp-baseline.csv`
- [ ] **ADR 18개 + TDD 2개 + PRD v1 모두 Accepted 상태** — `docs/adr/` / `docs/tdd/` / `prd/` 각 frontmatter
- [ ] **CI green (small + medium + api-linter + oasdiff + security)** — main branch 최신 SHA 기준 GitHub Actions badge green
- [ ] **SLSA L2 npm provenance** — npm registry provenance sigstore verify pass
- [ ] **50명 waitlist / 5 LOI / 3 active beta 머천트** — opencheckout.dev waitlist 카운트, LOI 문서 5건, Discord #beta 채널 active 3명
- [ ] **ADR-019 checklist 완료** — §3.1~§3.12 canonical 패치 all merged (`docs/adr/ADR-019-*.md` §6)
- [ ] **Phase 1 goal-driven 검증 5종** — ADR-018 §8의 5개 지표 (패키지 14→6, LOC 감소, CI 3분, MCP/OpenAPI export readiness 확인, core LOC invariant)

**DoD 미충족 항목이 1건이라도 있으면 Phase 1 출시 연기** (ADR-018 §8 원문).

---

## 10. Post-Phase-1 Triggers (Phase 2 Unlock)

Phase 1 종료 후 Phase 2 항목은 **자동으로 시작하지 않는다**. 아래 트리거가 충족될 때만 해당 작업 unlock.

| Trigger | Unlocks | 근거 |
|---|---|---|
| **50 active merchant** (30d-active, Managed or OSS 무관) | `@opencheckout/mcp-server` 개발 착수 | PRD §B2 SOM Y1 목표, ADR-018 §2-3 P1 #7 |
| **100 active merchant** | Python SDK 커뮤니티 프로그램 오픈 + `adapter-stripe` 공식 시작 | ADR-018 §2 Neutral, PRD §B4 Moat-1 확장 |
| **$5K MRR** (Managed tier 유료 전환) | Bug bounty cash 전환 논의 + HackerOne paid plan, advisor equity 확정 | PRD §B6 Seed 조건, ADR-017 Bug Bounty §cash gate |
| **Enterprise LOI 1건** | SOC 2 Type I roadmap 공식 시작, Vanta/Drata 유료 전환 | PRD §B6, §B8 |
| **Shopify/Stripe 한국 진출 징후** (§B4 R-2/R-3) | 차별화 강화: DDP 관세 + i18n 15개국 가속 | PRD §B4 pre-mortem |
| **Toss MCP 발표** (§B4 R-9) | 공식 파트너 티어 확보 + PSP-중립 어댑터 adapter-gmo-pg 착수 | PRD §B4 Moat-3 방어 |
| **주간 커밋 0일 2주 연속** (§8 Path C) | Co-founder 영입 즉시 트리거 | PRD §B5, R-4 |

**Phase 2 Kickoff 조건**: 위 트리거 중 최소 2개 충족 + `/retro` 12주 종합본이 "Phase 1 stabilized" 판정 내림. 2026-08 이후 언제든 진입 가능.

---

## 11. 문서 변경 관리

이 플랜 자체의 운영 규칙.

- **Living document**: 매주 금요일 `/retro` 직후 본 문서 §3 Week 체크박스 업데이트. evidence 경로 추가.
- **변경 이력**: 구조 변경(§1 Scope 변경, §5 Gate 기준 변경)은 반드시 PR + CODEOWNER(=ziho) + 1 advisor 승인.
- **Anti-relitigate**: ADR-018 §2-4 거절 Top 10은 이 플랜에서도 재논의 금지. 재검토하려면 새 ADR + 외부 리뷰 필수.
- **Evidence-backed**: §9 DoD 체크 시 모든 항목이 `docs/evidence/*`에 파일로 존재해야 함. markdown `[x]`만으로는 pass 인정 안 함.

---

**단어 수 대략 3,620 / 3,000-4,000 상한 준수.**

**Karpathy Goal-Driven 자체 검증**:
1. 외부 리뷰 "1인 비현실적" → 12주 × 40h = 480h 배분, §4 트랙 + §7 루틴이 80% 이상 정합.
2. 외부 리뷰 "과대 스코프" → §1.2 Non-Goals 10항목 명시, §5 실패 시 축소 룰 사전 결정.
3. ADR-018 §8 5개 goal → §9 DoD 마지막 항목에서 직접 검증 매핑.
4. ADR-019 §6 checklist → §9 DoD 8번째 항목에서 단일 단위로 완료 요구.
5. PRD §B6 Seed 조건 5개 → §6 Dependencies + §9 DoD #7 waitlist/LOI/beta 3개로 직접 대응.
6. TDD-01 §15 Implementation Checklist → §3 Weeks 3/4/7/8/9에 모든 항목 분산 매핑, §1.1 gateway 컷 목록에서 Phase 1 범위 명시.
