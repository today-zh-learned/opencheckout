# OpenCheckout SDK — PRD v1

| | |
|---|---|
| **Status** | Draft v1, Business sections merged, 2026-04-24 |
| **Author** | ziho.shin@gmail.com |
| **Date** | 2026-04-24 |
| **Project code** | opencheckout (가제, 확정 전) |
| **Location** | `workspace-hub/services/opencheckout/` |
| **License (proposed)** | Apache 2.0 |
| **Benchmarks** | Shop Pay, Stripe Link, Medusa.js, Saleor, 토스페이먼츠 |
| **Supersedes** | PRD-v0 (유지 보존, 비즈니스 섹션 11종 병합본) |
| **Guiding principles** | Karpathy 4원칙 (Think/Simplicity/Surgical/Goal-Driven) + Problem-First + Thin harness, fat skills |

---

## 0. 네이밍 후보

구현 착수 전 확정 필요. 제안 순위:
1. **opencheckout** — 스코프 명확, 검색성 양호, OSS 친화
2. **checkout-kit** — 가벼움, 중립적
3. **shipkit** — 배송 쪽 강조, 결제가 약해 보임
4. **paybridge** — 결제 편향
5. **koncheckout** — KR 정체성 강조, 글로벌 모호

패키지 네임스페이스(jsr/npm): `@opencheckout/*` (e.g., `@opencheckout/core`, `@opencheckout/address`, `@opencheckout/payments`).

## 0.5 Business Snapshot (신규 — B1/B2/B5/B6 요약)

**Elevator pitch**. "**한국 D2C 셀러의 역직구 체크아웃**을 오픈소스로 표준화한다. `@opencheckout/core` + `adapter-toss` + `adapter-juso`만으로 토스페이먼츠 + 도로명주소 + DDP 관세 + 다통화 결제를 **3줄 코드**로 붙인다."

**One-liner pricing (§20 상세)**. OSS Core는 영구 무료(Apache 2.0). Hosted Managed는 **$99/mo + 0.30% GMV** (Shopify Plus 0.25% ~ Stripe 0.5% 중간대). Enterprise는 per-tenant KMS + SLA 포함 custom(floor $1.5K/mo).

**Market (§21 상세)**. TAM = 한국 역직구 $4.7B 연간 거래액, SAM = 개발자형 D2C 2,000 머천트 × $2,268 ARPU ≈ **$4.5M ARR**, SOM Y1 50 merchants / $113K ARR → Y3 500 merchants / **$1.1M ARR**.

**Team (§26 상세)**. 현재 1인(ziho), 2026-Q3 co-founder(SRE) 채용, seed 후 4인.

**Funding (§27 상세)**. Pre-seed $750K–$1.5M (18mo runway), YC W26 1순위, 국내 Altos/KB/스프링캠프 병행.

**North Star (§29 상세)**. **TTFP (Time to First Payment)** — 머천트가 가입부터 실 sandbox 결제 승인까지의 분. Y1 < 30min, Y2 < 15min, Y3 < 10min.

## 1. Problem / Opportunity / Customer Evidence

### 1-1. Problem
한국 셀러가 국내+해외로 배송/결제를 태울 때:
- 주소 입력(한국 juso/Kakao, 글로벌 Google Places), 다국어 표기(한/영/일/중), 캐리어 송장 규칙(글자수·언어), 세금ID/통관(국가별 상이), 다통화 결제, 환율 가중치, PCI 스코프를 개별 통합해야 함
- 기존 OSS(Medusa/Saleor)는 커머스 엔진 전체를 끌어와야 하고 아시아 규정을 얇게만 다룸
- Shop Pay는 Shopify 종속, Stripe Link는 한국 PG 미지원
- 리뷰어 B-4 지적에 따라 타깃을 **한국 D2C 역직구**로 단일화하여 "한국발 D2C 셀러 × 다국가 수취인" 교집합에 집중.

### 1-2. Opportunity
"**주소+결제 only 초경량 체크아웃 SDK, 아시아 퍼스트 + 토스페이먼츠 1급 + 정준 로마자/세금ID + DDP 관세**" 포지션은 실제 시장 공백. framework-agnostic 임베드 + 오픈소스 + GitHub Pages 샌드박스로 진입 장벽 0.

### 1-3. Definition of Awesome
- 머천트가 **3줄 코드**로 한국 주소 검색 → 영문 변환 → 토스 결제 완결
- 공개 샌드박스에서 **키 없이** 한 페이지 데모가 15초 안에 돈다
- 2026-08-29(US de minimis 폐지 1주년) 전까지 공개 릴리스
- **TTFP < 30분** (North Star, §29)

### 1-4. Primary Persona — "한국 D2C 브랜드 개발 리드"
- 패션·뷰티·식품 카테고리 (월 주문 100–5,000)
- 자체 Next.js 체크아웃 운영 (Shopify/Cafe24 **사용 안 함**)
- 토스페이먼츠 연동 완료, 해외 배송은 CJ + EMS 혼용
- 창업자 본인이 코드 리뷰 가능한 1–5인 엔지니어링 조직
- **JTBD**: "미국/일본 구매자가 카트에서 이탈 없이 원화·달러 동시 결제하고, 관세를 사전에 보이게 하고 싶다."

### 1-5. Secondary Persona — "헤드리스 커머스 Solo 개발자"
- 월 주문 50–500, Shopify Hydrogen/Medusa.js 경험, OSS에 기여 경험 있음
- Managed tier 전환은 낮음, OSS 기여·토론에는 높음 → 커뮤니티 시드 역할

### 1-6. Customer Evidence — 인터뷰 플랜 (2026-05-01 ~ 2026-05-31)

| 항목 | 목표 | 방법 |
|---|---|---|
| 45분 문제 인터뷰 | 15명 | JTBD 템플릿, 금전적 보상 $50/세션 |
| LOI (Letter of Intent) | 5명 | Managed tier beta 90일 무료 + 피드백 약정 |
| Beta waitlist | 50명 | 랜딩페이지 (opencheckout.dev) + 밋업 사인업 |
| 샘플링 | Primary 10 + Secondary 5 | LinkedIn + 한국 D2C 슬랙 + 토스 파트너 레퍼런스 |

데이터 수집: Modjo(KR 개인정보 옵션) + NotebookLM + Notion. 인터뷰 결과 Primary Persona와 불일치 시 §21 SOM 재산정 + §1 본 섹션을 v1.1에서 실제 인용문·타임라인으로 교체. 본 섹션은 **인터뷰 이전 작성된 가설**임을 명시.

## 2. Non-Goals (v1 스코프 밖)

- 커머스 엔진(상품/재고/주문 DB) — Medusa/Saleor 대체 아님
- 카드 호스팅 필드 자체 구현(PCI DSS Level 1) — Toss iframe만 래핑
- 사기방지 시그널 OSS 공개 구현 — 훅만 제공, Sift/Signifyd 어댑터로 위임
- 물류 부킹/트래킹 — v2 검토
- 복수 PG 심층 통합 — v1은 Toss 1개, v2에 KG이니시스·NICE·Antom·KOMOJU 어댑터
- Vue/Svelte 래퍼 (ADR-018 §2-3 Reduction — Phase 1은 vanilla + React만)
- Python/Go/Java SDK 1차 패키지 (ADR-018에 따라 커뮤니티 인증 프로그램으로 이관)

## 2.5 Competitive Landscape (신규 — B4)

### 직접·인접 경쟁자

| 경쟁자 | 포지션 | 우리 대비 장점 | 우리 대비 단점 |
|---|---|---|---|
| **Shopify Markets** | Managed full-stack commerce | 크로스보더 완결성 | 한국 PG 없음, Shopify lock-in |
| **Stripe Link** | PSP-중립 checkout | 글로벌 PSP 커버리지 | 한국 PG 미지원, 역직구 관세 X |
| **Medusa.js** | OSS 헤드리스 커머스 | 전체 커머스 스택 | 체크아웃 단독 아님, K8s 무거움 |
| **Saleor** | OSS GraphQL commerce | API-first | Django + K8s, 아시아 얕음 |
| **Toss Payments iframe** | 공식 위젯 | Toss 네이티브 | 배송/관세/주소 어댑터 없음 |
| **Cafe24/Imweb 체크아웃** | 국내 SaaS | 운영/세금 완비 | 커스텀 불가, 개발자 미친화 |

### Response scenarios (pre-mortem)

| 시나리오 | 확률 (24개월) | 영향 | 대응 |
|---|---|---|---|
| Shopify Markets 2027 한국 진출 | 30% | Medium | "Shopify 밖 자체 커머스 D2C" 니치 유지, Cafe24 이탈 유저 타깃 |
| Stripe가 Toss 인수 | 10% | High | 멀티-PG 라우터 설계(ADR-018 §2-2 adapter 구조로 이미 대비) |
| Medusa가 한국 어댑터 오픈소스 출시 | 40% | Medium | "체크아웃 only + DDP 관세 + i18n 15개국" 전문 레이어로 차별화 |
| 토스가 자체 OSS SDK 발표 | 25% | High | 공식 파트너 티어 확보(§25) + PSP-중립 어댑터 레이어 유지 |
| 대형 Cafe24 플러그인 등장 | 50% | Low | Cafe24 자체 플랫폼 밖 타깃이라 직접 충돌 없음 |

### Defensibility

- **Moat-1**: 한국 D2C 역직구에 특화된 **어댑터 라이브러리** (juso/수출입은행/HS코드/DDP 테이블)
- **Moat-2**: AI-ready API — MCP server + OpenAPI function-calling 자동 export (ADR-018 §2-3 P1)
- **Moat-3**: Toss 공식 파트너 (§25 추진 중)
- **Not a moat**: UI 위젯(복제 쉬움), 기본 결제 플로우(범용)

## 3. User & Scenario

### Primary persona
§1-4 참조 — 한국 D2C 브랜드 개발 리드.

### Secondary persona
§1-5 참조 — 헤드리스 커머스 Solo 개발자.

### Golden path scenario
1. 사용자가 상품 선택 → 체크아웃 진입
2. 배송지 **국가 먼저** 선택
3. 한국 → juso.go.kr 자동완성 / 해외 → Google Places Autocomplete (언어=유저 브라우저)
4. 선택 시 SDK가 다국어 주소 응답(ko/en/ja/zh-CN/zh-TW) 일괄 확보 — Google Places 세션 토큰 ko→en 2콜 패턴
5. 국가별 세금ID/통관 필드 동적 렌더 (EU→VAT+GPSR RP, 미국→EIN/SSN/ITIN, 중국→身份证, 브라질→CPF…)
6. 이름/호수 등은 자동 로마자 변환 후 **사용자 확인 토글** (수정 가능)
7. 영문 주소 라인이 캐리어 한도(30자 UPS/35자 FedEx) 초과 시 pre-flight validator가 분할/약어 제안
8. 장바구니 KRW 가격이 선택 통화(USD/JPY)로 환산(수출입은행 환율 최댓값 × 1.10) 표시
9. 토스 결제위젯 렌더 → OTP/Passkey 본인확인 → 결제 → 서버 `/confirm` amount 재검증 → 승인
10. 저장: 주소 별칭 + 자주 쓰는 배송지 목록 (사용자 계정 연동 시)

## 4. Architecture Decisions

### D1. Monorepo: pnpm workspaces + Turborepo + Changesets

```
opencheckout/
├── spec/openapi.yaml               # 단일 진실원
├── packages/                       # Phase 1 (TS) — ADR-018로 6개 패키지로 축소
│   ├── core/                       # 타입·에러·idempotency·KeyScope·PaymentStatus enum (ADR-019 §3.1)
│   ├── address/                    # 주소 입력 모듈
│   ├── payments/                   # 결제 모듈 (PCI SAQ A-EP 경계, ADR-019 §3.12)
│   ├── adapters-toss/              # 토스페이먼츠 + TossPaymentStatusAcl
│   ├── adapters-juso/              # juso.go.kr (KR)
│   └── widget-vanilla/             # <script> 한 줄 (GitHub Pages)
├── services/gateway/               # self-host Gateway (Hono/Node)
├── examples/                       # nextjs-checkout, github-pages-embed
├── docs/                           # Docusaurus (i18n: ko/en)
└── tools/
```

Phase 1 패키지 목록은 **ADR-018 적용으로 기존 14개 → 6개로 축소**. 나머지(shipping-rates, duties, subscriptions, widget-react, adapters-*, sdk-*, key-provider, testing, checkout 오케스트레이터)는 Phase 2 이후로 이연. `@opencheckout/mcp-server`는 Phase 1.5에 별도 패키지.

### D2. "두 모듈 + 얇은 오케스트레이터"
`@opencheckout/address` 단독 채택 가능(주소만 필요한 머천트 포획), `@opencheckout/payments` 단독 가능. 오케스트레이터(`@opencheckout/checkout`)는 Phase 2로 이연. PCI 스코프는 `payments`로 격리.

### D3. 멀티언어 SDK 순서
**TS (Phase 1)** → **Python/Go/Java는 Phase 2+ 커뮤니티 인증 프로그램으로 이관** (ADR-018 §2-4). OpenAPI 3.1을 단일 진실원으로 두고 `openapi-generator` + 손수 래퍼.

### D4. 프로토콜
**REST + OpenAPI 3.1**. Stripe/Twilio 동일. tRPC/GraphQL 기각 이유: 멀티언어 SDK 목표와 충돌. Google AIP-121/132/134 준수(ADR-018 §2-3 P0).

### D5. 상태관리 (★ ADR-019 canonical 적용)

**Order state machine (canonical DAG, ADR-019 §3.2)**:
```
draft
  → pending_payment
    → paid
      → processing
        → label_purchased
          → in_transit
            → delivered
              → completed
(any non-terminal) → canceled   [guarded: post-DELIVERED 진입 금지]
```
Terminal states: `completed`, `canceled`. `canceled` 진입 guard: `prev_state != 'delivered' AND prev_state != 'completed'`.

**Payment status (canonical, ADR-019 §3.1)**:
```
authorized → captured → settled
           ↘ voided
           ↘ refunded | partially_refunded
authorized → failed
```
Toss 벤더 어휘(`APPROVED`, `DONE` 등)는 `adapters-toss/TossPaymentStatusAcl.ts`에서만 등장. 내부 도메인에서는 `captured`(=청구 완료)로 통일.

클라이언트는 **단기 Session Token**(서명 JWT 5분)만 보유. PII/키 무보유. `Idempotency-Key`(UUIDv4) 필수, 24h 캐시.

### D6. BYO-Key (Bring Your Own Key) 타입 시스템
```ts
type KeyScope = "server-only" | "client-safe";
interface KeyRegistry {
  toss: { secret: ServerOnly; client: ClientSafe };  // 통화별 3세트
  exim:   { apiKey: ServerOnly };
  kakao:  { rest: ServerOnly; js: ClientSafe };
  juso:   { confmKey: ServerOnly };                   // juso.go.kr
  google: { places: ClientSafe };                     // referrer lock 필수
}
```
- 3계층 주입: 명시 인자 → env → `.rc` 암호화
- 번들러 플러그인이 빌드타임에 `server-only` 키 문자열 클라이언트 번들에서 스캔, fail
- 환경 분리: `MYSDK_ENV=dev|staging|prod` 네임스페이스 강제
- 로테이션: `KeyProvider.refresh()` + grace window
- 유출 방지: gitleaks pre-commit, 로거 PAN/키 리다액터

### D7. PCI DSS 스코프 (★ ADR-019 §3.12: SAQ A → SAQ A-EP)
- 카드 PAN은 SDK 서버 **절대 미경유**
- Toss **iframe hosted fields 또는 redirect만** (자체 iframe 관리 금지)
- Widget이 Toss iframe을 orchestrate(postMessage, SRI, CSP 관리)하므로 **SAQ A-EP** 기준 적용
- 6.4.3 / 11.6.1은 OpenCheckout + 머천트 공동 책임
- 런타임 PAN non-crossing enforcement: postMessage 값에 대한 PAN regex check + CI 테스트
- DB 스키마 PAN 컬럼 금지 (마이그레이션 린터)

### D8. 인증 UX
- **OTP (이메일/전화)** + **WebAuthn/Passkey 병행**
- 디바이스 바인딩 기본 on
- 프리필은 OTP/Passkey 성공 후에만 (SIM swap 방어)

### D9. FE / BE / Tooling 확정 스택

| 영역 | 선택 | 핵심 근거 |
|---|---|---|
| 위젯 코어 | **TS + Web Components + Preact (25kB gzipped)** | iframe 바깥 WC, iframe 안 Preact |
| FE 래퍼 | **React만 Phase 1**, Vue/Svelte 드롭(ADR-018 Reduction) | 스코프 축소 |
| Gateway | **Hono** (Node primary) | Toss confirm 응답이 Node crypto 고정 필요 → Gateway 전체 Node |
| API 스타일 | REST + OpenAPI 3.1 (Google AIP 준수) | 다언어 SDK SSOT |
| DB | **PostgreSQL + outbox 패턴 + LISTEN/NOTIFY** | V1 단일 PG |
| 암호화 | **App-layer envelope (PII DEK + Audit DEK 분리, ADR-019 §3.7)** | 멀티테넌시, crypto-shred |
| 라이브러리 빌드 | **tsup** (dual ESM/CJS, d.ts) | — |
| 위젯 빌드 | **Vite** (lib mode) | — |
| 린터/포매터 | **Biome** | 10–100× 속도 |
| 테스트 | **Vitest + Playwright** + Google Small/Medium/Large 분류 (ADR-018) | CI 분기 실행 |
| 스펙 린터 | **Spectral + oasdiff + api-linter** (AIP) | breaking CI 차단 |
| 문서 | **Docusaurus 3 + Scalar + Algolia DocSearch + Sandpack** | i18n·OSS 친화 |
| 배포 | **Docker Compose → Fly.io → K8s Helm** | self-host 우선 |
| 시크릿 | **Doppler 또는 1Password SDK** | 벤더 락인 회피 |
| 관측성 | **OpenTelemetry + Sentry Browser** | exporter 교체만으로 전환 |
| Spec → AI | **OpenAPI → MCP server + OpenAI function-calling / Anthropic Tool Use 자동 export** (ADR-018 §2-3 P1) | AI-ready 차별화 |

**번들 예산**:
- `@opencheckout/widget-vanilla` ≤ 25kB gzipped (Stripe.js v3 ~30kB 대역)
- `@opencheckout/sdk-browser` ≤ 18kB (Phase 2 도입 시)

## 5. Address Module — 상세

[§5-1 ~ §5-7은 PRD-v0과 동일한 설계 유지. 변경점은 §5-6 `retentionPolicy: "indefinite"` 삭제 → `fieldClass: operational|financial|legal-hold|audit` 태그로 대체, ADR-019 §3.5 Retention Matrix 참조.]

### 5-1. API 스택 (확정)
| 용도 | 채택 | 폴백 |
|---|---|---|
| 한국 주소 검색 | juso.go.kr 도로명주소 Open API | Kakao Local |
| 한국 영문 변환 | juso.go.kr 영문주소 API (data.go.kr #15057413) | `hangul-romanize` (이름만) |
| 글로벌 주소 | Google Places Autocomplete (New), 세션 토큰 ko→en 2콜 | HERE v7, Mapbox |
| 주소 포맷 규칙(서버) | `google-i18n-address` | — |
| 주소 포맷 규칙(클라) | `@shopify/address` | — |
| 전화 검증 | `libphonenumber-js` / `phonenumbers` | — |
| 세금ID 검증 | `python-stdnum` | VIES(EU 실시간) |
| 여권 MRZ | `mrz` (MIT, JS) | — |
| 로마자(중) | `pypinyin` (MIT) | — |
| 로마자(일) | **`cutlet`** (MIT) | **`pykakasi` 금지 — GPL 블로커** |
| 로마자(한, 이름만) | `hangul-romanize` (BSD) | — |

### 5-2 ~ 5-6. 설계 유지
PRD-v0 §5-2(UX) / §5-3(세금ID/통관 HARD BLOCKERs) / §5-4(캐리어 커버리지 & Pre-flight Validator) / §5-5(주소록) / §5-6(`AddressDisplayDTO` + `AddressCanonicalRecord` 이원 스키마)는 v0와 동일 유지.

**변경점 (ADR-019 정합성)**:
- §5-6-2 `retentionPolicy: "indefinite"` 필드 **삭제** → `fieldClass: operational|financial|legal-hold|audit` 태그로 대체(ADR-019 §3.5 Retention Matrix 적용).
- PII DEK는 per-tenant, Audit DEK는 별도 KMS CMK — `pii.encryptionKeyId`에 family 구분자 추가.

### 5-7. 테스트 전략
PRD-v0와 동일.

### 5-8 ~ 5-10. 배송/관세 모듈 확장 로드맵
v0 설계 유지. **Phase 1에서는 인터페이스만**(ShippabilityOracle, ShipmentDraft 상태기계, DutyCalculator 계약). `@opencheckout/shipping-rates`와 `@opencheckout/duties`는 **Phase 2**로 이연 (ADR-018 패키지 축소).

관세 이벤트 카탈로그(`duty.quoted`)는 Phase 1 이벤트 스토어에 선행 등록하여 후속 모듈 연결 지점 보존.

## 6. Payment Module — 상세

### 6-1. PG & 통화
| 통화 | PG | 결제수단 | MID |
|---|---|---|---|
| KRW | Toss native | 국내카드, 가상계좌, 계좌이체, 휴대폰, 간편결제 | KR MID |
| USD | Toss (FOREIGN_EASY_PAY) | 해외카드, PayPal, Alipay, 동남아 간편결제 | USD MID |
| JPY | Toss (FOREIGN) | 해외카드 | JPY MID |
| CNY | **v1 비지원**. v2: Alipay-via-USD 또는 Antom/Stripe CN 라우팅 | — | — |

**국내 카드사 발급 해외결제 카드는 다통화 불가**. 해외 발급만.

### 6-2. 토스페이먼츠 v2 SDK 통합
- SDK: `@tosspayments/tosspayments-sdk` v2
- 2단계 플로우: `requestPayment()` → `successUrl` → 서버 `/v1/payments/confirm` (amount 재검증 필수)
- 키: 클라 3세트(프론트 동적 로드), 시크릿 3세트(서버 Keychain/Secret Manager)
- 통화별 MID 청약 필수 (§25 토스 파트너십으로 Q2 확보)

### 6-3. FX Service (수출입은행 환율)
- 엔드포인트: `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=&searchdate=YYYYMMDD&data=AP01`
- **스케줄**: 10:55, 11:05, 14:00, 17:00 (영업일)
- **선정**: 하루치 `deal_bas_r` 중 **최댓값**
- **가중치**: `markup = 1 + weight`, 기본 `fx.markup_weight = 0.10`
- **JPY 보정**: `cur_unit: "JPY(100)"` → `/100` 선처리 필수
- **캐시**: Redis `fx:{currency}:{yyyymmdd}:{slot}`, **ADR-019 §3.4 Axis B TTL = 30m, ±0.5% silent refresh**
- **Fail-closed**: 환율 null/0 → 결제 비활성

**정책**: "KRW 원가 → 외화 환산 표시 → 외화로 승인" 단일.

### 6-4. 취소/환불 (★ ADR-019 §3.1 적용)
- 내부 상태: `voided`(capture 전) vs `refunded`/`partially_refunded`(capture 후) 구분
- `POST /v1/payments/{paymentKey}/cancel` (캡처 전 → `payment.voided`)
- `POST /v1/payments/{paymentKey}/refund` (캡처 후 → `payment.refunded` 또는 `payment.partially_refunded`)
- **Idempotency TTL**: `refundId` 기반 주소화 — **영구 재시도 키**(ADR-019 §3.4 Axis A)
- 다통화: 결제 당시 통화/환율로 원복 (토스 처리), 환차손 상점 부담

### 6-5. 보안 체크리스트
- 시크릿 키 프론트 번들 금지 (타입 시스템 + 번들러 스캐너)
- `/confirm`: 클라이언트 `amount` vs 서버 DB 주문 금액 검증 후 승인 호출
- `orderId`: 서버 생성 UUID+timestamp
- 웹훅: `OC-Signature` 헤더(ADR-019 §3.6, §3.8) — `t=<unix>,v1=<hex>,nonce=<b64u>,kid=<key-id>` HMAC-SHA256, `crypto.timingSafeEqual` constant-time 비교
- 다통화: `(orderId, currency, amount)` 3튜플 검증
- 키 로테이션 90d

### 6-6. 이벤트 카탈로그 (★ ADR-019 §3.1 canonical enum)

```
payment.authorized       # 승인 완료, 청구 전 (2-step)
payment.captured         # 청구 완료 (v0의 'approved' 교체)
payment.settled          # 정산 완료 (T+N)
payment.voided           # 승인 취소 (capture 전)
payment.refunded         # 전액 환불
payment.partially_refunded
payment.failed
```
HMAC-SHA256 서명 헤더, 재전송 정책, DLQ, 멱등 키. 구독: `subscription.renewed`, `subscription.payment_failed`, `subscription.canceled` (Phase 2).

### 6-7. 확장 로드맵 (Phase 2+)
PRD-v0와 동일 — 한국 특화 간편결제, 지역 결제수단 어댑터, 구독/정기결제, 분할/복합 결제, 현금영수증, e-Invoice, 차지백, BNPL, 멀티 PG 라우터.

## 7. 해외 역직구 구매자 UX & 아키텍처

§7-1(Locale/Currency Resolver) ~ §7-6(Order Tracking)은 PRD-v0 설계 유지. UX 표시 원칙만 명시적 추가:
- DAP 모드에서 관세 추정치 강제 표시 (FedEx 데이터상 미수령률 12%p 감소)
- `duty.quoted` 이벤트 timestamp와 `DutyQuote.expiresAt` 체크아웃 UI에 노출

## 8. 주문 라이프사이클 & 데이터 액세스 아키텍처

### 8-1. 도메인 이벤트 카탈로그 (★ ADR-019 적용)

```
order.created                    # 카트 → 체크아웃 진입
order.identity_verified          # OTP/Passkey 성공
address.attached                 # 배송지 확정
shipping.rate_selected           # 배송 옵션 선택
duty.quoted                      # 관세 견적 제출
payment.authorized               # 결제 승인 (Toss confirm 성공)
payment.captured                 # 최종 수취 완료 (v0의 'approved' 교체)
payment.settled                  # T+N 정산 완료
order.placed                     # 주문 확정 (구매자 관점 '완료')
fulfillment.preparing
fulfillment.picked
fulfillment.packed
shipment.label_purchased         # 송장 구매 (AddressSnapshot immutable 포함, ADR-019 §3.11)
shipment.handed_over
shipment.in_transit
shipment.customs_hold
shipment.customs_cleared
shipment.out_for_delivery
shipment.delivered
shipment.exception
return.requested
return.label_issued
return.received
refund.processed
payment.refunded
payment.partially_refunded
payment.voided
payment.failed
dispute.opened
dispute.resolved
order.canceled                   # guard: prev ∉ {delivered, completed}
```

각 이벤트는 `eventId`(ULID), `eventType`, `occurredAt`, `tenantId`, `orderId`, `actor`, `payload`, `correlationId`, `causationId`, append-only 저장.

**Late-webhook 정책**: ADR-019 §3.3 transition-guard-first + event_time tiebreaker 표 참조. `application/policies/WebhookTransitionPolicy.ts` 단일 선언.

### 8-2. 데이터 액세스 계층
PRD-v0 §8-2(5가지 read-model projection) 동일 유지.

### 8-3. 저장 레이어
PRD-v0 §8-3 동일. **변경점**: audit log 보관기간은 ADR-019 §3.5 Retention Matrix의 **7년(WORM)** 으로 확정, Merkle snapshot bucket은 **10년(S3 Object Lock Compliance)**.

### 8-4 ~ 8-5. 외부 연동 / 타임라인 재구성
PRD-v0 동일.

## 9. 내부 운영 콘솔 (Ops/Logistics Workbench)

Phase 2에 `@opencheckout/admin-console` 옵셔널 패키지로 제공. PRD-v0 §9 설계 유지.

## 10. GitHub Pages Sandbox

PRD-v0 §10 설계 유지 (2-pane 샌드박스, 시나리오 프리셋, BYOK UX, 토스페이먼츠 Sandbox 벤치마크). **TTFP 계측점**은 본 샌드박스 진입 → 첫 `payment.captured` webhook까지의 timestamp diff로 정의(§29).

## 11. DevEx / OSS

### 11-1. 기본 원칙
- **라이선스**: Apache 2.0 (특허 grant §3, 결제 특허 지뢰밭 방어) — **영구 보장**(§31)
- **기여**: DCO (`git commit -s`), CLA는 기여자 심리장벽 → 없음
- **커뮤니티**: Discord `#general #adapters #security #showcase`, HN Show HN, Dev.to, GDG Seoul
- **라벨**: `good first issue`, `help wanted`, `i18n:*`
- **Release**: Changesets 기반 PR 단위 버전 제안
- **엔지니어링 파이프라인**: `/office-hours → /plan-ceo-review → /plan-eng-review → implement → /review + /codex → /qa → /ship → /retro` (ADR-018 §2-1)
- **PR 템플릿**: Karpathy 4원칙 체크리스트 + Meta "Test Plan" 섹션 (ADR-018 §2-3 P0)
- **Beyoncé Rule**: "테스트로 잠그지 않은 동작은 부서져도 책임 없음" README 명시

### 11-2. 문서 사이트 (토스페이먼츠 docs 벤치마크)
PRD-v0 §11-2 동일 — Docusaurus Guides + Scalar Reference + Sandbox 3원 구조, Sandpack 라이브 코드, Crowdin i18n.

### 11-3. "3줄로 시작하기"
```tsx
import { OpenCheckout } from "@opencheckout/widget-vanilla";
OpenCheckout.mount("#checkout", { publicKey: "test_ck_..." });
```
Guides 첫 페이지 = 3줄 + StackBlitz 임베드. **TTFP 측정**의 핵심 lever.

### 11-4. 개발자 온보딩
devcontainer, nix-shell, Makefile 4개 커맨드, Discord 봇.

## 12. Testing (★ Google Small/Medium/Large 분류 — ADR-018)

- **Small (pure logic, Vitest tag)** — 타입 가드, 상태기계 전이, 체크섬. PR에서 항상 실행.
- **Medium (mock PSP, Vitest tag)** — msw/nock 외부 API 픽스처 (juso/Kakao/Google Places/Toss/Exim). Nightly.
- **Large (실 Toss sandbox, Playwright)** — 위젯+gateway+Toss 샌드박스 E2E. Pre-release.
- **Contract (Schemathesis)** — OpenAPI 드리프트, `oasdiff` CI 차단.
- **Eval (openai/evals YAML 포맷 차용, ADR-018 §2-6)** — `evals/scenarios/*.yaml` 시나리오, 자체 TS 러너. CI 100% 통과 = 릴리스 블로커.
- **시크릿 없는 CI**: Toss 공개 테스트 키만.

## 13. Versioning
- SDK SemVer 엄격
- API 날짜 헤더: `OpenCheckout-Version: 2026-04-24` (ADR-019 §3.6). 최소 12개월 두 버전 병행
- Deprecation 경고 1 마이너 전
- Webhook schema 별도 축 (ADR-011)

## 14. Roadmap (Phased) — ★ ADR-018 적용으로 Phase 1 축소

### Phase 0 (즉시, 1주 내)
- `CONTRIBUTING.md` Google eng-practices 링크 + Test Plan + Karpathy 4원칙
- `.github/pull_request_template.md`
- README Beyoncé Rule
- gstack 파이프라인 (`/office-hours → /ship`) 문서화

### Phase 1 (0–3개월): Minimum Lovable SDK — **6 패키지만**

**패키지 (정확히 6개, ADR-018 §2-2, §2-3 적용)**:

1. `@opencheckout/core` — 얇은 primitive 5개 (createSession/confirm/refund/getStatus/cancel), `PaymentStatus` enum, `Idempotency-Key` middleware, `KeyScope` 타입
2. `@opencheckout/address` — `AddressDisplayDTO` + `AddressCanonicalRecord` 이원 스키마
3. `@opencheckout/payments` — Toss iframe orchestration (SAQ A-EP 경계)
4. `@opencheckout/adapters-toss` — Toss 결제 어댑터 + `TossPaymentStatusAcl`
5. `@opencheckout/adapters-juso` — juso.go.kr 도로명주소
6. `@opencheckout/widget-vanilla` — `<script>` 한 줄 통합 (GitHub Pages)

Gateway, widget-react, adapters-google-places, adapters-exim, adapters-kakao, adapters-carrier-*, shipping-rates, duties, subscriptions, sdk-node, sdk-browser, key-provider, testing, checkout 오케스트레이터는 **Phase 2 이후** 이연. (14→6으로 Karpathy Surgical Changes 적용.)

**주요 기능**:
- 국가: KR/US/JP/CN/EU/BR 6개 필드 프리셋 (§5-3 세금ID HARD BLOCKERs)
- 통화: KRW/USD/JPY
- 배송/관세: **인터페이스만**(`ShippabilityOracle`, `DutyCalculator`), DAP 모드 기본 + 경고 배너
- 도메인 이벤트 카탈로그 + append-only event store + outbox 패턴 (§8)
- Locale/Currency Resolver + 구매자 Order Tracking 페이지 v1 (7단계)
- 토스 스타일 Docs 3원 구조 + 2-pane 샌드박스 (§10)
- GitHub Pages 샌드박스 + Cloudflare Workers 프록시 (4개 공용 데모 키)
- Apache 2.0 + DCO
- Vitest Small/Medium/Large tag + CI 분기 실행 (3분 내 Small)
- `api-linter` CI (Google AIP-121/132/134)
- `evals/` 5개 시나리오 YAML + 결정적 grader 3종
- **0.1 release — Toss 샌드박스 E2E 통과 + TTFP 측정 시작**

### Phase 1.5 (3–6개월)
- `@opencheckout/mcp-server` 별도 패키지 (Resources: 주문/환불 조회, Tools: 환불 human-in-loop, Prompts: CS 템플릿). **"AI-ready commerce API" 차별화 1등**.
- OpenAPI → OpenAI function-calling / Anthropic Tool Use 자동 export 빌드 스크립트
- StyleX 프로토타입 (widget 단일 컴포넌트)

### Phase 2 (6–12개월)
- `@opencheckout/checkout` 오케스트레이터
- Widget React
- `adapters-google-places`, `adapters-exim`, `adapters-kakao`
- `adapters-carrier-{cj, ems, dhl}` 3종 + 2차 확장(fedex, ups, sf-express, koreapost, hanjin, lotte)
- **배송 실구현**: 트래킹 통합, 라벨/CN22·23 생성, PUDO 픽업포인트, 반품/RMA
- `@opencheckout/shipping-rates` (v1 table-based + v2 캐리어 rate API)
- `@opencheckout/duties` (WCO HS 6-digit + 10개국 세율 테이블 + Zonos/Avalara/SimplyVAT/Easyship 어댑터)
- `@opencheckout/subscriptions` (토스 billingKey + dunning)
- 한국 현금영수증/세금계산서 자동 발행
- 지역 특화 결제수단 (Alipay/WeChat Pay/iDEAL/SEPA/Pix)
- CNY 경로 (Alipay-via-USD 또는 Antom PoC)
- `@opencheckout/admin-console` (self-host Next.js)

### Phase 3 (12개월+)
- Python/Go SDK (OAS 자동생성+래퍼, 커뮤니티 인증)
- 멀티-PG 라우터 (KG이니시스/NICE/KOMOJU/Stripe JP/Antom) + Cascading PG 폴백
- Java/Kotlin
- DDP 자동화 운영 (DHL DTP / FedEx DDP / UPS World Ease)
- 배송비 메가 통합 (EasyPost/Shippo)
- BNPL
- 정산 리콘실리에이션 + 회계 연동
- 네트워크 토큰 (Visa VTS/Mastercard MDES)
- 글로벌 e-Invoice
- PCI DSS 감사 외부 컨설팅

## 14.5 Team & Hiring Plan (신규 — B5)

### Current (2026-Q2)
- **ziho** (founder/maintainer) — 1인 FTE, 기술·제품·GTM 전담

### 채용 로드맵

| 시점 | 포지션 | 이유 | 비용 (연봉 + equity) |
|---|---|---|---|
| 2026-Q3 | Co-founder (Full-stack/SRE) | bus factor, release velocity | $80K + 5–15% |
| 2026-Q4 (seed 후) | BE Engineer | adapter 확장 + managed 인프라 | $90K + 0.5–1% |
| 2027-Q1 | DevEx / Docs Engineer | 기여자 유입 병목 해소 | $80K + 0.3–0.8% |
| 2027-Q4 end | — | 총 4인 팀 | — |

### Advisors (섭외 예정)
- **ex-Toss PaymentsDX lead**: 토스 파트너십·보안 심사 통과 조언 (0.25% equity)
- **ex-Shopify Payments PM**: 국제 결제 unit economics (0.25%)
- **법률 자문**: 김·장 또는 율촌 — **자문 계약 완료** (§25 Partnerships)

### Bus factor 완화
- 모든 ADR/PRD/운영 런북은 repo 내 markdown (knowledge = 공개)
- Secrets: 1Password shared vault + Shamir's secret sharing (founder + advisor 2-of-3)

## 14.6 Funding & Runway (신규 — B6)

### Pre-seed 타깃
- **금액**: $750K – $1.5M (18개월 runway)
- **타깃 투자자**:
  - **Y Combinator W26** (application 2026-08, 1순위 시도)
  - 국내: Altos Ventures, KB Investment, 스프링캠프
  - Strategic: 토스 내부 Venture team (파트너십 signal)
- **Valuation 가설**: $6M–$10M post-money (seed SAFE)

### Seed 조건 (투자자 마일스톤)
- [ ] Phase 1 GA 출시 (2026-09, ADR-018 Phase 0/1 체크리스트 완료)
- [ ] **50 활성 머천트** (무료 OSS + Managed 혼합)
- [ ] **$5K MRR** (Managed tier 유료 전환)
- [ ] **Toss 공식 파트너십 MOU 서명**
- [ ] SOC 2 Type I gap assessment 완료

### Burn & Runway
- **현 월 burn (1인)**: $5K
  - 도구: Cursor $20 + Claude $200 + Codex $200 + Vercel $20 + Neon $20 + Cloudflare $5 + Turnstile + Sentry $26 ≈ $500
  - 법무 월 자문료: $1,500 (리테이너)
  - 클라우드/인프라 여유분: $500
  - 생활비 보조: $2,500
- **Post-seed 월 burn (4인)**: ~$55K
- **18개월 runway @ $1.2M seed**: 22개월 여유 (gracefully)

## 14.7 Go-to-Market Motion (신규 — B7)

### Launch Week (Phase 1 GA = 2026-09)

| 요일 | 채널 | 콘텐츠 |
|---|---|---|
| 월 | Product Hunt | "OpenCheckout — OSS checkout for Korean cross-border D2C" |
| 월 | Hacker News Show HN | Technical deep-dive + sandbox link |
| 화 | Dev.to + Velog | "우리가 토스페이먼츠 + DDP를 오픈소스로 만든 이유" (한/영) |
| 수 | Karrotmarket Dev 밋업 | 30분 발표 + live demo |
| 목 | Toss Tech Insight | 게스트 포스트 (파트너십 전제) |
| 금 | Twitter/X + LinkedIn | MCP server 데모 영상 |

### 지속 유입 (Y1)
- **SEO (한글 롱테일)**: "토스페이먼츠 Next.js 연동" / "역직구 DDP 관세 자동화" / "juso.go.kr API Next.js" / "개인정보 국외이전 동의 모달"
- **Community**: Discord `#general #adapters #security #showcase`, 분기 기술 블로그 (ADR 해설 1편/월)
- **Conferences (2027)**: FEConf, PyCon KR, DevOps KR, JSConf JP
- **Content repurpose**: YouTube (한국어 튜토리얼 6편 Y1)

### Conversion Funnel & Targets

| 단계 | Y1 target | Benchmark |
|---|---|---|
| GitHub stars | 3,000 | Medusa 1yr=8K |
| npm downloads/week | 2,500 | Mid-tier OSS SDK |
| Sandbox sessions | 800/mo | — |
| Discord signups | 500 | — |
| Managed tier trial → paid | 3% | Stripe 2–5% |
| Managed tier churn | <5%/mo | SaaS median 6% |

## 14.8 Partnerships (신규 — B8)

| 파트너 | 목적 | 상태 | 기한 |
|---|---|---|---|
| **Toss Payments** | 공식 파트너 + API keys | ✓ **테스트 키 확보**, MOU 추진 | 2026-Q2 |
| **juso.go.kr** | 도로명주소 API 승인키 (법인 명의) | 신청 예정 | 2026-Q2 |
| **수출입은행** | 환율 authkey | 발급 신청 예정 | 2026-Q2 |
| **Google Places API** | 해외 주소 자동완성 | GCP 법인 계정 (보유) | 완료 |
| **Cloudflare** | Workers demo-keys 프록시 | 계정 보유, plan TBD | 2026-Q2 |
| **HackerOne** | Bug bounty 플랫폼 | paid ARR $10K 도달 후 | 2027-Q1 조건부 |
| **법무 (김·장 / 율촌 중 1개)** | 전금법/개보법 자문 리테이너 | ✓ **자문 계약 완료** | 진행 중 |
| **SOC 2 auditor (Vanta/Drata)** | Type I evidence pack | 평가 중 | 2026-Q4 |

### Non-partnership signals
- Shopify/Stripe: 의도적 **비제휴** 유지 (competitor alignment 방지)
- Cafe24: 장기 통합 가능하나 Y1 non-goal

## 15. Success Metrics (★ North Star TTFP로 교체 — B10)

### North Star
**TTFP — Time to First Payment** — 머천트가 sandbox 가입부터 실 sandbox 결제 승인(`payment.captured` webhook 수신)까지 걸리는 분.

| 시점 | Target | Benchmark |
|---|---|---|
| Y1 (2026) | **< 30 min** | Stripe ~60m, Toss ~90m |
| Y2 | < 15 min | — |
| Y3 | < 10 min (demo-keys + CLI) | — |

측정: sandbox 세션 시작(anon) → `payment.captured` webhook timestamp diff.

### Input metrics (Leading, weekly)
- GitHub stars (vanity, 방향 시그널만)
- npm downloads/week (`@opencheckout/core`)
- Sandbox session count (unique device fingerprint)
- Docs page views (docs.opencheckout.dev)
- Discord signups
- GitHub contributors (first-time PR merged)

### Output metrics (Paid, monthly)
- Active paid merchants
- GMV processed / month
- MRR / ARR
- Gross margin %
- NPS (quarterly survey, 30d-active 대상)

### Counter metrics (Health)
- Churn rate (monthly)
- Time to merge community PR (median)
- Security incident count (Sev-1/2)
- SLO violation count (ADR-019 §3.9)
- Managed tier support ticket / merchant

### Dashboard
- Grafana (self-hosted) + Posthog (product analytics) + Stripe Billing data
- Weekly 1-page report publicly shared (Buffer-style transparency)

## 16. Open Questions (사용자 결정 필요)

### 제품/범위
- **Q1. 프로젝트 이름 확정** — `opencheckout` 수용? 다른 후보?
- **Q2. Phase 1 국가 프리셋 6개 적합한가?** (KR/US/JP/CN/EU/BR)
- **Q3. CNY 지원 포기 vs Alipay-via-USD 우회 vs v1에서 Antom 어댑터 1등시민?**
- **Q4. "주소 모듈 단독 사용" 기능을 정말 지원?**

### 컴플라이언스 (★ 일부 해소)
- **Q5. PCI DSS v4.0 대응 범위** — ★ ADR-019 §3.12로 SAQ A-EP 확정. 공동 책임 매트릭스 작성은 진행 중.
- **Q6. 한국 주민등록번호는 완전 배제** (수집 불가) — ADR-009로 확정.
- **Q7. 디바이스 바인딩 Passkey의 v1 탑재 여부** — 필수? 옵션?

### PG/금융
- **Q8. 환율 가중치 기본값 10% 적합?**
- **Q9. 환차손 책임 정책** — 가맹점 부담 단일 vs 구매자 옵션?
- **Q10. 토스 외 PG v1에 1개라도 포함?** — 리서치 권고 "Toss 1개 집중" 유지.

### 인프라/운영
- **Q11. 샌드박스 Workers 프록시 유료화 경계** — 대규모 어뷰즈 시 운영 비용?
- **Q12. Issue/Discussion 한·영 이중 운영 비용**?

### 파트너십 (★ 대부분 해소)
- **Q13. 토스페이먼츠 영업 컨택** — ★ **테스트 키 확보 완료** (§25), MOU 추진 중.
- **Q14. juso/Google Places/수출입은행 authkey 발급** — 법인 명의로 진행 중 (§25).
- **Q14-법. 법무 자문** — ★ **자문 계약 완료** (§25).

### 캐리어 & 데이터 모델
- Q15 ~ Q20 PRD-v0 유지 — Phase 1 캐리어는 인터페이스만이므로 공식 계약은 Phase 2.

### 배송/결제 확장
- Q21 ~ Q28 PRD-v0 유지 — 모두 Phase 2 배치 확정.

### 관세 / DDP
- Q29 ~ Q34 PRD-v0 유지.

### 구매자 UX / 주문 라이프사이클 / 내부 콘솔
- Q35 (이벤트 버스) ✓ ADR 확정. Q36 (admin-console) Phase 2 독립 OSS 패키지 유지. Q37–39 유지.

### 스택 & 문서
- Q40 (Preact 25kB) ✓ 수용. Q41 (Gateway Node 고정) ✓ ADR-019로 Node 전체 확정. Q42 (Scalar) ✓ 수용. Q43 (JSR) — 플래그십 패키지만. Q44 (시크릿 매니저) — Doppler 기본.

### 비즈니스 (신규)
- **Q45 (B3-followup)**. 15명 인터뷰에서 Primary Persona와 불일치 시 SOM 재산정 기준점은?
- **Q46 (B6)**. YC W26 실패 시 bootstrap 연장 12개월 vs 국내 VC only?
- **Q47 (B7)**. Launch Week 콘텐츠 번역을 Crowdin 자동 LLM vs 수작업?
- **Q48 (B1)**. 0.30% GMV fee는 PSP 수수료 위에 얹히는데, 구매자가 아닌 머천트만 부담 구조 고수?

## 17. Risks & Mitigations (★ B9 비즈니스 리스크 병합)

| ID | Risk | Severity | Mitigation | Owner |
|---|---|---|---|---|
| R-Tech-1 | PCI DSS v4.0 위반으로 SAQ A-EP 전락 | High | ADR-019 §3.12 SAQ A-EP 선제 채택, postMessage PAN regex CI | ziho |
| R-Tech-2 | US de minimis 폐지 미대응 | High | 2025-08-29 규정 Phase 1 반영, EIN/SSN/ITIN 필수 캡처 | ziho |
| R-Tech-3 | EU GPSR RP 미검증 라벨 출고 | High | RP 없으면 체크아웃 차단 | ziho |
| R-Tech-4 | 주소 truncation silent fail | Med | Pre-flight validator + human review | ziho |
| R-Tech-5 | 수출입은행 API 일일 쿼터 초과 | Med | 4회/일 제한, Redis 캐시 30m (ADR-019 §3.4), 경보 | ziho |
| R-Tech-6 | 토스 CNY 미지원 오해 | Med | README 최상단 명시 | ziho |
| R-Tech-7 | pykakasi GPL 감염 | Low | `cutlet` 강제 전환 | ziho |
| R-Tech-8 | 공용 샌드박스 키 어뷰즈 | Med | Turnstile, IP 레이트리밋, BYOK 유도 | ziho |
| R-Tech-9 | 관세 오계산 → 머천트 손실 | High | 내장 룰 월 1회 업데이트 cron, 세율 스냅샷, `nonRefundable` 동의 | ziho |
| R-Tech-10 | DAP 수령 거부 배송비 폭증 | High | DAP 관세 추정치 강제 표시, 고위험 국가 DDP 기본 권고 | ziho |
| R-Tech-11 | HS code 오분류 | Med | Phase 2 카테고리 매핑 + 머천트 검수 | ziho |
| R-Tech-12 | US ICS2 filing 누락 | Med | 캐리어 어댑터 ICS2 필드 강제 스키마 | ziho |
| **R-Biz-1** | **Toss API 변경** | Med-High | adapter 패키지화(ADR-018), 공식 파트너 채널, version pinning | ziho |
| **R-Biz-2** | **개보법 개정 (국외이전 요건 강화)** | Low-High | 월 1회 법무 자문(§25), ADR-009 quarterly review | 법무 |
| **R-Biz-3** | **US de minimis 복원** | Low-Med | adapter 레이어로 정책 30일 내 전환 | ziho |
| **R-Biz-4** | **주요 기여자 이탈 (bus factor = 1)** | Med-High | Co-founder 영입 우선(§14.5), 문서화 100% | ziho |
| **R-Biz-5** | **경쟁사 fork → SaaS 판매** | Med | Trademark 등록, 공식 어댑터 인증 프로그램, CLA 없음(도덕적 moat) | ziho |
| **R-Biz-6** | **Bug bounty 현금 초과 지급** | Low-Med | Paid ARR $10K 도달 전 Hall of Fame only, HackerOne KR legal template | 보안 |
| **R-Biz-7** | **SLSA/SOC 2 비용 폭증** | Med | P0만 유지(2FA+provenance), Y2 ratchet | ziho |
| **R-Biz-8** | **15명 인터뷰에서 Primary Persona 불일치** | Med-High | SOM 재산정 + §1 재작성, pivot 옵션 | ziho |
| **R-Biz-9** | **Toss 자체 OSS SDK 출시** | Low-High | 멀티-PG + DDP + i18n 차별화 유지(§2.5) | ziho |
| **R-Biz-10** | **한국 VC 펀딩 실패** | Med-High | YC W26 적용, bootstrap 연장 12개월 설계 | ziho |

## 18. Governance

- `services/opencheckout/` 배치 (prototyping 단계이지만 product intent 명확)
- 승격 경로: `incubating/` 승격 불필요, 바로 `services/`에서 시작하고 OSS 공개 후 독립 레포로 이관 가능
- `.claude/` 워크스페이스 룰 상속 (plan-edit-discipline, overbuild-as-finding, validation-policy, code-quality-limits)
- `governance/ZONE-TAXONOMY.md`에 등록

## 18.5 Exit / Sustainability Scenarios (신규 — B11)

| Option | 조건 | Outcome | 유지되는 것 |
|---|---|---|---|
| **A. Independent SaaS** | Y3 $1M ARR, 100% YoY growth | Default path, Managed tier 수익으로 지속 운영 | Full team, OSS core |
| **B. Foundation (CNCF / OpenJS)** | Y3+ 커뮤니티 > 단일 회사 | Core → Foundation 기부, 회사는 Support & Managed layer만 | OSS core 영속성 보장 |
| **C. Strategic Acquisition** | Phase 3 이후, Toss/Shopify/Stripe 관심 표명 | $20M–$100M 범위 exit | 대부분의 OSS core는 유지 (acquirer commitment) |
| **D. Community Fork** | Creator 탈퇴 또는 funding 실패 | `opencheckout-community` fork, maintainers rotation | Apache 2.0 하 코드 영속, 상용 레이어 중단 |

### 지속 가능성 약속 (Sustainability Pledge)
- Apache 2.0 **영구 보장** (라이선스 변경 금지)
- Managed tier가 중단되어도 self-host 경로는 항상 열려 있음 (ADR-018 Thin harness 원칙)
- Exit 시나리오 C/D에 대비해 `docs/SUSTAINABILITY.md`에 커뮤니티 인수 프로토콜 사전 명시 (2026-Q3)

## 19. Cross-cutting Technical Concerns (ADR/TDD 링크 허브)

### 블로커 ADR
| ADR | 제목 | PRD 관련 섹션 |
|---|---|---|
| [ADR-002](../docs/adr/ADR-002-idempotency-and-saga.md) | Idempotency + Saga + effectively-once | §4 D5, §6-3~5, §8 |
| [ADR-003](../docs/adr/ADR-003-threat-model-stride.md) | STRIDE 위협 모델 + CSRF/SSRF/XSS 방어 | §4 D7, §6-5 |
| [ADR-004](../docs/adr/ADR-004-authn-authz.md) | Authn/Authz (API key + JWT + mTLS + scopes) | §4 D5/D6/D8, §8-4, §9-3 |
| [ADR-007](../docs/adr/ADR-007-dr-and-ir.md) | DR + IR 72h breach playbook | §6-3, §8-3 |
| [ADR-009](../docs/adr/ADR-009-pii-gdpr-lifecycle.md) | PII/GDPR 라이프사이클 + DSAR + crypto-shred | §5-6, §7-5 |

### Phase 1 착수 동시 확정
| ADR | 제목 | PRD 관련 섹션 |
|---|---|---|
| [ADR-001](../docs/adr/ADR-001-hexagonal-and-aggregates.md) | Hexagonal + aggregate 경계 | §4 D1/D2 |
| [ADR-005](../docs/adr/ADR-005-multi-tenancy.md) | Postgres RLS + per-tenant KMS DEK + quotas | §5-6, §9-3 |
| [ADR-006](../docs/adr/ADR-006-observability-slo.md) | SLI/SLO + tamper-evident audit chain | §4 D9, §8, §9 |
| [ADR-008](../docs/adr/ADR-008-supply-chain-security.md) | SLSA L2 + SBOM + Sigstore provenance | §11, §14 Phase 1 |
| [ADR-010](../docs/adr/ADR-010-error-contract-i18n.md) | RFC 7807 + `errors.yaml` 레지스트리 + i18n | §5-6 warnings, §9 |
| [ADR-012](../docs/adr/ADR-012-high-risk-flows.md) | 7개 고위험 경쟁조건 시퀀스 + 보상 | §5-9, §5-10, §6-4 |
| [ADR-014](../docs/adr/ADR-014-data-integrity.md) | 무결성 (hash chain + HMAC + SRI + WORM) | §5-6 audit, §6-5, §8 |
| [ADR-015](../docs/adr/ADR-015-automated-e2e-testing.md) | 자동 E2E 테스트 (Playwright + synthetic + chaos + mutation) | §10, §12 |
| [ADR-016](../docs/adr/ADR-016-reliability-engineering.md) | Reliability (circuit breaker + bulkhead + feature flag + progressive delivery) | §6, §14 Phase |
| [ADR-017](../docs/adr/ADR-017-security-testing-and-assurance.md) | 보안 테스트/감사 파이프라인 (SAST/DAST/pentest/bounty/PCI/SOC2) | §11, §14 |
| [ADR-018](../docs/adr/ADR-018-engineering-blueprint.md) | **엔지니어링 블루프린트** — gstack 파이프라인 + BigTech 선별 도입 + Karpathy 4원칙 | 전체 — Phase 1 패키지 14→6 축소 근거 |
| [ADR-019](../docs/adr/ADR-019-cross-adr-normalization.md) | **Cross-ADR 정규화** — 상태 vocab / TTL 3축 / 보관기간 / 네임스페이스 단일화 | §4 D5/D7, §5-6, §6-4/5, §8-1 |

### Phase 1 진행 중 확정
| ADR | 제목 |
|---|---|
| [ADR-011](../docs/adr/ADR-011-versioning-matrix.md) | API date / SDK SemVer / Webhook schema 3축 |
| [ADR-013](../docs/adr/ADR-013-concurrency-and-locking.md) | Pessimistic/Optimistic lock + advisory lock |

### Tech Design Docs
| TDD | 제목 |
|---|---|
| [TDD-01](../docs/tdd/TDD-01-gateway-design.md) | Gateway (Hono) 런타임 경계·미들웨어·DB 스키마·배포 |
| [TDD-02](../docs/tdd/TDD-02-event-sourcing-rebuild.md) | Event sourcing + projection rebuild 플레이북 |

### Open Questions 해소 현황
Q5 (PCI) ✓ ADR-019 §3.12. Q6 (RRN) / Q17 (rawResponse) / Q18 (KMS) / Q19 (Canonical scope) / Q23 (blocklist) / Q35 (이벤트 버스) / Q38 (read-model) / Q41 (Node/Edge 경계) / Q13 (Toss 파트너) / Q14-법 (법무 자문) 는 ADR 또는 §25 파트너십으로 확정. 나머지는 제품 범위 결정으로 §16 유지.

---

## 20. Business Model & Pricing (신규 — B1)

### 구조 (3-tier)

| Tier | 대상 | 가격 | 포함 | 비포함 |
|---|---|---|---|---|
| **OSS Core** | 개인/OSS 머천트 | **Free**, Apache 2.0 | `@opencheckout/core`, `adapter-toss`, `adapter-juso`, widget-vanilla, (Phase 2+) `adapter-cj`, `adapter-ems`, React wrapper | 호스팅, SLA, 계정 KMS |
| **Hosted Managed** | 월 주문 100–5,000 한국 D2C | **$99/mo starter + 0.30% GMV** | 매니지드 Gateway, juso/수출입은행/Places 공용 키, 업타임 99.5% SLA, 이메일 서포트 (48h) | per-tenant KMS, mTLS |
| **Enterprise** | 월 GMV $200K+ | **custom (floor $1.5K/mo)** | per-tenant KMS, mTLS, SOC 2 evidence pack, slack shared channel, 99.9% SLA, DPO 브리핑 | 공장 커스텀 코드 |

### 차별화 (Toss와 이중 과금 회피)
- 토스페이먼츠 가맹점 수수료(KRW 2.5–3.3%)는 **머천트 → Toss 직접** 정산. OpenCheckout은 주문 건별 SDK overhead 0.30%만 과금.
- Managed tier의 0.30%는 Shopify Plus 0.25%, Stripe 0.5% 사이 중간대. 토스와 경쟁하지 않고 **Toss 위에 얹는 orchestration layer**로 포지셔닝.
- Self-host (OSS Core)는 영구 무료 — Apache 2.0 + CLA 없음 + Sustainability Pledge(§18.5)로 고정.

### 가격 A/B 실험 계획
- **대상**: Beta waitlist 중 5개 머천트 (한국 D2C, 월 주문 300–1,500)
- **기간**: 2026-08 ~ 2026-10 (3개월)
- **Arms**: A=$99+0.30%, B=$49+0.45%
- **Primary metric**: 90일 retention × monthly revenue per merchant
- **Decision rule**: p<0.1 (n=5 unilateral), 실패 시 Arm A 유지
- **측정**: Stripe Billing (self-metering) + Posthog funnel

### 단가 가정 (Unit Economics v0)
- 평균 한국 D2C 월 GMV: $30K
- 0.30% of $30K = $90/mo GMV fee + $99 starter = **$189 ARPU**
- 서빙 원가: Cloudflare Workers + Neon Postgres = ~$12/mo/tenant
- **Gross margin**: ~93% (software-only, PSP 수수료 미포함)
- 위 단가는 고객 인터뷰 완료 전 추정치 — §1-6 완료 후 확정.

## 21. Market Sizing (신규 — B2)

### TAM — Total Addressable Market
- 한국 온라인 쇼핑 연 거래액 **210조원** (통계청 2024)
- 해외 역직구 비중 **3%** → **6.3조원** ≈ $4.7B
- OpenCheckout surface = 체크아웃 소프트웨어 레이어 전체

### SAM — Serviceable Addressable Market
- 자체 체크아웃을 구축/운영 가능한 **개발자형 셀러**:
  - Cafe24 플랫폼 밖 (자체 Next.js/Remix 운영)
  - 월 주문 100건 이상
  - 토스페이먼츠 이미 계약 완료
- 추정 규모: **1,000–3,000 머천트** (한국 패션·뷰티·식품 D2C, "브랜드 관리자" 설문 조합 추정)
- SAM 가격 적용 시 연 TAM: 2,000 × $2,268 ARPU annualized = **~$4.5M ARR**

### SOM — Serviceable Obtainable Market

| 시점 | 머천트 수 | ARR | Logic |
|---|---|---|---|
| Y1 (2026) | 50 | $113K | SAM 2.5%, Product Hunt + HN + Toss Tech 글 1편 |
| Y2 (2027) | 200 | $454K | Word-of-mouth + 토스 공식 파트너십 승인 |
| Y3 (2028) | 500 | $1.1M | 한국 점유 + 일본 pilot (adapter-gmo-pg) |

- SOM 가정의 반증 조건: Y1 end에 활성 머천트 < 25 → 피보팅 검토 (§18.5 Option D).

## 22 ~ 24. (Intentionally left for future business slots)

이 섹션은 향후 Business supplement 2차 반영 시 사용할 예약 번호. 현재 v1에서는 공란으로 두고 v1.x minor bump 시 채움.

## 25. Partnerships & Legal
§14.8 본문 참조. 이 섹션은 §14.8의 canonical 참조점이며, 파트너십 상태 변경 시 두 섹션 모두 갱신.

## 26. Team
§14.5 본문 참조.

## 27. Funding
§14.6 본문 참조.

## 28. GTM
§14.7 본문 참조.

## 29. North Star & Metrics
§15 본문 참조. TTFP를 primary North Star로 확정.

## 30 ~ 32. (Reserved)

예약 번호. 향후 minor bump 시 Business supplement 후속(e.g., Community Program, Certification Program, Public Roadmap Cadence)에 사용.

---

## 부록 A. 리서치 소스

- `research/01-shop-pay-cpo.md` — 벤치마킹, CPO 결정사항
- `research/02-global-shipping-customs.md` — 국가별 규정, 캐리어 제약
- `research/03-sdk-architecture.md` — 모노레포, BYO-key, PCI
- `research/04-validation-stack.md` — 주소/전화/세금ID/로마자 OSS
- `research/05-toss-payments-fx.md` — 토스 v2, 수출입은행, MID
- `research/06-oss-devex.md` — GitHub Pages 샌드박스, 라이선스, 기여자 전략
- `research/07-fe-be-stack.md` — FE/BE 스택 (Hono + Web Components + Preact)
- `research/08-technical-review.md` — PRD 기술 관점 적대적 리뷰 (17 차원 감사)
- `research/09-external-review.md` — 외부 전문가 7명 통합 리뷰 (만장일치 Block → 본 v1에서 비즈니스 11개 섹션 + ADR-018/019로 해소)
- `research/10-bigtech-and-gstack.md` — Google/Meta/Anthropic/OpenAI + gstack/gbrain + Karpathy 도입 분석

## 부록 B. Phase 1 패키지 의존 그래프 (★ 6패키지로 축소)

```
widget-vanilla ─→ core
                  ↑
address ──────────┤
  └─→ adapters-juso
payments ──→ core
  └─→ adapters-toss
```

Phase 2 확장 시 추가되는 의존성(widget-react, adapters-{google-places, kakao, exim, cj, ems, dhl}, shipping-rates, duties, subscriptions, checkout 오케스트레이터, sdk-node, sdk-browser, key-provider, testing, gateway)은 별도 트리로 관리.

---

## Changelog

### v1 (2026-04-24) — Business Sections Merged + ADR-018/019 Applied

**신규 섹션 (비즈니스 11개 — PRD-v1-business-sections.md §B1–B11 반영)**:
- §0.5 Business Snapshot (B1/B2/B5/B6 요약)
- §1-4~1-6 Primary Persona + Customer Evidence (B3)
- §2.5 Competitive Landscape (B4)
- §14.5 Team & Hiring (B5)
- §14.6 Funding & Runway (B6)
- §14.7 Go-to-Market (B7)
- §14.8 Partnerships (B8, Toss 테스트 키 확보 + 법무 자문 완료 반영)
- §17 Risk Register 확장 (B9 10개 비즈니스 리스크 병합)
- §15 North Star TTFP로 전면 교체 (B10)
- §18.5 Exit/Sustainability Scenarios (B11)
- §20 Business Model & Pricing (B1 canonical)
- §21 Market Sizing (B2 canonical)
- §25–29 Partnerships/Team/Funding/GTM/NorthStar canonical 재참조점

**ADR-018 적용 (Phase 1 축소)**:
- §4 D1: packages 디렉토리 트리 14 → **6개**(`core + address + payments + adapters-toss + adapters-juso + widget-vanilla`)
- §14 Roadmap Phase 1 본문 6패키지로 축소, Phase 1.5(mcp-server) 신설, 나머지 Phase 2+ 이연
- §11 DevEx: gstack 파이프라인, Karpathy 4원칙, Beyoncé Rule, PR 템플릿 명시
- §12 Testing: Google Small/Medium/Large 분류 + openai/evals YAML
- §4 D4: Google AIP-121/132/134 준수 명시
- 부록 B: Phase 1 의존 그래프 6패키지로 축소

**ADR-019 적용 (Cross-ADR 정규화)**:
- §4 D5: Order DAG canonical 교체 (`draft → pending_payment → paid → processing → label_purchased → in_transit → delivered → completed`), PaymentStatus canonical 7종 enum
- §4 D7: PCI SAQ A → **SAQ A-EP** 재분류, postMessage PAN regex CI 추가
- §5-6: `retentionPolicy: "indefinite"` 삭제 → `fieldClass` 태그 + Retention Matrix 참조
- §6-4: 취소/환불에서 `voided` vs `refunded`/`partially_refunded` 구분
- §6-5: `OC-Signature` 헤더 canonical (RFC 6648 `X-` 제거), constant-time 비교 명시
- §6-6, §8-1: 이벤트 카탈로그에서 `payment.approved` → `payment.captured` 통일, `shipment.label_purchased`에 AddressSnapshot immutable
- §8-3: Audit retention 7년/10년 분리 명시
- §17 R-Tech-1: SAQ A-EP 재분류 + R-Tech-5 FX TTL 30m(ADR-019 §3.4) 반영

**삭제/축소**:
- v0 §15 Success Metrics (OSS vanity 지표 5종) → §15 TTFP + 계층 메트릭 체계로 전면 대체
- v0 §14 Phase 1의 14패키지 목록 → Phase 1 6 + Phase 2 확장 분리
- v0 §2 Non-Goals에 Vue/Svelte wrapper, Python/Go/Java SDK 1차 제외 명시 추가

**v0에서 유지 (no-op)**:
- §0 네이밍, §3 Scenario golden path, §5-1~5-5 Address stack, §5-8~5-10 배송/관세 설계, §6-1~6-3 Toss/FX, §7 해외 역직구 UX, §8-2~8-5 데이터 액세스, §9 운영 콘솔, §10 샌드박스, §11 DevEx/문서, §13 Versioning, §18 Governance, §19 ADR/TDD 링크 허브, 부록 A 리서치 소스.

### v0 (2026-04-23)
리서치 10편 통합 + ADR 17편 + TDD 2편. 외부 리뷰 7명 만장일치 Block(`research/09-external-review.md`) → v1에서 해소.

---

**Next step**: 이 PRD v1에 대한 사용자 피드백/승인 → 네이밍 확정 → Open Questions 잔여 30+건 결정 → Phase 1 6패키지 Implementation Plan 작성(`plan/phase1-plan.md`) → 2026-05-01 인터뷰 킥오프 → 2026-06-01 v1.1 minor bump (인터뷰 실측 데이터 반영).
