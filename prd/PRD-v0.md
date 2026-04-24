# OpenCheckout SDK — PRD v0

| | |
|---|---|
| **Status** | Draft v0 (리서치 통합본, 사용자 승인 대기) |
| **Author** | ziho.shin@gmail.com |
| **Date** | 2026-04-23 |
| **Project code** | opencheckout (가제, 확정 전) |
| **Location** | `workspace-hub/services/opencheckout/` |
| **License (proposed)** | Apache 2.0 |
| **Benchmarks** | Shop Pay, Stripe Link, Medusa.js, Saleor |

---

## 0. 네이밍 후보

구현 착수 전 확정 필요. 제안 순위:
1. **opencheckout** — 스코프 명확, 검색성 양호, OSS 친화
2. **checkout-kit** — 가벼움, 중립적
3. **shipkit** — 배송 쪽 강조, 결제가 약해 보임
4. **paybridge** — 결제 편향
5. **koncheckout** — KR 정체성 강조, 글로벌 모호

패키지 네임스페이스(jsr/npm): `@opencheckout/*` (e.g., `@opencheckout/core`, `@opencheckout/address`, `@opencheckout/payments`)

## 1. Problem / Opportunity

**Problem**. 한국 셀러가 국내+해외로 배송/결제를 태울 때:
- 주소 입력(한국 juso/Kakao, 글로벌 Google Places), 다국어 표기(한/영/일/중), 캐리어 송장 규칙(글자수·언어), 세금ID/통관(국가별 상이), 다통화 결제, 환율 가중치, PCI 스코프를 개별 통합해야 함
- 기존 OSS(Medusa/Saleor)는 커머스 엔진 전체를 끌어와야 하고 아시아 규정을 얇게만 다룸
- Shop Pay는 Shopify 종속, Stripe Link는 한국 PG 미지원

**Opportunity**. "**주소+결제 only 초경량 체크아웃 SDK**, 아시아 퍼스트 + 토스페이먼츠 1급 + 정준 로마자/세금ID" 포지션은 실제 시장 공백. framework-agnostic 임베드 + 오픈소스 + GitHub Pages 샌드박스.

**Definition of Awesome**:
- 머천트가 **3줄 코드**로 한국 주소 검색 → 영문 변환 → 토스 결제 완결
- 공개 샌드박스에서 **키 없이** 한 페이지 데모가 15초 안에 돈다
- 2026-08-29(US de minimis 폐지 1주년) 전까지 공개 릴리스

## 2. Non-Goals (v1 스코프 밖)

- 커머스 엔진(상품/재고/주문 DB) — Medusa/Saleor 대체 아님
- 카드 호스팅 필드 자체 구현(PCI DSS Level 1) — Toss iframe만 래핑
- 사기방지 시그널 OSS 공개 구현 — 훅만 제공, Sift/Signifyd 어댑터로 위임
- 물류 부킹/트래킹 — v2 검토
- 복수 PG 심층 통합 — v1은 Toss 1개, v2에 KG이니시스·NICE·Antom·KOMOJU 어댑터

## 3. User & Scenario

### Primary persona: Solo/SMB 셀러 개발자
- 한국발, 한국+해외 배송, Shopify/WooCommerce 밖에서 자체 체크아웃 원함
- Node/Next.js 스택, 토스페이먼츠 라이브 키 보유, 영어 문서 읽기 가능
- 월 주문 100–5,000건 규모

### Secondary persona: 엔터프라이즈 커머스팀
- 한국 브랜드 글로벌 D2C, 다국어 주소·다통화·해외 통관 규정 컴플라이언스 필요

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
├── packages/                       # Phase 1 (TS)
│   ├── core/                       # 타입·에러·idempotency·KeyScope 타입 시스템
│   ├── address/                    # 주소 입력 모듈 (BYO-key, framework-agnostic)
│   ├── payments/                   # 결제 모듈 (PCI SAQ A 경계)
│   ├── checkout/                   # 두 모듈 오케스트레이터 (선택적)
│   ├── sdk-node/                   # 서버용 HTTP 클라이언트
│   ├── sdk-browser/                # 브라우저 SDK
│   ├── widget-react/               # React 컴포넌트
│   ├── widget-vanilla/             # <script> 한 줄 (GitHub Pages)
│   ├── adapters-toss/              # 토스페이먼츠
│   ├── adapters-juso/              # juso.go.kr (KR)
│   ├── adapters-kakao/             # Kakao Local
│   ├── adapters-google-places/     # Google Places New
│   ├── adapters-exim/              # 수출입은행 환율
│   ├── key-provider/               # env/KMS/Vault
│   ├── testing/                    # msw 핸들러·픽스처
│   └── codemod/                    # 브레이킹 마이그레이션
├── services/gateway/               # 선택형 self-host 서버 (Hono/Fastify)
├── sdks/                           # Phase 2+ (python/go/java)
├── examples/                       # nextjs-checkout, github-pages-embed, python-backoffice
├── docs/                           # Docusaurus (i18n: ko/en/ja)
└── tools/
```

### D2. "두 모듈 + 얇은 오케스트레이터"
`@opencheckout/address` 단독 채택 가능(주소만 필요한 머천트 포획), `@opencheckout/payments` 단독 가능, `@opencheckout/checkout`은 두 모듈을 세션 토큰으로 묶는 얇은 wrapper. PCI 스코프는 `payments`로 격리.

### D3. 멀티언어 SDK 순서
**TS (Phase 1, 3개월)** → **Python (Phase 2)** → **Go** → **Java/Kotlin**. OpenAPI 3.1을 단일 진실원으로 두고 `openapi-generator` + 손수 래퍼.

### D4. 프로토콜
**REST + OpenAPI**. Stripe/Twilio 동일. tRPC/GraphQL 기각 이유: 멀티언어 SDK 목표와 충돌.

### D5. 상태관리
서버 사이드 상태기계: `draft → pending → captured → settled`. 클라이언트는 **단기 Session Token**(서명 JWT 5분)만 보유. PII/키 무보유. `Idempotency-Key`(UUIDv4) 필수, 24h 캐시.

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

### D7. PCI DSS 스코프 최소화 (SAQ A 유지)
- 카드 PAN은 SDK 서버 **절대 미경유**
- Toss **iframe hosted fields 또는 redirect만** (자체 iframe 관리 금지)
- postMessage 화이트리스트
- 서버는 `paymentKey/orderId/amount`만 수신 → Toss confirm 호출
- DB 스키마 PAN 컬럼 금지 (마이그레이션 린터)
- **PCI DSS v4.0 2025-03 발효**: 머천트가 악성 스크립트 보호 입증 경로를 문서화해야 함

### D8. 인증 UX
- **OTP (이메일/전화)** + **WebAuthn/Passkey 병행**
- 디바이스 바인딩 기본 on
- 프리필은 OTP/Passkey 성공 후에만 (SIM swap 방어)

### D9. FE / BE / Tooling 확정 스택

외부 전문가 리서치(`research/07-fe-be-stack.md`, Stripe/Shopify/Toss/Hono/벤치마크 교차검증) 기반 확정.

| 영역 | 선택 | 핵심 근거 |
|---|---|---|
| 위젯 코어 | **TS + Web Components + Preact (25kB gzipped)** | iframe 바깥 WC, iframe 안 Preact로 Stripe Elements 패턴 재현. 프레임워크 중립 유지 |
| FE 래퍼 | React / Vue / Svelte 개별 패키지 | 생태계 커버 |
| Gateway | **Hono** (Node primary, Edge secondary) | Workers/Edge/Node/Bun/Deno 단일 코드 |
| API 스타일 | REST + OpenAPI 3.1 | 다언어 SDK SSOT (tRPC/GraphQL 기각) |
| DB | **PostgreSQL + outbox 패턴 + LISTEN/NOTIFY** | V1은 EventStoreDB 없이 단일 PG로. V2 Kafka/Debezium 경로만 열어둠 |
| 암호화 | **App-layer envelope (KMS DEK) + pgcrypto 보조** | 멀티테넌시·키 로테이션 유리. pgsodium 기각 |
| 라이브러리 빌드 | **tsup** (dual ESM/CJS, d.ts) | — |
| 위젯 빌드 | **Vite** (lib mode) | — |
| 린터/포매터 | **Biome** (+필요 시 ESLint) | 10–100× 속도, 기여자 마찰↓ |
| 테스트 | **Vitest + Playwright** | iframe·E2E 특화 |
| OAS 클라이언트 | openapi-typescript + openapi-fetch (8kB) | 런타임 경량 |
| 멀티언어 SDK | OAS + 생성 70% / 수작업 30% | Stripe/Twilio 하이브리드 |
| Spec 게이트 | Spectral + oasdiff | breaking CI 차단 |
| 문서 | **Docusaurus 3 + Scalar + Algolia DocSearch + Sandpack** | i18n·OSS 친화·"Try it" (Mintlify/Redoc 기각) |
| 배포 기본 | **Docker Compose → Fly.io → K8s Helm** | self-host 우선. Vercel 기각(장시간 잡 부적합) |
| 시크릿 | **Doppler 또는 1Password SDK** (어댑터: Vault, AWS Secrets Manager) | 벤더 락인 회피 |
| 관측성 | **OpenTelemetry + Sentry Browser** | exporter 교체만으로 Grafana/Datadog/Honeycomb 선택 |
| 배포 파이프 | Changesets + npm + JSR 듀얼 퍼블리시 | Deno/Bun 네이티브 타입 |
| 기여자 환경 | devcontainer + nix-shell + pnpm | Codespaces 원클릭 60초 부팅 |

**핵심 런타임 경계 (중요)**:
- **Edge 런타임**(Cloudflare Workers/Vercel Edge)은 **위젯 토큰 발급 + 공개 조회만** 허용
- **Node 런타임**은 **Toss 승인 API 호출 + 웹훅 수신 전용** — 고정 IP allowlist 가능성, 타임아웃/재시도 제어, Node crypto 특화 동작 대응
- 이 경계를 Hono 어댑터 레벨에서 타입 시스템으로 강제

**번들 예산**:
- `@opencheckout/widget-vanilla` ≤ 25kB gzipped (Stripe.js v3 ~30kB 대역)
- `@opencheckout/sdk-browser` ≤ 18kB
- `@opencheckout/sdk-node` 번들 없이 ESM 트리쉐이킹만

## 5. Address Module — 상세

### 5-1. API 스택 (확정)
| 용도 | 채택 | 폴백 |
|---|---|---|
| 한국 주소 검색 | juso.go.kr 도로명주소 Open API | Kakao Local |
| 한국 영문 변환 (주소) | juso.go.kr 영문주소 API (data.go.kr #15057413) | `hangul-romanize` (이름만) |
| 글로벌 주소 | Google Places Autocomplete (New), 세션 토큰 ko→en 2콜 | HERE v7, Mapbox |
| 주소 포맷 규칙(서버) | `google-i18n-address` (Chromium libaddressinput) | — |
| 주소 포맷 규칙(클라) | `@shopify/address` | — |
| 전화 검증 | `libphonenumber-js`(JS) / `phonenumbers`(Py) | — |
| 세금ID 검증 | `python-stdnum` | VIES(EU 실시간) |
| 여권 MRZ | `mrz` (MIT, JS) | — |
| 로마자(중) | `pypinyin` (MIT) | — |
| 로마자(일) | **`cutlet`** (MIT) | **`pykakasi` 금지 — GPL 블로커** |
| 로마자(한, 이름만) | `hangul-romanize` (BSD) | — |

ISO 3166-2 (`KR-11`, `JP-13`, `CN-11`)로 두 포맷 라이브러리 공통 매핑.

### 5-2. UX
- 국가 **먼저** 선택 (Baymard 권고). 국가별 필드/라벨/검증 동적 리렌더
- 주/도/성 등 큰 행정구역은 **검색 가능 드롭다운 + 직접 입력** (`google-i18n-address`의 `country_area_choices` 소스)
- 우편번호 → City/State 자동감지 (한·일·미 우선)
- 전화는 E.164 자동 포매팅
- 한/영/일/중 다국어 주소 응답 객체 반환 (구조 동일, 언어별 `localized`)
- 자주 쓰는 주소: 별칭/저장/수정/삭제 (`@opencheckout/address/book`)

### 5-3. 세금ID/통관 동적 필드 (Non-Negotiable)
| 국가 | 필드 | 검증 |
|---|---|---|
| 미국 | EIN/SSN/ITIN/CAN | 포맷 + 체크섬 |
| 중국 | 身份证号 18 digits | GB 11643 체크섬, 三单比对 (주문=결제=ID 이름 일치), RMB 5K/거래 · 26K/연 카운터 |
| 대만 | 統一編號 8 / 身分證字號 L+9 | 체크섬. **EZ WAY 인증 완료 전 라벨 차단**, 6parcels/6mo 카운터 |
| 일본 | (라벨 불필요) | CIF ¥10K 면세 경고 |
| EU | VAT + EORI + **GPSR Responsible Person** | VIES, EORI 포맷, **RP 없으면 체크아웃 차단** |
| UK | UK VAT + GB EORI | 포맷 |
| 인도네시아 | NPWP 15 / NIK | 포맷 |
| 베트남 | MST 10/13 | 포맷 |
| 태국 | Thai ID 13 | 체크섬 |
| 싱가포르 | — (판매자 OVR) | 경고 |
| 말레이시아 | MyKad 12 | 포맷 |
| 브라질 | **CPF 11 / CNPJ 14 — HARD BLOCKER** | 체크섬, 없으면 송장 생성 불가 |
| 멕시코 | **RFC 12/13 / CURP 18 — HARD BLOCKER** | 체크섬 |

### 5-4. 캐리어 커버리지 & 송장 Pre-flight Validator

#### 5-4-1. 커버리지 매트릭스

**한국 배송사 — 전 범위 커버** (Phase 1 필수 어댑터):

| 배송사 | API | 주요 용도 | 라인 한도(국내) | 국제 발송 |
|---|---|---|---|---|
| CJ대한통운 (CJ Logistics) | 파트너 API | B2C 주류, 국제 재위탁(FedEx/DHL) | 국내 한글 가능 | 있음(CJ Global) |
| 우체국 택배 / EMS (Korea Post) | biz.epost.go.kr / uniwebapi | 국내+국제, 가성비 | 한글 가능 | **EMS 정부 네트워크** |
| 한진택배 (Hanjin) | 파트너 API | B2C | 한글 | 계약 기반 |
| 롯데택배 (Lotte Global Logistics) | 파트너 API | B2C + 글로벌 | 한글 | 있음 |
| 로젠택배 (Logen) | 파트너 API | B2C | 한글 | 없음 |
| 경동택배 (Kyungdong) | 파트너 API | B2B 대형화물, 도서산간 | 한글 | 없음 |
| 대신택배 (Daesin) | 파트너 API | 도서산간/대체배송 | 한글 | 없음 |
| 일양로지스 (Ilyang) | 파트너 API | 국제 포워딩 | — | 있음 |
| 쿠팡로지스틱스 (Coupang CLS) | 비공개/파트너 | 쿠팡 셀러 전용 | 한글 | 없음 |
| GS25 / CU 편의점 택배 | 브랜드 API | 편의점 접수 | 한글 | 없음 |

> 한국 커버리지 구현 순서: 1차 CJ/우체국/한진/롯데 → 2차 로젠/경동/편의점 → 3차 쿠팡/대신/일양.

**해외 배송사 — 글로벌 주요** (Phase 1 필수: EMS, FedEx, UPS, DHL, SF Express + 지역 특화 어댑터):

| 배송사 | 지역 | 라인 max | 언어 제약 | 비고 |
|---|---|---|---|---|
| **EMS** (UPU 국제우편) | 전세계 (정부 포스트 네트워크) | 라틴 50–60자, 합계 200자 | 현지어 가능, 영문 헤드 필수 | 가장 보편적 글로벌 폴백 |
| **FedEx** (Ship Manager API) | 전세계 | **35자 ASCII** | non-ASCII 거부 | 라틴 강제 |
| **UPS** (Rating/Shipping API) | 전세계 | **30자 ASCII** | 라벨 ASCII | 최저 공통분모 |
| **DHL Express** (MyDHL API) | 전세계 | **45자 라틴** | 현지어 병기 허용 | 가장 너그러움 |
| **SF Express / 順豐** | 중화권, SEA, KR-CN | ~35자 | 중문/영문 혼용 | CN 입국 우대 |
| **USPS** (Web Tools) | US 국내 | 35자 | ASCII | US 국내 Last-mile |
| **Japan Post / Yu-Pack** | 일본 국내 + EMS | 일본어/영문 | 일본어 OK 국내 | 일본 국내 저렴 |
| **Yamato Transport (クロネコ)** | 일본 국내+국제 | 일본어/영문 | 일본어 OK | 일본 B2C 1위 |
| **Sagawa Express** | 일본 국내 | 일본어 | 일본어 | 일본 B2B 강세 |
| **China Post EMS** | 중국 국내+국제 | 중문/영문 | 중문 OK 국내 | 저가 글로벌 |
| **Cainiao** (菜鸟) | 중국 발송 + Alibaba 네트워크 | 중문/영문 | — | AliExpress/1688 |
| **ZTO / YTO / STO / Yunda / J&T Express (极兔)** | 중국 5대 사설 + 동남아 | 중문/영문 | — | 중국 내 저가 |
| **TNT** (FedEx 소유, 일부 지역 별 API) | EU | FedEx 준용 | 라틴 | EU 내부 강세 |
| **PostNL / DPD / GLS / DB Schenker** | EU | 40–45자 | 라틴 | EU 지역 |
| **Australia Post / StarTrack** | AU | 40자 | 영어 | 오세아니아 |
| **Aramex** | 중동, 남아시아 | 35자 | 라틴 | MENA 강세 |
| **Pos Malaysia / Pos Laju** | MY | 영문 | 라틴 | MY 국내 |
| **Ninja Van / J&T / Flash Express** | SEA | 영문/현지어 | 라틴 권장 | SEA 라스트마일 |
| **Correios (브라질)** | BR | 40자 | 라틴 | BR 국내 |
| **Estafeta / Redpack** | MX | 40자 | 라틴 | MX 국내 |

> 해외 커버리지 구현 순서: 1차 EMS/FedEx/UPS/DHL/SF → 2차 USPS/Japan Post/Yamato/China Post/Cainiao → 3차 PostNL/DPD/Aramex/Ninja Van → 4차 롱테일.

#### 5-4-2. Pre-flight Validator 규칙 (공통)
- 라인당 **30자 기본 truncate** (UPS 최저 공통분모), DHL/EMS 선택 시 45자로 완화
- 구조 분할: `line1 = road+number`, `line2 = building+unit`, `line3 = district/city`
- 결정적 약어 사전: APT, BLDG, FL, RM, RD, ST, AVE, BLVD, STE, DEPT
- 초과 시: 캐리어 자동 폴백 제안 체인 (UPS→FedEx→DHL→EMS) + RTS 보험 권고
- 실패 시 원본 CJK 문자열 metadata 보존 + **human review 마킹** (silent machine romanization 절대 금지)
- 캐리어별 허용 언어 매트릭스를 `@opencheckout/adapters-<carrier>`가 선언 → `address.formatForCarrier(addr, 'fedex')` 단일 호출로 변환

### 5-5. 주소록 기능
- 사용자별 복수 주소 저장 (별칭: "집", "회사", "엄마네")
- 수정/삭제, 기본 배송지 지정
- 스토리지 어댑터: localStorage (스탠드얼론), Postgres/MySQL 어댑터 제공 (self-host)
- PII 암호화(KMS 어댑터 인터페이스)

### 5-6. 주소 데이터 모델: User-facing DTO vs Internal Canonical Record (★ 핵심 설계)

**원칙**: 사용자에게 보여주는 값과 서버가 저장하는 값을 완전히 분리한다. 사용자 DTO는 얇고 현지 언어 중심, 내부 Canonical Record는 뚱뚱하고 감사·확장·재변환 가능하게 설계한다.

#### 5-6-1. Layer 1 — `AddressDisplayDTO` (사용자 노출용)

```ts
// 사용자의 장바구니/마이페이지/주소록 UI에서만 사용. 최소 필드, 단일 언어.
interface AddressDisplayDTO {
  id: string;                    // opaque — 서버 식별자, 내부구조 노출 금지
  alias?: string;                // "집", "Office"
  displayLocale: BCP47;          // 사용자 브라우저/선호 언어 (ko, en, ja, ...)
  formatted: string;             // 한 줄 포매팅 "서울특별시 강남구 테헤란로 123 래미안아파트 101동 1501호"
  recipient: {
    name: string;                // displayLocale 언어
    phoneE164: string;           // "+821012345678"
  };
  countryCode: ISO3166A2;        // "KR"
  postalCode?: string;
  isDefault: boolean;
  verified: boolean;             // 주소 검증 통과 여부 (서비스단 신호)
}
```

> 사용자 DTO는 **데이터 복구가 불가능할 정도로 얇다**. 다국어, 카운티, 세금ID, 지오코드, 원본 API 응답은 전혀 포함하지 않는다. 프론트 디버거·네트워크 탭·스크린샷으로 유출돼도 재구성 불가.

#### 5-6-2. Layer 2 — `AddressCanonicalRecord` (서버 저장용, 뚱뚱하게)

```ts
interface AddressCanonicalRecord {
  // ── Identity
  id: ULID;                              // 내부 식별자 (sortable)
  version: number;                       // 레코드 버전 (수정시 bump, 이전 버전은 history 테이블)
  schemaVersion: "2026-04-23";           // 스키마 진화 추적
  tenantId: string;                      // 머천트 ID (멀티테넌트)
  ownerUserId?: string;                  // 사용자 계정 (null = 게스트 1회성)
  alias?: string;
  purposeTags: ("shipping" | "billing" | "pickup" | "return")[];

  // ── Provenance (어디서 온 값인가)
  source: {
    provider: "juso" | "kakao" | "naver" | "google-places" | "here" | "manual" | "import";
    providerRecordId?: string;           // juso 관리번호 / Google placeId
    sessionToken?: string;               // Google Places 세션(과금/추적)
    retrievedAt: ISO8601;
    rawResponse: object;                 // 원본 JSON 전체 보관 (재파싱·감사)
    rawResponseHash: string;             // sha256 → 변경 감지
  };

  // ── Administrative hierarchy (UN/LOCODE + ISO 3166-2 계층)
  geography: {
    countryCode: ISO3166A2;              // "KR"
    countryCode3: ISO3166A3;             // "KOR"
    admin1: { code: string; name: LocalizedText };  // 시/도, 州, Prefecture, State
    admin2?: { code?: string; name: LocalizedText }; // 시/군/구, County, 市
    admin3?: { code?: string; name: LocalizedText }; // 동/읍/면, 区
    locality?: LocalizedText;            // 법정동/행정동
    sublocality?: LocalizedText;         // 리
  };

  // ── Street & premise
  street: {
    kind: "road-name" | "lot-based" | "po-box" | "rural";  // 한국 도로명/지번 구분
    primary: LocalizedText;              // "테헤란로"
    number?: string;                     // "123"
    secondary?: LocalizedText;           // "사거리", suffix
  };
  premise?: {
    buildingName?: LocalizedText;        // "래미안아파트"
    buildingId?: string;                 // 한국 건물관리번호, Japan 建物コード
    block?: string;                      // 101동
    floor?: string;                      // 15F
    unit?: string;                       // 1501호
    room?: string;                       // 내부 실 번호
  };
  postalCode: {
    value: string;
    format: "KR-5" | "US-ZIP5" | "US-ZIP9" | "JP-7" | "EU-*";
  };

  // ── Multilingual localizations
  // 같은 주소를 5개 언어로 보관 — 캐리어별로 필요한 언어로 재조립 가능
  i18n: {
    "ko": LocalizedAddressView;
    "en": LocalizedAddressView;
    "ja"?: LocalizedAddressView;
    "zh-CN"?: LocalizedAddressView;
    "zh-TW"?: LocalizedAddressView;
  };

  // ── Recipient
  recipient: {
    name: {                              // 이름은 개인 선호 표기 우선
      given: LocalizedText;
      family: LocalizedText;
      preferredLatin?: string;           // 여권 표기 (Kim Min-su)
      kana?: string;                     // 일본 furigana
      pinyin?: string;                   // 중국 병음
    };
    phoneE164: string;
    phoneType?: "mobile" | "fixed_line" | "unknown";
    email?: string;
  };

  // ── Tax/Customs Identification (국가별 플러그형)
  taxIdentifiers: Array<{
    kind: "US_EIN" | "US_SSN" | "US_ITIN" | "CN_RESIDENT_ID" | "TW_BUSINESS_ID"
        | "TW_NATIONAL_ID" | "EU_VAT" | "EU_EORI" | "EU_IOSS" | "UK_VAT" | "UK_EORI"
        | "BR_CPF" | "BR_CNPJ" | "MX_RFC" | "MX_CURP" | "JP_MYNUMBER"
        | "ID_NPWP" | "ID_NIK" | "VN_MST" | "TH_NID" | "MY_MYKAD" | "PASSPORT" | "OTHER";
    value: string;                       // 암호화 저장 (envelope encryption, KMS)
    checksum: "valid" | "invalid" | "not_checked";
    issuedCountry?: ISO3166A2;
    holderName?: LocalizedText;          // 三单比对용 (중국)
  }>;
  complianceFlags: {
    ezwayVerified?: boolean;             // 대만
    gpsrResponsiblePersonId?: string;    // EU
    cbecQuotaUsedRMB?: number;           // 중국 CBEC 누적
    usDeMinimisClaim?: boolean;          // US de minimis (폐지 이후 경고)
  };

  // ── Geospatial
  geo?: {
    lat: number;
    lng: number;
    accuracy: "rooftop" | "street" | "centroid";
    plusCode?: string;                   // Google Plus Code
    geohash?: string;                    // geohash-8
    timezone?: string;                   // "Asia/Seoul"
  };

  // ── Carrier routing (pre-computed, 캐시)
  carrierFormats: {
    [carrierCode: string]: {
      line1: string;
      line2?: string;
      line3?: string;
      language: BCP47;
      truncationApplied: boolean;
      abbreviationsApplied: string[];    // ["APT", "RD"]
      computedAt: ISO8601;
      byteLength: number[];
    };
  };

  // ── Delivery preferences
  deliveryNotes: {
    text: LocalizedText;                 // "경비실 맡겨주세요"
    accessCode?: string;                 // 공동현관 비밀번호 (암호화)
    preferredWindow?: { start: ISO8601Time; end: ISO8601Time };
    safePlaceHints?: string[];
  };

  // ── Validation / Trust
  validation: {
    validatedAt?: ISO8601;
    validatedBy: Array<"juso" | "google-places" | "libphonenumber" | "stdnum" | "carrier-preflight">;
    confidence: number;                  // 0.0 – 1.0
    warnings: Array<{ code: string; message: string; severity: "info" | "warn" | "error" }>;
  };

  // ── PII encryption envelope
  pii: {
    encryptionKeyId: string;             // KMS key ARN / Vault path
    algorithm: "AES-256-GCM";
    ciphertextFields: string[];          // ["recipient.phoneE164", "taxIdentifiers[*].value", …]
  };

  // ── Audit & lifecycle
  audit: {
    createdAt: ISO8601;
    createdByActor: ActorRef;
    updatedAt: ISO8601;
    updatedByActor: ActorRef;
    deletedAt?: ISO8601;                 // soft delete
    retentionPolicy: "indefinite" | "3y" | "purge-on-inactivity";
    changeLog: Array<{ at: ISO8601; actor: ActorRef; diff: JSONPatch }>;
  };
}

type LocalizedText = { [locale: BCP47]: string };   // { ko: "서울", en: "Seoul", ja: "ソウル" }
type LocalizedAddressView = {
  formatted: string;
  formattedMultiline: string[];
  components: Record<"country" | "admin1" | "admin2" | "locality" | "street" | "premise" | "postalCode", string>;
};
```

#### 5-6-3. 핵심 설계 규칙

1. **원본 API 응답 원본 전량 보관** (`source.rawResponse`). 주소 구조 해석이 나중에 바뀌어도 재파싱 가능
2. **다국어는 한 번에 5개 locale 보존** (Google Places ko→en 2콜 + juso KR 영문 API + romanization 라이브러리 조합). 나중에 추가 언어 필요 시 라이브러리 변환만 돌려 백필
3. **캐리어 포맷은 캐시** (`carrierFormats[carrierCode]`) — pre-flight validator 결과를 저장해 같은 주소 재포맷 비용 제거
4. **세금ID는 복수(`Array`)** — 한 주소에 CPF + EU VAT 공존 가능 (의류 B2B 수출 케이스)
5. **레거시 호환 필드 금지** — schemaVersion으로 마이그레이션, deprecated 필드는 삭제. 다만 `source.rawResponse`가 있어 재계산 가능
6. **PII는 envelope encryption** — 컬럼 단위 KMS 키, 재생성 키 rotation 시 `pii.encryptionKeyId` 교체 후 재암호화 잡
7. **버저닝**: 수정은 새 `version`으로 bump, 이전 버전은 `audit.changeLog` 또는 별도 `address_history` 테이블 (규제 7년 보관 대응)
8. **soft delete 기본** — 주문 원장에서 주소 참조가 끊어지지 않도록
9. **ID 정책**: 외부 공개는 opaque(UUID), 내부 정렬은 ULID, juso/Google 원본 ID는 `source.providerRecordId`로 별도 보관

#### 5-6-4. 매핑 계층 (DTO ↔ Canonical)

```ts
// 프론트 → 서버
interface AddressSubmitInput {
  // 사용자 입력 원본 (프론트 폼 값 그대로)
  countryCode: ISO3166A2;
  inputLocale: BCP47;
  rawFields: Record<string, string>;   // 폼 필드 원본
  providerHints?: {
    source: "juso-autocomplete" | "google-places" | "manual";
    providerRecordId?: string;
    sessionToken?: string;
  };
}

// 서버에서 resolver 체인 실행:
// 1. AddressResolver.resolve(input) → 원본 API 재호출 or 캐시된 rawResponse 파싱
// 2. AddressNormalizer.normalize(raw) → geography/street/premise 추출
// 3. AddressLocalizer.localize(canonical, [ko,en,ja,zh-CN,zh-TW]) → i18n 백필
// 4. PhoneValidator / TaxIdValidator / AddressVerifier 병렬 실행
// 5. CarrierFormatPrecomputer(canonical, merchant.carrierSet) → carrierFormats 채움
// 6. PIIEnvelope(canonical) → 암호화 필드 마킹 후 저장
// 7. 응답: AddressDisplayDTO만 클라이언트에 반환
```

#### 5-6-5. 확장성 고려

- **신규 locale 추가** → `i18n` Record에 키만 추가, rawResponse 기반 백필 스크립트 재실행
- **신규 캐리어 추가** → `@opencheckout/adapters-<carrier>` 패키지만 드롭인, `carrierFormats[newCarrier]` 채움
- **신규 세금ID 종류** → `taxIdentifiers[].kind` 유니온 확장 + `python-stdnum` 체크섬 매핑 테이블 추가
- **통관 규정 변경** → `complianceFlags` 필드 추가 (schemaVersion bump, 마이그레이션 스크립트)
- **지오코딩 공급자 교체** → `geo`는 공급자 중립, `source.provider`만 교체
- **연동성**: OpenAPI 3.1 스펙에 이 모델을 `AddressCanonicalRecord` 컴포넌트로 공개 → 멀티언어 SDK가 동일 계약 공유

#### 5-6-6. 외부 연동 엔드포인트 (Gateway)

| Path | 용도 | 반환 |
|---|---|---|
| `POST /v1/addresses` | 신규 생성 | `AddressDisplayDTO` |
| `GET /v1/addresses/:id` | 조회 (권한별 view) | `AddressDisplayDTO` or `AddressCanonicalRecord` (internal scope only) |
| `PATCH /v1/addresses/:id` | 수정 (version bump) | `AddressDisplayDTO` |
| `DELETE /v1/addresses/:id` | soft delete | `204` |
| `GET /v1/addresses/:id/carrier/:carrierCode` | 캐리어 포맷 획득 | `{ line1, line2, line3, language, warnings }` |
| `POST /v1/addresses/:id/reformat` | 캐리어 포맷 재계산 | `200` |
| `POST /v1/addresses/validate` | 검증만 (저장 없음) | `{ warnings, confidence }` |
| `GET /v1/addresses/:id/history` | 버전 이력 (감사) | `AddressCanonicalRecord[]` |

> `AddressCanonicalRecord` 노출은 `scope=internal:read` 토큰이 있는 호출자(자체 백오피스, 데이터 파이프라인)에게만. 일반 상점 클라이언트는 `AddressDisplayDTO`만 받는다.

### 5-7. 데이터 모델의 테스트 전략
- Canonical → DTO 다운캐스트 테스트 (민감 필드 누출 방지)
- 라운드트립 테스트: 원본 rawResponse를 재파싱해 동일 Canonical 생성되는지
- 캐리어 포맷 스냅샷 테스트 (주요 10개 주소 × 10개 캐리어 = 100 픽스처)
- Locale 누락 대응: `i18n[ko]`가 빠진 레거시 레코드를 로드 → 경고 + on-demand 백필

### 5-8. 배송 모듈 보완 — 확장 로드맵

현재 PRD가 다루지 않은 영역을 Phase별로 편성. 과도한 초기 스코프 방지를 위해 Phase 1은 "훅/인터페이스"만, 실제 구현은 Phase 2+로 이연.

#### Phase 1에 훅(인터페이스)만 정의
- **배송 가능성 판정** `ShippabilityOracle`
  - 도서산간 추가비 플래그 (한국 제주/울릉)
  - PO Box 수령 가능 여부 (FedEx/UPS는 PO Box 거부 → 캐리어 호환성 검사)
  - APO/FPO/DPO 미군 주소 별도 처리
  - **제재국/수출통제** blocklist (OFAC SDN, EU sanctions, UN, KR 전략물자)
  - 금지품목 카테고리 (리튬이온 배터리, 액체, 향수, 식품 등) HAZMAT 플래그
- **배송 이벤트 상태기계** (중앙 스키마)
  - `ShipmentDraft → RatesQuoted → LabelPurchased → InTransit → OutForDelivery → Delivered | Exception`
  - 웹훅 이벤트 카탈로그 공개 (`shipment.label.purchased`, `shipment.delivered`, ...)
  - 서명 검증 HMAC-SHA256, 재전송/DLQ, 멱등 키

#### Phase 2 구현 범위
- **트래킹 통합 어댑터**: 멀티 캐리어 단일 API
  - 1차: 내장 어댑터(이미 확보한 EMS/FedEx/UPS/DHL/SF 트래킹 엔드포인트)
  - 2차: AfterShip / TrackingMore / 17TRACK 통합 어댑터 (선택)
  - 상태 메시지 다국어 매핑
- **라벨 생성 / 세관 서류**:
  - PDF / ZPL / EPL 포맷, 라벨 사이즈 4x6·A4
  - **CN22 / CN23 세관신고서** 자동 생성
  - **커머셜 인보이스** (HS code, 원산지, Incoterms)
  - 미국 수출 EEI/AES filing (FTR §30.37 한도 초과 시)
- **픽업 포인트 (PUDO)**:
  - 한국 편의점 (CU/GS25/세븐일레븐/이마트24)
  - DHL ServicePoint, UPS Access Point, FedEx OnSite
  - 스마트택배함 / 우체국 무인택배함
  - 지도 기반 검색 UI
- **배송 ETA / 캘린더**:
  - 영업일/공휴일 캘린더 per ISO 3166-2
  - 예상 도착일 계산 (express/standard/economy 티어)
  - 지연 경보
- **반품 / RMA**:
  - 반품 라벨 생성, RMA 코드 발급
  - 부분 반품/교환 시 주소 별도 지정
  - 반품 사유 코드 표준 (국가별 소비자법 연계)
- **보험 / 신고가치**:
  - 선언가치(`declaredValue`), 보험료 계산, 클레임 프로세스
  - 캐리어별 기본 포함 범위 매트릭스

#### Phase 3 이연
- 관세/세금 pre-calculation (DDP vs DAP) — Zonos / Avalara AvaTax / SimplyVAT 어댑터
- B2B 벌크 발송 (CSV 업로드 → 다중 라벨)
- HAZMAT MSDS 첨부 자동화
- 수취 거부 / RTS (Return to Sender) 정책 엔진

### 5-9. 배송비 계산 모듈 — `@opencheckout/shipping-rates` (신규)

**결론**: 지원한다. 체크아웃에서 배송지 → 비용 표시는 전환율에 직접 영향(Baymard: 배송비 미표시가 카트 이탈 1위 원인). 단 Phase 분리.

#### 설계 원칙
- `@opencheckout/shipping-rates` 별도 패키지 — 주소/결제 모듈과 분리
- 머천트가 **로직 선택 가능**: (a) 내장 table-based (b) 자체 로직 주입 (c) 캐리어 rate API 실시간
- 핵심 인터페이스:
  ```ts
  interface RateCalculator {
    quote(draft: ShipmentDraft): Promise<ShippingRate[]>;
  }
  interface ShipmentDraft {
    origin: AddressCanonicalRecord;
    destination: AddressCanonicalRecord;
    parcels: Parcel[];               // 각 박스의 L×W×H×weight
    items: LineItem[];               // HS code, 원산지, 단가, 카테고리
    declaredValue: MoneyAmount;
    incoterms?: "DDP" | "DAP" | "DDU" | "EXW";
    signatureRequired?: boolean;
    insuranceRequired?: boolean;
  }
  interface ShippingRate {
    carrierCode: string;             // "cj", "ems", "dhl", ...
    serviceLevel: "economy" | "standard" | "express" | "same-day";
    amount: MoneyAmount;             // 기본 운임
    surcharges: Surcharge[];         // 연료/오지/연말 러시 등
    estimatedDaysMin: number;
    estimatedDaysMax: number;
    cutoffTime?: ISO8601Time;        // 당일 발송 마감
    dutyTaxEstimate?: MoneyAmount;   // DDP 시
    pickupPoints?: PickupPoint[];
    expiresAt: ISO8601;              // rate 유효기간
  }
  ```

#### Phase 1 — Table-based (내장)
- 머천트가 `config/shipping-rates.yaml`에 매트릭스 등록:
  - 무게 구간 (0–1kg / 1–3kg / 3–5kg / 5kg+)
  - 목적지 zone (KR 본토 / 제주 / 미주 / EU / ASEAN / ...)
  - 서비스 레벨별 기본 운임
- 부피 무게(volumetric weight) 자동 계산: `L×W×H / 5000` (항공 표준) 또는 `/6000` (EMS)
- 무료배송 임계값 / 할인 코드
- 표시 통화 환산 (수출입은행 환율 재사용)

#### Phase 2 — 캐리어 Rate API 어댑터
- 각 캐리어 quote 엔드포인트 직접 호출: EMS / FedEx Rate / UPS Rating / DHL Quote / SF Express rate
- 타임아웃/폴백: rate API 실패 시 table-based로 자동 폴백
- 캐싱: `(origin zip × dest zip × weight bucket × service)` 30분 TTL

#### Phase 3 — 메가 통합
- EasyPost / Shippo / Starshipit 어댑터 — 단일 API로 수십 캐리어
- Zonos / Avalara Cross-Border — 관세/세금 실시간 추정 (DDP)
- 경로 최적화 (복수 창고 multi-origin)

#### 체크아웃 UX
- 주소 입력 완료 직후 **병렬로** rate quote 호출 (debounce 300ms)
- 서비스 레벨 3–5개 옵션 카드 제시 (가격순/속도순 정렬)
- 선택한 rate ID가 Payment 모듈에 세션 토큰으로 전달 → `amount = cart + shipping + duty`
- rate 만료(`expiresAt`) 시 결제 직전 재견적 요구 (가격 변동 방지)

### 5-10. 관세 계산 & DDP 모듈 — `@opencheckout/duties` (신규)

**배경**. US de minimis $800 **2025-08-29 전면 폐지**, EU IOSS(≤€150 VAT 체크아웃 수취), GPSR 발효로 **해외 B2C는 "관세 포함 결제(DDP)"가 사실상 기본값**이 되는 흐름. 수령 시 부과 모델(DDU/DAP)은 수취 거부·반송 비용·고객 불만 폭증 — 구매자가 "추가 고지서" 받으면 40%+ 가 수취 거부(FedEx 2023 ShopperPulse).

**포지셔닝**. `@opencheckout/duties`는 **Phase 2 핵심 모듈**로 승격(이전 Phase 3 표기 교정). 관세/수입세/VAT/GST를 계산해 Payment 모듈의 `amount` 분해 항목으로 주입.

#### 5-10-1. Incoterms 매트릭스 (머천트 선택)

| Incoterm | 의미 | 결제 시점 포함? | SDK 기본 지원 |
|---|---|---|---|
| **DDP** (Delivered Duty Paid) | 판매자가 관세·세금 선납 | **체크아웃에 포함** | Phase 2 target |
| **DAP** (Delivered at Place) | 구매자 수령 시 관세 지불 | 제외 (경고 표시) | Phase 1 default |
| **DDU** (구 용어, 현 DAP와 유사) | DAP로 매핑 | 제외 | — |
| **EXW** (Ex Works) | 구매자 전적 책임 | 제외 | 지원 X (B2B 전용) |
| **CPT/CIP** (운송비·보험료 포함) | 관세는 제외 | 부분 포함 | v3 검토 |

머천트는 `config/checkout.yaml`의 `duties.incoterm` (기본 `DAP`) 또는 목적지 국가별로 오버라이드 (`duties.perCountry.US = "DDP"`) 설정.

#### 5-10-2. 핵심 데이터 구조

```ts
interface DutyQuote {
  incoterm: "DDP" | "DAP" | "DDU" | "EXW" | "CPT" | "CIP";
  currency: ISO4217;                       // 결제 통화 기준
  components: {
    customsDuty: MoneyAmount;              // 관세 (HS code 기반)
    importVAT?: MoneyAmount;               // 수입 VAT (EU/UK)
    importGST?: MoneyAmount;               // GST (AU/SG/NZ)
    importSalesTax?: MoneyAmount;          // US state tax (nexus 있을 때)
    consumptionTax?: MoneyAmount;          // JP 消費税
    exciseTax?: MoneyAmount;               // 주류·담배·석유 등
    brokerageFee?: MoneyAmount;            // 통관 수수료 (캐리어/브로커)
    disbursementFee?: MoneyAmount;         // DDP 선납 수수료
  };
  total: MoneyAmount;                      // 합계
  breakdown: PerLineItem[];                // 품목별 상세 (HS code 적용 내역)
  deMinimis: {
    applicable: boolean;                   // 소액 면세 해당 여부
    threshold: MoneyAmount;
    reason?: string;                       // "US de minimis 폐지됨" 등
  };
  expiresAt: ISO8601;                      // 환율·세율 변동 대응 (30min TTL)
  provider: "internal-rules" | "zonos" | "avalara" | "simplyvat" | "easyship";
  nonRefundable: boolean;                  // 대부분 관세는 환불 불가
  warnings: Array<{ code: string; message: string }>;
}

interface DutyCalculatorInput {
  shipment: ShipmentDraft;                 // §5-9
  items: Array<{
    hsCode: HSCode10;                      // WCO HS 2022 6-digit + 국가별 4-digit 확장
    description: LocalizedText;
    originCountry: ISO3166A2;
    unitPrice: MoneyAmount;
    quantity: number;
    weight: { grams: number };
    category?: "textile" | "electronics" | "cosmetics" | "food" | ...;  // 품목 분류
    restrictedFlags?: string[];            // "lithium-battery", "alcohol", ...
  }>;
  recipientTaxIds?: AddressCanonicalRecord["taxIdentifiers"];
  merchantPreferences: {
    preferredBroker?: "dhl" | "fedex" | "ups" | "self";
    roundingMode: "banker" | "up" | "down";
  };
}
```

#### 5-10-3. Phase 별 구현 범위

**Phase 1 (v0.1): 인터페이스 + 경고만**
- `ShipmentDraft.incoterm` 필드 정의
- `duties` 필드는 비어있되 DAP(수령 시 부과) 시 체크아웃에 **경고 배너 강제**: "도착 시 현지 관세·세금이 추가로 부과될 수 있습니다. 미수령 반송 시 배송비·보관료가 청구됩니다."
- `DutyCalculator` 인터페이스만 공개 (구현 없음, always-null 반환)
- Hard blocker는 유지: US de minimis 폐지 2025-08-29 이후 DAP 기본 + EIN/SSN/ITIN 캡처는 §5-3

**Phase 2 (v0.4–0.6): 내장 룰 엔진 + 외부 공급자 어댑터**

내장 룰 엔진 (`@opencheckout/duties/internal`):
- **HS code 6-digit 레벨 내장 데이터** (WCO HS 2022, ~5,500 코드). 10-digit 국가별 확장은 외부 공급자로 이연
- **10개 최다 사용 국가 세율 테이블** 내장 (업데이트 GitHub Actions cron 월 1회):
  - US (HTSUS 2025 이후 전 품목 관세 + state sales tax nexus 훅)
  - EU (TARIC + IOSS ≤€150 / 정식 수입 >€150)
  - UK (UK Global Tariff + UK VAT ≤£135 / 정식 수입)
  - JP (関税率表 + 消費税 10%)
  - CN (进口关税 + 13%/9%/6% 增值税 + CBEC 우대)
  - TW (海關進口稅則 + 營業稅 5%)
  - AU (Combined Tariff + 10% GST)
  - SG (STRC + 9% GST)
  - BR (TEC + ICMS + IPI + PIS/COFINS)
  - MX (TIGIE + IVA 16%)
- **de minimis 테이블**: 국가별 소액면세 한도 + 변경 이력 (US=폐지, UK=£135, EU=€150/폐지, SG=S$400, TH=폐지, AU=A$1000 등)
- 계산식: `duty = customsValue × dutyRate × (1 - fta_preference)`, `importVAT = (customsValue + duty + shipping) × vatRate`
- FTA(한미 FTA, RCEP, 한-EU FTA) 특혜세율 적용 옵션 (원산지 증명 업로드 필요)

외부 공급자 어댑터 (머천트 선택):
- **Zonos** (Classify + Checkout API) — 220+ 국가, HS 10-digit 자동 분류, 가장 완전. 유료 per-quote
- **Avalara Cross-Border (LandedCost API)** — 엔터프라이즈급
- **SimplyVAT / Eurora** — EU 중심
- **Easyship Taxes & Duties API** — 통합형
- **Zonos Classify** 만 쓰고 세율은 내장으로 가는 하이브리드 모드

폴백 체인:
1. 외부 공급자 (설정 시) →
2. 내장 룰 (10개국 중 하나) →
3. **공급자 실패 시 DAP 강제 전환** + 경고 표시 (silent zero-duty 금지)

**Phase 3 (v1.0+): DDP 자동화 운영**
- 캐리어별 DDP 선납 피드 연동: **DHL Duty Tax Paid (DTP)**, **FedEx International Priority DDP**, **UPS World Ease** — SDK가 캐리어 API에 "DDP" 플래그 + 선납 금액을 송장에 기입하면 캐리어가 현지 통관소에 선불 처리
- HS code 자동 분류 ML (상품명·이미지 → HS code 추천, 머천트 검수)
- 수령 거부/반송 시 **관세 환불 정책** 매트릭스 (대부분 비환급, 일부 국가만 일부 환급)
- 세액 감사 로그: 승인 시점 세율 스냅샷 → 정산 시점 차액 리포트

#### 5-10-4. 결제 모듈과의 통합 (Payment amount 분해)

Payment `/confirm` 요청 body:
```json
{
  "paymentKey": "...",
  "orderId": "...",
  "amount": {
    "total": 128500,
    "currency": "KRW",
    "breakdown": {
      "goods": 100000,
      "shipping": 15000,
      "duty": {
        "customsDuty": 5000,
        "importVAT": 8000,
        "brokerageFee": 500,
        "incoterm": "DDP",
        "quoteId": "dq_01HX...",
        "provider": "zonos",
        "nonRefundable": true
      }
    }
  }
}
```

서버는 `amount.total === sum(breakdown.*)` 를 검증 후 토스 confirm 호출. `breakdown.duty` 분해는 **영수증/세금계산서 발행에 필수**(Phase 2 `ReceiptIssuer` 훅이 소비).

#### 5-10-5. UX 표시 원칙

체크아웃 화면에 **3줄 명시 의무**:
1. Incoterm 모드: "관세 포함 가격입니다 (DDP)" 또는 "관세는 도착 시 별도 부과됩니다 (DAP)"
2. 관세 견적 만료 시점: "이 관세 견적은 {expiresAt}까지 유효합니다"
3. 환불 불가 고지: "관세·수입세는 주문 취소 시 환불되지 않을 수 있습니다. 상세는 FAQ 링크."

DAP 모드에서 수령 시 평균 관세 **추정치 표시 강제** (Zonos 평균세율 DB 또는 내장 룰 기반). "추정치 $15–25"가 "가격 불명"보다 미수령률 12%p 낮음(FedEx 2023).

#### 5-10-6. 취소/환불 정책

- **관세는 일반적으로 환불 불가** (한번 통관되면 국가 국고 귀속)
- 통관 전 취소: 일부 국가 환급 가능 → 캐리어 브로커에 환급 요청 파이프라인 (Phase 3)
- 부분 취소: 환급 금액은 `(cancelItems / totalItems) * customsDuty` 비례 재계산 후 머천트 부담 여부 분리 정책
- `DutyQuote.nonRefundable: true`를 체크아웃에 노출 → 구매자 동의 체크박스 (EU 소비자 보호법 대응)

#### 5-10-7. 법규/감사

- US: **ICS2 advance data filing** (ATS-N, 2024-10 확장)
- EU: **ICS2 Release 3** (2025-03 시행), HS code 10-digit 필수
- KR 수출신고필증: 관세청 UNI-PASS 연동 (Phase 3)
- 중국 CBEC: 三单比对에 관세 선납 정보 포함
- **감사 로그**: 관세 견적 시점의 세율·환율·HS code·provider 응답 원본을 `DutyQuote.snapshot`으로 보관 (5년)

## 6. Payment Module — 상세

### 6-1. PG & 통화
| 통화 | PG | 결제수단 | MID |
|---|---|---|---|
| KRW | Toss native | 국내카드, 가상계좌, 계좌이체, 휴대폰, 간편결제 | KR MID |
| USD | Toss (FOREIGN_EASY_PAY) | 해외카드, PayPal, Alipay, 동남아 간편결제 | USD MID |
| JPY | Toss (FOREIGN) | 해외카드 | JPY MID |
| CNY | **v1 비지원**. v2: Alipay-via-USD 또는 Antom/Stripe CN 라우팅 | — | — |

**국내 카드사 발급 해외결제 카드는 다통화 불가** (FACT). 해외 발급만.

### 6-2. 토스페이먼츠 v2 SDK 통합
- SDK: `@tosspayments/tosspayments-sdk` v2
- 2단계 플로우: `requestPayment()` → `successUrl` → 서버 `/v1/payments/confirm` (amount 재검증 필수)
- 키: 클라 3세트(프론트 동적 로드), 시크릿 3세트(서버 Keychain/Secret Manager)
- 통화별 MID 청약 필수 (사용자가 토스 영업 컨택)

### 6-3. FX Service (수출입은행 환율)
- 엔드포인트: `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=&searchdate=YYYYMMDD&data=AP01`
- **스케줄**: 10:55, 11:05, 14:00, 17:00 (영업일) — 주말/공휴일/11시 전 빈 배열 → 최근 영업일 폴백
- **선정**: 하루치 `deal_bas_r` 중 **최댓값**
- **가중치**: `markup = 1 + weight`, 기본 `fx.markup_weight = 0.10`, `config/pricing.yaml`에서 환경별 override
- **JPY 보정**: `cur_unit: "JPY(100)"` → `/100` 선처리 필수
- **캐시**: Redis `fx:{currency}:{yyyymmdd}:{slot}`
- **Fail-closed**: 환율 null/0 → 결제 비활성, 24h 이상 정지 → 경보

**정책**: "**KRW 원가 → 외화 환산 표시 → 외화로 승인**" 단일. 환차손은 가맹점이 가중치로 흡수.

### 6-4. 취소/환불
- `POST /v1/payments/{paymentKey}/cancel`, `cancelReason`, `cancelAmount`
- 가상계좌: `refundReceiveAccount` 필수
- 다통화: 결제 당시 통화/환율로 원복 (토스 처리), 환차손 상점 부담
- 부분취소 해외카드 **통화별 지원 매트릭스** 필요

### 6-5. 보안 체크리스트
- 시크릿 키 프론트 번들 금지 (타입 시스템 + 번들러 스캐너)
- `/confirm`: 클라이언트 `amount` vs 서버 DB 주문 금액 검증 후 승인 호출
- `orderId`: 서버 생성 UUID+timestamp
- 웹훅: `GET /v1/payments/{paymentKey}` 재조회 멱등
- 다통화: `(orderId, currency, amount)` 3튜플 검증
- 키 로테이션 90d

### 6-6. 결제 모듈 보완 — 확장 로드맵

#### Phase 1에 훅(인터페이스)만 정의
- **사기방지 훅 `FraudSignalProvider`**: 3DS2만으로는 부족. 상용 어댑터(Signifyd/Sift/Kount/Stripe Radar)를 드롭인할 수 있게 인터페이스만 공개. OSS 자체 구현 X (공개 시 회피당함, §Shop Pay 리서치)
- **결제 이벤트 카탈로그**:
  - `payment.approved`, `payment.partial_captured`, `payment.canceled`, `payment.refunded`, `payment.disputed`, `payment.webhook.received`
  - HMAC-SHA256 서명 헤더, 재전송 정책, DLQ, 멱등 키
  - 구독 시: `subscription.renewed`, `subscription.payment_failed`, `subscription.canceled`
- **영수증/인보이스 발행 훅 `ReceiptIssuer`**: 국가별 별도 구현 (한국 현금영수증 포함)

#### Phase 2 구현 범위
- **한국 특화 간편결제 확장**:
  - 카카오페이, 네이버페이, 페이코 (토스 결제위젯 내 노출은 MID 설정)
  - 삼성페이 / 애플페이(한국 Phase 2 런칭 이후)
- **지역 특화 결제수단 어댑터**:
  - JP: 코인체크/편의점결제(コンビニ決済)/Pay-easy
  - CN: Alipay+ / WeChat Pay (Toss 경유 USD 변환 + 비-Toss 어댑터 플러그인)
  - US: ACH Direct Debit
  - EU: iDEAL(NL), SEPA Direct Debit, Sofort, Bancontact, Giropay
  - IN: UPI, Paytm
  - BR: Pix, Boleto
  - SEA: GrabPay, GCash, Dana
- **정기결제/구독 (`@opencheckout/subscriptions`)**:
  - 토스 `billingKey` 저장 + 주기 실행
  - Dunning: 실패 재시도 스케줄 (1d → 3d → 7d → 14d)
  - 업그레이드/다운그레이드 비례 계산 (proration)
  - 구독 상태기계: `trialing → active → past_due → canceled`
- **분할 / 복합 결제**:
  - 카드 + 포인트 혼합 (토스 포인트 / 마일리지)
  - 복수 카드 분할
  - 마켓플레이스 split payment (판매자 자동 분배) — 토스는 제한적 → Adyen/Stripe Connect 어댑터 고려
- **한국 세금 영수증**:
  - 현금영수증 발행 (소득공제/지출증빙)
  - 세금계산서 (부가세 과세 B2B)
  - 수출신고필증 연동
- **EU / 글로벌 인보이스**:
  - e-Invoice (Peppol, EU Directive 2014/55)
  - 멕시코 CFDI 4.0
  - 인도 GSTIN
  - 일본 適格請求書 (Qualified Invoice) 2023-10 이후
- **차지백 / 디스퓨트 대시보드**:
  - 분쟁 증빙 제출 SLA 트래커
  - 증빙 템플릿 (배송 증빙, 수령 확인, 고객 통신)
- **네트워크 토큰**:
  - Visa Token Service / Mastercard Digital Enablement
  - 카드 재발급돼도 유지 → 구독 승인률 +2~5%p

#### Phase 3 이연
- **BNPL 어댑터**: Afterpay, Klarna, Affirm, 토스후결제, KakaoPay 할부
- **멀티 PG 라우터 (Cascading PG)**: 주 PG 장애 시 백업 PG 자동 폴백, 건별 승인률 기반 라우팅
- **정산 리콘실리에이션**:
  - PG settlement 파일 자동 다운로드/파싱
  - 회계 시스템 연동 (NetSuite / QuickBooks / Xero / 더존 / 얼마에요)
  - 정산 환율 vs 승인 환율 차액 리포팅
- **결제 링크 / QR**: URL/QR 생성, 이메일 영수증 자동발송
- **암호화폐 게이트웨이**: BitPay / Coinbase Commerce 어댑터 (법정화폐 전환)

#### 법규 체크리스트 (컴플라이언스)
- KR 전자상거래법: **청약철회 7일** 표기 + 환불 프로세스
- KR 특정상거래법 / 방문판매법
- EU PSD2 **SCA (Strong Customer Authentication)**: 3DS2 강제, 면제 기준(저가/정기/TRA)
- JP 특定商取引法 표기
- US State sales tax nexus (TaxJar/Avalara 어댑터 위임)
- **PCI DSS v4.0** 머천트 가이드: 6.4.3, 11.6.1 신규 요구사항

## 7. 해외 역직구 구매자 UX & 아키텍처

한국 쇼핑몰에 해외 구매자(중/일/미/EU/동남아)가 들어왔을 때, 현지 Amazon/Rakuten/Tmall 수준을 넘는 체크아웃 경험을 만든다. 언어·통화·결제수단·배송·관세 모든 축에서 "이게 한국 쇼핑몰인 줄 몰랐다" 수준.

### 7-1. Locale & Currency Resolver (진입부터)

```
[방문] → IP geolocation + Accept-Language 헤더 + 사용자 계정 선호값
      → LocaleResolver: { country, language, currency, timezone } 산출
      → 쿠키 저장 (30일), 사용자 수동 토글 허용
      → 전 페이지 locale-aware 렌더링
```

**규칙**:
- IP 국가와 Accept-Language가 충돌 시(일본 IP + 영어 브라우저) → 언어는 브라우저, 통화·배송국은 IP 추정으로 pre-fill (사용자 수정 허용)
- 우측 상단 고정 셀렉터 3종: `언어 ▾ | 통화 ▾ | 배송국 ▾` — 변경 시 즉시 reactive 업데이트
- **"이 페이지는 일본에서 접속하셨습니다. 엔화로 보시겠어요?" 배너** 1회 노출 (Amazon UK 패턴)
- hreflang 태그 + 서버사이드 300 Multiple Choices 대응 (SEO)

### 7-2. 상품 페이지 — 체크아웃 전 확신 만들기

- 상품명/설명 다국어 (Generator→Evaluator 번역 파이프라인, 품질 QA 루프)
- 가격 표시: 선택 통화 실시간 환산 + "결제 승인 시 환율에 따라 달라질 수 있음" 1줄 고지
- **"이 상품 {국가}까지 배송 가능" 뱃지** (제재품목/금지품목/국가 미지원 사전 필터링)
- **"예상 도착 {날짜}–{날짜}"** (ETA 캘린더, 목적지 영업일/공휴일 반영)
- **"관세 포함 가격" 배지** (DDP 모드 국가만) 또는 "관세 별도 추정 $15–25" (DAP)
- 사이즈 가이드: 국가별 신발·의류 규격 자동 변환 (US 9 ↔ EU 42 ↔ JP 27)
- 리뷰 다국어 필터 ("내 언어 리뷰만 보기")

### 7-3. 체크아웃 단일 페이지 스토리

```
┌───────────────────────────────────────────────┐
│ ① 배송지 (국가 먼저, 현지 언어 폼)            │
│   ├── 주소 자동완성 (IP 국가 기본, 변경 가능) │
│   ├── 세금ID 국가별 동적 필드                  │
│   ├── 이름 로마자 자동 + 확인 토글            │
│   └── 자주 쓰는 주소 + 별칭                   │
├───────────────────────────────────────────────┤
│ ② 배송 (실시간 rate + ETA)                    │
│   ├── 옵션 카드 3–5개 (가격/속도 정렬)        │
│   ├── DDP/DAP 토글 (머천트 허용 시)           │
│   └── 픽업포인트 옵션 (편의점/DHL SP)         │
├───────────────────────────────────────────────┤
│ ③ 결제 (현지 결제수단 1등급 노출)             │
│   ├── 지역 간편결제 상단 (Alipay/iDEAL/Pix)   │
│   ├── 카드 폼 (Toss iframe)                    │
│   ├── 통화 확정 (KRW/USD/JPY + 가중치 표시)    │
│   └── 최종 amount 분해 (상품·배송·관세·세금)  │
├───────────────────────────────────────────────┤
│ ④ 확인 (SCA/3DS2 + OTP/Passkey)               │
│   ├── 환불불가 고지 체크박스 (EU 소비자법)    │
│   └── [주문 확정]                              │
└───────────────────────────────────────────────┘
```

**시간·진척률 UX**:
- 각 단계 예상 소요 시간 배지 ("30초", "1분")
- 이전 단계 인라인 편집 (Amazon 원클릭 편집 패턴)
- 모든 필드 변경 시 실시간 amount 재계산 (debounce 300ms)

### 7-4. 지역 결제수단 우선순위 매트릭스

```
countryCode → 결제수단 정렬 규칙
─────────────────────────────────
KR → 토스페이, 카카오페이, 네이버페이, 카드, 계좌이체
US → 카드, Apple Pay, PayPal
CN → Alipay, WeChat Pay, UnionPay, 카드
JP → 카드, Apple Pay, 코인체크(편의점), Pay-easy
EU → iDEAL(NL), SEPA, 카드, PayPal, Klarna
UK → 카드, PayPal, Klarna
BR → Pix, Boleto, 카드
IN → UPI, 카드, Paytm
SEA → GrabPay(SG/MY/TH), GCash(PH), Dana(ID), 카드
AU → 카드, Afterpay, PayPal
```

**라우팅 결정**:
- 상위 3개는 **expandable card**로 즉시 노출
- 나머지는 "그 외 결제수단 ▾" 아래
- 통화와 결제수단 매핑: CNY 필요 시 Alipay/WeChat Pay를 USD 청구로 라우팅 (Toss 한계)

### 7-5. 접근성 & 현지화 품질

- **WCAG 2.2 AA**: 키보드 탐색, 스크린 리더, 컬러 컨트라스트, 터치 타겟 44×44px
- 우측→좌측 언어(아랍어, 히브리어) `dir="rtl"` 지원 (v2 검토)
- 다국어 CS 채팅: 한국 상담원 입력 → LLM 실시간 번역 → 해외 구매자 표시 (양방향)
- 영수증/주문확인 이메일 현지어 + 현지 타임존
- 웹푸시·SMS 알림 현지어 템플릿

### 7-6. 구매자 주문 상태 페이지 (Order Tracking)

체크아웃 완료 후 `/orders/:id/tracking`에 진입:

```
주문 #KR-2026-0423-0001 — 🇯🇵 도쿄행
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 주문 접수         2026-04-23 14:30 KST
✅ 결제 완료         2026-04-23 14:31 KST
✅ 출고 준비         2026-04-23 16:00 KST
✅ 발송됨             2026-04-24 09:15 KST  EMS EN123456789KR
🔵 통관 중           2026-04-25 11:30 JST  🇯🇵 일본 도쿄국제우편교환국
⬜ 배달 중           (예상 2026-04-26)
⬜ 수령 완료          (예상 2026-04-26)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[트래킹 상세] [배송사 연락] [CS 문의] [주문 취소 요청]
```

- 타임스탬프 **구매자 로컬 타임존 자동 변환**
- 상태 설명 구매자 언어로 현지화
- 통관 이슈(HOLD/추가 서류 요청) 발생 시 **actionable CTA**: "여권 사본 업로드", "세금 지불" 등
- 예상 도착일 슬라이딩 업데이트 (초기 추정 → 실 진척 기반 정밀화)

## 8. 주문 라이프사이클 & 데이터 액세스 아키텍처

단일 `Order` 개념이 체크아웃→출고→배송→수령→반품까지 관통. 각 단계는 **이벤트 소싱** 기반으로 로그되며, 각 역할자(구매자·머천트·운영팀·물류팀·회계·컴플라이언스)는 자신에게 맞는 뷰를 본다.

### 8-1. 도메인 이벤트 카탈로그

```
order.created                    # 카트 → 체크아웃 진입
order.identity_verified          # OTP/Passkey 성공
address.attached                 # 배송지 확정
shipping.rate_selected           # 배송 옵션 선택
duty.quoted                      # 관세 견적 제출
payment.authorized               # 결제 승인 (Toss confirm 성공)
payment.captured                 # 최종 수취 완료
order.placed                     # 주문 확정 (구매자 관점 '완료')
fulfillment.preparing            # 창고 pick/pack 시작
fulfillment.picked
fulfillment.packed
label.purchased                  # 송장 구매 → tracking_number 확보
shipment.handed_over             # 캐리어 수거
shipment.in_transit              # 이동 중
shipment.customs_hold            # 통관 홀드 (액션 필요)
shipment.customs_cleared
shipment.out_for_delivery
shipment.delivered
shipment.exception               # 오배송/분실/파손
return.requested
return.label_issued
return.received
refund.processed
dispute.opened
dispute.resolved
```

각 이벤트는:
- `eventId` (ULID), `eventType`, `occurredAt`, `tenantId`, `orderId`, `actor` (who triggered)
- `payload` (타입별 스키마)
- `correlationId` (주문 전체 추적)
- `causationId` (어떤 이벤트가 이걸 유발했는가)
- 불변(append-only) 저장

### 8-2. 데이터 액세스 계층 (Role-based Views)

동일한 이벤트 스트림 위에 **5가지 read-model 투영(projection)**:

| View | 대상 | 내용 |
|---|---|---|
| `BuyerOrderView` | 구매자 (웹/모바일) | 주문 요약, 진척 타임라인, 금액 분해, ETA, 트래킹 |
| `MerchantOrderView` | 머천트 (셀러 대시보드) | 위+매출, 정산 상태, 수수료, 리스크 플래그 |
| `OpsOrderView` | 운영팀 | 위+CS 티켓, 예외 알림, 수동 개입 버튼, 통신 로그 |
| `LogisticsOrderView` | 물류팀 | pick/pack 큐, 라벨 인쇄 배치, 출고 대시보드, 캐리어 상태 |
| `FinanceOrderView` | 회계/재무 | 환율 스냅샷, 관세·세금, 정산 매칭, 세금계산서 |
| `ComplianceOrderView` | 컴플라이언스 | 제재국 체크 로그, HS code, 세금ID 검증, GPSR RP |

각 view는 **read replica + 전용 스키마**로 저장되어 OLTP에 부담 주지 않고 조회 최적화.

### 8-3. 저장 레이어

```
┌─────────────────────────────────────────────┐
│ Primary Write Path                          │
│  Gateway → event validation → event store   │
│  (append-only: PostgreSQL/EventStoreDB)     │
└──────────────┬──────────────────────────────┘
               │  event published
               ▼
     ┌─────────────────────┐
     │   Event Bus         │  Kafka / Redis Streams / SQS / NATS (어댑터)
     └─────────┬───────────┘
               │ fan-out
   ┌───────────┼───────────┬──────────┬────────────┐
   ▼           ▼           ▼          ▼            ▼
Buyer view Merchant view Ops view  Logistics view  Finance view
 (read DB)  (read DB)   (OpenSearch) (read DB)    (warehouse)
```

- **Event store**: PostgreSQL `events` 테이블 append-only + `outbox` pattern
- **Event bus 어댑터**: Kafka(엔터), Redis Streams(소규모), SQS(AWS), NATS(자체호스팅) — self-host 선택권
- **Read DB**: projection별 최적 스키마 (구매자 뷰는 단일 documents, ops view는 정규화)
- **Search**: OpenSearch — 다국어 한국어·일본어 analyzer, 주문번호·수령인·트래킹·상품명 복합 검색
- **Cold storage**: 1년 이상 주문은 S3 glacier로 이관, GDPR 보관 요구 대응

### 8-4. 외부 연동 (머천트 자체 시스템)

- **Webhook subscription**: 머천트가 원하는 이벤트 구독, HMAC-SHA256 서명, 재시도+DLQ
- **Outbound polling API**: `/v1/orders/{id}/events?after=<eventId>` — webhook 못쓰는 환경
- **GraphQL endpoint** (Phase 2): 복합 조회 편의 (ops dashboard 친화)
- **CDC 옵션**: Debezium 커넥터 템플릿 제공 — 머천트 DB로 실시간 sync

### 8-5. 타임라인 재구성 원칙

- 구매자에게는 **"의미 있는 단계 7개"**만 노출 (주문→결제→출고준비→발송→통관→배달→수령)
- 내부에게는 **30+ 세부 이벤트** 모두 열람 가능
- 단계 매핑 테이블:
  ```yaml
  display_stage: "shipped"
  source_events:
    - label.purchased
    - shipment.handed_over
  primary_timestamp: shipment.handed_over.occurredAt
  ```
- **시간 이동(replay)**: 이벤트 스트림만으로 과거 시점 상태 재구성 가능 (디버깅·감사)

## 9. 내부 운영 콘솔 (Ops/Logistics Workbench)

Phase 2에 `@opencheckout/admin-console` 옵셔널 패키지로 제공. 셀프호스트 Next.js 앱 + 동일 Gateway API 사용.

### 9-1. 운영팀 콘솔 (CX/CS 중심)

**홈(주문 모니터링)**:
- "지금 개입 필요" 우선 위젯:
  - 통관 홀드 발생 (액션 필요)
  - 결제 승인 실패 재시도
  - 주소 오류 (캐리어 pre-flight 실패)
  - RTS 반송 예정 건
  - 구매자 CS 문의 미응답 4시간+
- 검색: 주문번호/이름(다국어)/이메일/전화/트래킹/상품명 복합 — OpenSearch
- 필터: 기간·국가·결제상태·배송상태·리스크 플래그

**주문 상세 뷰**:
- 상단: Order timeline (30+ events, 접기/펼치기)
- 좌측: 구매자 정보 / 주소 / 세금ID / 지불 수단
- 우측: 상품 · 배송 · 관세 · 총액 분해
- 하단 탭: CS 커뮤니케이션 / 이벤트 로그 / 감사 로그 / 내부 메모
- 액션: 부분 환불 / 주소 수정 / 캐리어 변경 / 통관 서류 업로드 / RMA 발급

**다국어 CS 워크플로우**:
- 들어온 메시지 언어 자동 감지 → 한국어 번역 + 원문 병기
- 상담원 한국어 답변 → 구매자 언어 자동 번역 (송신 전 프리뷰)
- 번역 품질 체크 (LLM Generator→Evaluator 2단계)

### 9-2. 물류팀 콘솔 (Pick/Pack/Ship)

**출고 대기 대시보드**:
- 오늘 출고 가능 주문 리스트 (결제완료 + 재고확인 + 출고준비)
- 캐리어별 묶음 (EMS 배치, DHL 배치, 편의점 회수 배치)
- cutoff 시간 타이머 ("EMS 오늘 15시 마감까지 32건")

**Pick-Pack 워크플로우**:
- 바코드/QR 스캐너 연동 (상품 바코드 → 주문 매칭)
- 1-by-1 picking with mobile UI (창고 작업자 대상)
- 다중 박스 분리 주문 처리 (한 주문이 2박스로 나눠질 때 parcel별 송장)
- Pack 완료 시 사진 촬영 첨부 (분쟁 대비)

**라벨 인쇄 배치**:
- 캐리어 API에 일괄 요청 → ZPL/PDF 배치 다운로드
- 라벨 프린터 직접 출력 (Zebra/Brother)
- CN22/23 세관서류 자동 생성 (상품 HS code + 가격 + 원산지)
- 수정 필요 주문 reject 처리 (주소 오류, 세관 서류 누락)

**출고 확정**:
- 캐리어 수거 시점 기록 → `shipment.handed_over` 이벤트 발행
- 사내 재고 차감

### 9-3. 역할·권한 (RBAC)

- `role.ops_agent` — 주문 조회·CS 응답·부분 환불 (한도 내)
- `role.ops_lead` — 모든 환불·주소 수정·캐리어 변경
- `role.logistics_picker` — 창고 앱 전용, 출고 대기만
- `role.logistics_lead` — 배치 인쇄·캐리어 변경·재발송
- `role.finance` — 정산·세금 view, 환불 대시보드
- `role.compliance` — 제재국·HS code 감사
- `role.merchant_owner` — 머천트 계정 슈퍼유저

모든 액션 **감사 로그 필수**(`actor.role`, `occurredAt`, `payload.diff`).

### 9-4. 예외 처리 플레이북

| 예외 | 자동 감지 | 운영자 액션 |
|---|---|---|
| 주소 pre-flight 실패 | `address.validation.warning` | 재연락→수정→재검증 |
| 결제 승인 실패 | `payment.authorization.failed` | Dunning 또는 결제수단 변경 요청 |
| 통관 HOLD | 캐리어 webhook 파싱 | 서류 업로드 창 구매자에게 발송 |
| 배송 분실 | 캐리어 상태 5일 미변동 | 클레임 제출 + 재발송/환불 |
| RTS 발생 | 캐리어 webhook | 재발송 여부 구매자 컨펌 |
| 세관 압수 | 캐리어 webhook | 손실 인정 + 환불 + 컴플라이언스 보고 |

각 예외는 **Playbook Template**(마크다운 + 체크리스트)로 문서화되어 ops console에 임베드.

### 9-5. 내부 알림 시스템

- 운영팀 Slack/Teams 연동 — 이벤트별 채널 구독 (`#customs-holds`, `#returns`, `#high-value-orders`)
- SLA 위반 알림 (CS 응답 4시간, 출고 24시간)
- 주간 리포트 자동 생성 (주문수, 환불률, 통관지연, CS 만족도)

### 9-6. 자동화 훅

- **Zapier/Make.com 어댑터**: 이벤트 → 외부 자동화 (예: "VIP 주문은 CEO에게 Slack DM")
- **Rule engine**: "특정 금액 이상 / 특정 국가 / 특정 카드 BIN 주문은 수동 리뷰"
- **Batch 작업**: CSV 업로드 일괄 환불, 일괄 주소 수정

## 10. GitHub Pages Sandbox

### 10-1. 아키텍처
| 기능 | 인프라 |
|---|---|
| 위젯, 자동완성 UI | GitHub Pages 정적 |
| 결제 승인 (Toss confirm) | Cloudflare Workers 프록시 (무료 100K/day) |
| 환율/VAT | Workers + KV 24h TTL |
| 웹훅 검증 데모 | "Deploy to Vercel" 버튼 → 사용자 자체 백엔드 |

### 10-2. 데모 키 정책
- 공개 테스트 클라이언트 키(`test_ck_*`)는 공식 문서에도 노출 → GitHub Pages 허용
- **시크릿 키는 Workers 환경변수만**
- Origin allowlist (`*.github.io`, `localhost`) + 분당 10 req IP 제한 + Cloudflare Turnstile

### 10-3. BYOK UX
- localStorage `tossSandboxClientKey`, "Use my keys" 토글
- prefix 검증 (`test_ck_` 허용, `live_` 차단)
- 배너: "키는 브라우저만, 서버 미전송" + 소스 라인 링크

### 10-4. 2-Pane 샌드박스 레이아웃 (토스페이먼츠 Sandbox 벤치마크)

참조: https://developers.tosspayments.com/sandbox — 좌측 모바일 디바이스 모형 + 우측 실시간 응답값/이벤트 로그 패널.

```
┌──────────────────────────────────────────────────────────────┐
│  header — [논리: Guide | Reference | Sandbox] [언어 | 통화] │
├────────────────────────┬─────────────────────────────────────┤
│                        │                                     │
│  📱 Mobile Device       │  ⚡ Live Response / Event Log      │
│  (375×812 iPhone frame) │                                     │
│                        │  ─── 현재 단계 ───                  │
│  ┌──────────────────┐   │  POST /v1/shipping/rates            │
│  │ 주문 요약        │   │  → 200 OK (153ms)                   │
│  │ 상품 3점          │   │                                     │
│  │ ₩ 89,000         │   │  ▼ Request                         │
│  ├──────────────────┤   │  {                                  │
│  │ 배송지           │   │    origin: {...},                   │
│  │ [🔍 국가 선택]    │   │    destination: {country: "JP"},    │
│  │ [🔍 주소 검색]    │   │    parcels: [...]                   │
│  │ 이름 / 전화       │   │  }                                  │
│  │ 세금ID           │   │                                     │
│  ├──────────────────┤   │  ▼ Response                        │
│  │ 배송비           │   │  [                                  │
│  │ ✓ EMS 7일 ¥2,100 │   │    { carrier: "ems", amount: ...},  │
│  │   DHL 3일 ¥4,800 │   │    { carrier: "dhl", amount: ...},  │
│  │   픽업 ¥0         │   │    ...                              │
│  ├──────────────────┤   │  ]                                  │
│  │ 관세 (DDP)        │   │                                     │
│  │ +¥800            │   │  ─── 이벤트 스트림 ───             │
│  │ "결제에 포함됨"    │   │  14:30:01  order.created            │
│  ├──────────────────┤   │  14:30:04  address.attached         │
│  │ 💳 결제 위젯      │   │  14:30:07  shipping.rate_selected   │
│  │  (토스 iframe)     │   │  14:30:12  duty.quoted              │
│  │ [Alipay] [PayPal] │   │  14:30:20  payment.authorized       │
│  │ [카드]  [주문]     │   │                                     │
│  └──────────────────┘   │  [▶ Replay] [Clone cURL] [Export]   │
│                        │                                     │
└────────────────────────┴─────────────────────────────────────┘
 [footer — Test card 4242, 현재 샌드박스 상태, 문서 링크]
```

**좌측 패널 (모바일 디바이스 시뮬레이터)**
- iPhone 14 Pro 프레임(375×812)을 기본 뷰포트로 고정, 상단에 `iPhone | Galaxy | Pixel | Desktop` 토글
- 실제 프로덕션 UX와 동일한 컴포넌트 렌더링 (즉, 데모 전용 UI가 아니라 `@opencheckout/widget-vanilla` 그대로)
- 인터랙션은 **7-3 체크아웃 스토리** 4단계 그대로: 배송지 → 배송옵션 → 관세/금액 분해 → 결제 위젯
- 각 필드 조작 시 오른쪽 패널이 실시간으로 응답값/이벤트 업데이트

**우측 패널 (개발자 시점 응답·이벤트)**
- **3탭**: `Response` | `Events` | `Code`
  - Response: 현재 단계 API 호출의 request/response JSON (monaco editor, syntax highlight, copy)
  - Events: 누적된 도메인 이벤트 스트림(§8-1 카탈로그) 타임라인
  - Code: "지금 이 상태를 만드는 3줄 코드" (언어 토글 TS/Python/cURL, copy)
- 상단에 현재 히트 중인 엔드포인트 + 응답 시간 + 상태코드
- 하단에 `[▶ Replay]` (같은 입력으로 재실행), `[Clone cURL]` (터미널 붙여넣기), `[Export HAR]` (전체 세션 내보내기)

**딥링크**
- `?scenario=kr-to-jp&step=duty&currency=JPY` — 공유 가능한 상태
- 블로그/문서/이슈에 시나리오별 링크 삽입 가능

**시나리오 프리셋 (드롭다운)**
- 🇰🇷→🇰🇷 국내 (CJ 택배)
- 🇰🇷→🇯🇵 역직구 (EMS + DDP + JPY)
- 🇰🇷→🇺🇸 역직구 (de minimis 폐지 반영, FedEx + EIN 필요)
- 🇰🇷→🇨🇳 (三单比对 + 身份证)
- 🇰🇷→🇧🇷 (CPF hard blocker + Pix)
- 🇰🇷→🇪🇺 (IOSS + GPSR RP)
- 🇯🇵→🇰🇷 순방향 직구
- 구독 플로우 (Phase 2)
- 부분 환불 (Phase 2)

**운영자/물류 콘솔 프리뷰 (부록)**
- 좌측 토글을 `Mobile` / `Admin Console` / `Logistics` 로 전환 시 §9의 운영/물류 뷰가 우측과 동기화되어 재생 — "주문이 이벤트로 어떻게 흘러가는지" 한눈에 체감

### 10-5. 환경 전환 · 키 관리 UX

- 상단에 `Sandbox | My Keys` 토글. My Keys 모드에서 머천트 본인 테스트 키 입력(prefix 검증)
- 모든 요청은 Cloudflare Workers를 경유, 공용 샌드박스 vs 머천트 본인 키를 헤더로 구분
- 요청 로그는 브라우저 IndexedDB에 저장되어 새로고침 후에도 히스토리 유지 (30일 TTL)
- 공용 샌드박스가 레이트리밋 걸리면 `[My Keys로 전환]` CTA 자동 표시

### 10-6. 접근성 & 반응형

- 모바일 디바이스 프레임이 뷰포트 <768px에서는 "디바이스 프레임 off + 풀스크린 데모" 모드로 자동 전환
- 우측 패널은 하단 drawer로 이동 (모바일), `↕ Drag` 핸들로 높이 조절
- 코드 블록은 prefers-color-scheme 존중
- 스크린 리더: 각 필드에 ARIA 라이브 리전, 단계 전환 announce

## 11. DevEx / OSS

### 11-1. 기본 원칙
- **라이선스**: Apache 2.0 (특허 grant §3, 결제 특허 지뢰밭 방어)
- **기여**: DCO (`git commit -s`), CLA는 기여자 심리장벽
- **커뮤니티**: Discord `#kr #en #ja`, HN Show HN, Dev.to, GDG Seoul
- **라벨**: `good first issue`, `help wanted`, `i18n:*`
- **Release**: Changesets 기반 PR 단위 버전 제안

### 11-2. 문서 사이트 (토스페이먼츠 docs 벤치마크)

참조: https://docs.tosspayments.com/guides/v2/get-started, https://docs.tosspayments.com/reference

**3원 구조**:
1. **Guides** — 시나리오 튜토리얼 ("처음 시작하기", "한국 → 미국 역직구 연동", "구독 결제", "반품 처리"). 목차는 task 기반 흐름형. 페이지 내 실행 가능한 코드블록 + "샌드박스에서 열기" 버튼 (StackBlitz 임베드 또는 §10 deep-link).
2. **Reference** — API/SDK 레퍼런스. 각 엔드포인트마다 request schema / response schema / 에러코드 / 언어별 코드 샘플(TS/Python/Go/cURL 탭) / "Try it" 버튼.
3. **Sandbox** (= §10) — 라이브 플레이그라운드. Guides·Reference 각 페이지의 deep-link가 여기로 연결.

**도구 스택**:
- **Guides**: Docusaurus (i18n ko/en/ja 내장, MDX로 React 컴포넌트 임베드, Algolia DocSearch 무료 OSS 프로그램)
- **Reference**: OpenAPI 3.1 스펙을 **Scalar** (스칼라 최근 Mintlify 수준의 UX 달성, OSS, https://github.com/scalar/scalar) 또는 **Redocly** 로 렌더. Docusaurus 플러그인으로 통합.
- **Search**: Algolia DocSearch — 무료 OSS 티어 신청
- **Live code**: **Sandpack** (CodeSandbox 런타임, React 임베드, OSS) 를 MDX에 삽입 → 페이지 내 바로 실행
- **버저닝**: Docusaurus versioned-docs + API spec 날짜 버전 동기
- **Crowdin**: ko 원본 → en/ja 번역 파이프라인, Generator→Evaluator LLM 사전교정

**Reference 페이지 필수 요소 (토스 벤치마크)**:
- 왼쪽 nav: 엔드포인트 트리
- 중앙: 설명 + 파라미터 표 (타입·필수·설명·예시)
- 우측: 언어 탭 코드 샘플 + 응답 예시 (접힌 상태 기본, 펼치기)
- 하단: "자주 묻는 에러" · "관련 가이드" · "샌드박스에서 시도"

**품질 게이트**:
- OpenAPI 스펙 → Reference 자동생성(PR마다)
- 링크 깨짐 검증 (lychee, PR 체크)
- 가이드별 "마지막 검증 날짜" 뱃지, 90일 경과 시 stale 배지
- 스크린샷/GIF 자동 갱신 (Playwright로 샌드박스 캡처)

**i18n 우선순위**:
- ko·en 동시 Phase 1. ja는 Phase 2 (일본 머천트 타깃).
- 번역되지 않은 페이지는 영어 폴백 + "번역 기여 환영" 배너

### 11-3. "3줄로 시작하기" — 첫 5분 경험

Stripe의 `npm install stripe` 이후 첫 페이지를 5분 안에 띄우는 경험이 생태계 표준. 우리는 이를 **배송+결제 복합 흐름**으로 제공:

```tsx
// 3줄 시작 (Guides 첫 페이지)
import { OpenCheckout } from "@opencheckout/widget-vanilla";
OpenCheckout.mount("#checkout", { publicKey: "test_ck_..." });
```

Guides 첫 페이지 = **이 3줄 + StackBlitz 임베드**. 5분 내 "샌드박스에서 결제 완료 화면 체험 → 내 키로 갈아끼워 본인 계좌 송금 확인" 까지.

### 11-4. 개발자 온보딩 플로우

1. **devcontainer**: GitHub Codespaces/ VS Code devcontainer 공통, `pnpm i && pnpm test` 즉시 동작
2. **nix-shell** (선택): `nix develop`으로 완전 재현성
3. **Makefile·just**: 자주 쓰는 명령 4개 (`dev`, `test`, `docs`, `release`)
4. **Discord 봇**: PR 첫 기여자 자동 환영 + "good first issue" 검색 도움

## 12. Testing

- **Unit** (Vitest): 키 스코프 타입 가드, 상태기계 전이, 체크섬
- **Integration** (msw/nock): 외부 API 픽스처 커밋 (juso/Kakao/Google Places/Toss/Exim)
- **Contract** (Schemathesis): OpenAPI 드리프트
- **E2E** (Playwright): 위젯+gateway+Toss 샌드박스
- **시크릿 없는 CI**: Toss 공개 테스트 키만. 수출입은행 완전 모킹, nightly 유지 브랜치만 실키

## 13. Versioning

- SDK SemVer 엄격
- API 날짜 헤더: `OpenCheckout-Version: 2026-04-23`. 최소 12개월 두 버전 병행
- Deprecation 경고 1 마이너 전
- `@opencheckout/codemod` 자동 마이그레이션

## 14. Roadmap (Phased)

### Phase 1 (0–3개월): Minimum Lovable SDK
- 핵심 패키지: `core`, `address`, `payments`, `sdk-node`, `sdk-browser`, `widget-vanilla`, `key-provider`, `gateway`, `testing`
- 어댑터 (결제/주소/환율): `adapters-toss`, `adapters-juso`, `adapters-google-places`, `adapters-exim`
- **캐리어 포맷 어댑터 인터페이스 `CarrierFormatter` 확정 + Phase 1 내장 구현 3종**:
  - `adapters-carrier-cj` (CJ대한통운) — 한국 대표
  - `adapters-carrier-ems` (EMS) — 글로벌 폴백
  - `adapters-carrier-dhl` (DHL Express) — 45자 여유, 글로벌
- 국가: **KR/US/JP/CN/EU/BR 6개 필드 프리셋**
- 통화: KRW/USD/JPY
- `AddressCanonicalRecord` + `AddressDisplayDTO` 이원 스키마 구현 (§5-6)
- **배송 훅 인터페이스만**: `ShippabilityOracle`, `ShipmentDraft` 상태기계, 웹훅 이벤트 카탈로그 (§5-8)
- **배송비 계산 v1**: `@opencheckout/shipping-rates` table-based only (§5-9)
- **관세 인터페이스만 + DAP 경고**: `DutyCalculator` 계약만 공개, 구현은 null. DAP 모드 기본. 체크아웃에 수령 시 부과 경고 배너 강제 (§5-10)
- **결제 훅 인터페이스만**: `FraudSignalProvider`, `ReceiptIssuer`, 결제 이벤트 카탈로그 (§6-6)
- **Locale/Currency Resolver** (§7-1) + **구매자 Order Tracking 페이지 v1** (§7-6, 7단계 타임라인)
- **도메인 이벤트 카탈로그 + append-only event store + outbox 패턴** (§8), `BuyerOrderView` projection 1종
- Event bus 기본: PostgreSQL `outbox` + `LISTEN/NOTIFY` (V2에 Kafka/Redis Streams 어댑터 추가 경로 유지)
- 토스 스타일 **Docs 3원 구조**: Guides(Docusaurus) + Reference(Scalar) + Sandbox (§11-2)
- **2-pane 샌드박스**: 좌 모바일 디바이스 시뮬레이터 + 우 실시간 응답/이벤트 로그 (§10-4)
- GitHub Pages 샌드박스 + Workers 프록시
- Docusaurus ko/en + Algolia DocSearch + Sandpack 라이브 플레이그라운드
- Apache 2.0 + DCO
- 0.1 release — Toss 샌드박스 E2E 통과

### Phase 2 (3–6개월)
- Python SDK (OAS 자동생성+래퍼)
- `adapters-kakao` (POI 보조)
- `@opencheckout/checkout` 오케스트레이터
- Widget React
- 국가 프리셋 확장 (TW/UK/ID/VN/TH/SG/MY/MX)
- **캐리어 확장 2차**: `adapters-carrier-{fedex, ups, sf-express, koreapost, hanjin, lotte}`
- **배송 실구현**: 트래킹 통합, 라벨/CN22·23 생성, PUDO 픽업포인트, 반품/RMA
- **배송비 계산 v2**: 캐리어 rate API 어댑터 (EMS/FedEx/UPS/DHL/SF quote)
- **관세 계산 모듈 `@opencheckout/duties`**: 내장 룰 엔진(WCO HS 6-digit + 10개국 세율 테이블 + de minimis) + 외부 공급자 어댑터(Zonos/Avalara/SimplyVAT/Easyship). DDP/DAP 토글, Payment `amount.breakdown.duty` 분해 통합 (§5-10)
- **구독 모듈**: `@opencheckout/subscriptions` (토스 billingKey + dunning)
- **한국 세금 영수증**: 현금영수증/세금계산서 자동 발행
- **지역 특화 결제수단** (우선순위 Q28 결정 후)
- CNY 경로 (Alipay-via-USD 또는 Antom PoC)

### Phase 3 (6–12개월)
- Go SDK
- 멀티-PG 라우터 (KG이니시스/NICE/KOMOJU/Stripe JP/Antom) + Cascading PG 폴백
- Java/Kotlin
- **DDP 자동화 운영**: 캐리어 DTP feed 연동 (DHL DTP / FedEx DDP / UPS World Ease), HS code ML 분류, 관세 감사 로그, 부분 취소 환급 파이프라인
- 배송비 메가 통합 (EasyPost/Shippo)
- BNPL (Afterpay/Klarna/Affirm/토스후결제/KakaoPay 할부)
- 정산 리콘실리에이션 + 회계 연동
- 네트워크 토큰 (Visa VTS/Mastercard MDES)
- 글로벌 e-Invoice (Peppol, CFDI, GSTIN, 日本適格請求書)
- PCI DSS 감사 외부 컨설팅

## 15. Success Metrics (OSS)

- GitHub Stars: 1K (6mo), 3K (12mo)
- npm 다운로드: 5K/wk (6mo)
- Discord 가입 300 (6mo)
- 머천트 실가맹 레퍼런스 3개 (12mo)
- GitHub Pages 샌드박스 MAU 1,000 (6mo)

## 16. Open Questions (사용자 결정 필요)

### 제품/범위
- **Q1. 프로젝트 이름 확정** — `opencheckout` 수용? 다른 후보?
- **Q2. Phase 1 국가 프리셋 6개 적합한가?** (KR/US/JP/CN/EU/BR). 동남아 집중이면 TH/VN/ID 우선 편입?
- **Q3. CNY 지원 포기 vs Alipay-via-USD 우회 vs v1에서 Antom 어댑터 1등시민?** 리서치상 Toss 단독 CNY 불가 확정
- **Q4. "주소 모듈 단독 사용" 기능을 정말 지원? 아니면 체크아웃 번들만?** — 단독 지원이 채택률 ↑이나 설계비용 ↑

### 컴플라이언스
- **Q5. PCI DSS v4.0 대응 범위** — Toss iframe만 쓰면 SAQ A 유지하되, 머천트에게 "악성 스크립트 보호" 입증 가이드를 SDK가 제공할지
- **Q6. 한국 주민등록번호는 완전 배제** (수집 불가)? — 리서치 권고. 다만 일부 B2B/세무 케이스에서 필요성 여부
- **Q7. 디바이스 바인딩 Passkey의 v1 탑재 여부** — 필수? 옵션?

### PG/금융
- **Q8. 환율 가중치 기본값 10% 적합?** 테스트 머천트와 조율 필요
- **Q9. 환차손 책임 정책** — 가맹점 부담 단일 정책 vs 구매자 부담 옵션 제공?
- **Q10. 토스 외 PG v1에 1개라도 포함?** 리서치 권고는 "Toss 1개 집중" → v2 확장

### 인프라/운영
- **Q11. 샌드박스 Workers 프록시 유료화 경계** — 대규모 어뷰즈 시 운영 비용 누가 부담?
- **Q12. Issue/Discussion 한·영 이중 운영 비용** 감당 가능? 자동번역 봇 도입?

### 파트너십
- **Q13. 토스페이먼츠 영업 컨택** — 누가 언제 (USD/JPY MID 청약 + CNY 가능성 확인)?
- **Q14. juso.go.kr authkey, Google Places 키, 수출입은행 authkey 발급** — 법인 명의/개인 명의?

### 캐리어 & 데이터 모델 (이번 차 추가)
- **Q15. Phase 1 캐리어 어댑터 3종(CJ/EMS/DHL) 수용?** 또는 FedEx/UPS 앞당기기?
- **Q16. 한국 캐리어 파트너 API 접근권** — CJ대한통운·한진·롯데 API는 공식 상점 계약 필요. 초기 개발은 우체국 EMS(공공 API)로 대체하고 상용 어댑터는 계약 확보 후 릴리스?
- **Q17. `AddressCanonicalRecord` 원본 `rawResponse` 보관 정책** — 전량/무기한? GDPR "잊혀질 권리"와 상충 시 익명화 전략?
- **Q18. PII 암호화 공급자** — AWS KMS / GCP KMS / HashiCorp Vault 중 Phase 1 default? (self-host 사용자에겐 어댑터 인터페이스만 제공)
- **Q19. `AddressCanonicalRecord` 공개 범위** — 외부 API로 공개할 것인가(연동성 ↑, PII 유출 리스크) vs 내부 전용 스키마로 숨길 것인가? 공개 시 `scope=internal:read` 토큰 설계는 OAuth2 scopes로?
- **Q20. 다국어 locale 기본 세트** — `[ko, en, ja, zh-CN, zh-TW]` 5종을 모든 레코드에 강제 백필(스토리지 ↑)할지, lazy on-demand 계산할지?

### 배송/결제 확장 (이번 차 추가)
- **Q21. 배송비 계산 모듈 `@opencheckout/shipping-rates` Phase 1 포함?** 제안: Phase 1 **table-based만**, 캐리어 rate API는 Phase 2. 동의?
- **Q22. Phase 1 배송 훅 인터페이스 범위** — `ShippabilityOracle` + `ShipmentDraft` 상태기계만? 트래킹/라벨은 Phase 2로 이연해도 될까?
- **Q23. 제재국/수출통제 blocklist 데이터 소스** — OFAC SDN / EU / UN / KR 전략물자 리스트 중 어디서 업데이트? 패키지 내장 vs 외부 데이터 공급자?
- **Q24. 구독/정기결제 v1 포함?** 제안: Phase 2로 이연 (v1은 단발 결제만). 토스 `billingKey` 저장만 v1에 포함할지?
- **Q25. 사기방지 훅 v1** — 인터페이스만 공개(Sift/Signifyd 어댑터는 사용자가 직접 구현) vs Stripe Radar 스타일 무료 기본 룰 제공?
- **Q26. 차지백/분쟁 관리 대시보드** — OSS에 UI까지 포함할지, 훅+데이터만 제공하고 UI는 상용 어댑터에 위임할지?
- **Q27. 한국 현금영수증/세금계산서 발행 자동화** — Phase 2 필수? 한국 B2C 머천트는 거의 필수 기능 → 우선순위 높임?
- **Q28. 지역 특화 결제수단 우선순위** — Phase 2 예산 한정 시 JP(코인체크/콘비니) vs EU(iDEAL/SEPA) vs BR(Pix) 중 어디부터?

### 관세 / DDP (이번 차 추가)
- **Q29. 관세 내장 룰 엔진 10개국 커버리지 확정** — US/EU/UK/JP/CN/TW/AU/SG/BR/MX 수용? 인도·동남아(TH/VN/ID/MY/PH) 중 1–2개국 대체 추가?
- **Q30. 외부 관세 공급자 default 어댑터** — Phase 2 MVP에서 어느 공급자 1개를 "추천 기본"으로 문서화할지? Zonos(글로벌 최강, 유료), Avalara(엔터), SimplyVAT(EU), Easyship(통합형), 또는 오픈소스 내장만 기본?
- **Q31. HS code 관리 부담** — 머천트가 상품마다 HS code 직접 입력 의무 vs Phase 2 MVP에서 카테고리→HS code 매핑 테이블 기본 제공(정확도 낮아도)? HS code ML 자동 분류는 Phase 3
- **Q32. DDP 관세 환불 불가 동의 UX** — 체크아웃 "관세는 환불 불가" 체크박스 강제 vs 약관 한 줄 명시? EU 소비자법 대응 필요성
- **Q33. DAP 모드에서 수령 시 관세 추정치 표시** — 내장 룰로 "$15–25 추정" 강제 표시(FedEx 데이터상 미수령률 12%p 감소), 추정치 공급자 유료 호출 필요 시 머천트 부담 or 샘플링 호출?
- **Q34. Phase 1 DAP 기본 + 경고 배너 강제 수용?** 또는 Phase 1부터 10개국만이라도 내장 룰 기반 DDP 활성화(스코프 확장)?

### 구매자 UX / 주문 라이프사이클 / 내부 콘솔 (이번 차 추가)
- **Q35. Phase 1 이벤트 버스 default** — PostgreSQL outbox+LISTEN/NOTIFY로 V1 확정 수용? 또는 Redis Streams 옵션도 기본 제공?
- **Q36. 운영/물류 콘솔(`@opencheckout/admin-console`) 첫 릴리스 포함 여부** — 독립 OSS 패키지(self-host Next.js 앱)로 Phase 2 포함 vs 별도 리포지토리·별도 릴리스로 분리?
- **Q37. 다국어 CS LLM 번역** — SDK 자체 키(OSS 프로젝트 운영비) vs 머천트 본인의 OpenAI/Anthropic 키 주입?
- **Q38. Read-model 저장소** — read replica(PG) 단일? 또는 OpenSearch 필수로 끌어와 복합검색 보장?
- **Q39. 구매자 Order Tracking 페이지 UI** — SDK 기본 제공(머천트가 iframe 임베드) vs 헤드리스 API만 제공(머천트 자체 구현)?

### 스택 & 문서 (이번 차 추가)
- **Q40. 위젯 코어를 Preact로 결정 — 번들 예산 25kB 수용?** React-only 요구가 강하면 양보 가능?
- **Q41. Gateway Node 고정 vs Edge 혼합** — Toss 승인 API가 Node 런타임 고정 필요. 전체 Gateway를 Node로 할지, 토큰 발급만 Edge로 분리할지 (복잡도 vs 성능)
- **Q42. 문서 reference 렌더러** — Scalar 확정 수용? 또는 Redocly(기업 실적 많음) 검토?
- **Q43. JSR 퍼블리시** — 플래그십 패키지만? 모든 TS 패키지?
- **Q44. 시크릿 매니저 기본값** — Doppler(유료 SaaS) vs 1Password SDK vs HashiCorp Vault 커뮤니티 에디션 중 README 기본 예제 선택?

## 17. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| PCI DSS v4.0 위반으로 SAQ A-EP 전락 | High | Toss hosted/iframe redirect만 허용, DOM 접근 차단 강제 |
| US de minimis 폐지 미대응 | High | 2025-08-29 규정을 Phase 1에 반영, EIN/SSN/ITIN 필수 캡처 |
| EU GPSR RP 미검증 라벨 출고 | High | RP 없으면 체크아웃 차단, free-text 금지 |
| 주소 truncation silent fail | Med | Pre-flight validator + human review 마킹, silent machine romanization 금지 |
| 수출입은행 API 일일 쿼터 초과 | Med | 4회/일 제한, Redis 캐시 24h, 경보 임계치 |
| 토스 CNY 미지원 오해 | Med | README 최상단 명시, v2 로드맵에 해결책 |
| pykakasi GPL 감염 | Low | `cutlet` 강제 전환, CI 의존성 스캐너 |
| 공용 샌드박스 키 어뷰즈 | Med | Turnstile, IP 레이트리밋, BYOK 유도 |
| 관세 오계산 → 머천트 손실 or 구매자 클레임 | **High** | 내장 룰 월 1회 업데이트 cron + 세율 스냅샷 감사 로그 + 외부 공급자 폴백 + `nonRefundable` 명시 동의 |
| DAP 수령 거부로 배송비·반송료 폭증 | High | DAP 모드에서 관세 추정치 강제 표시 + DDP 전환 권고 CTA, 주요 고위험 국가(BR/MX/RU)는 DDP 기본 추천 |
| HS code 잘못 분류 → 통관 지연/압수 | Med | Phase 2에 카테고리 매핑 테이블 기본값 + 머천트 검수 필수 경고, Phase 3 ML 분류 |
| US ICS2 advance data filing 누락 | Med | 캐리어 어댑터에 ICS2 필수 필드 강제 스키마, 누락 시 송장 발급 거부 |

## 18. Governance

- `services/opencheckout/` 배치 (prototyping 단계이지만 product intent 명확)
- 승격 경로: `incubating/` 승격은 불필요, 바로 `services/`에서 시작하고 OSS로 공개 후 독립 레포로 이관 가능
- `.claude/` 워크스페이스 룰 상속 (plan-edit-discipline, overbuild-as-finding, validation-policy, code-quality-limits 적용)
- `governance/ZONE-TAXONOMY.md`에 등록

## 19. Cross-cutting Technical Concerns (ADR/TDD 링크 허브)

본 PRD는 **제품 스코프와 UX**를 정의한다. Cross-cutting 기술 관심사(보안·무결성·멱등성·DR·관측성·다중테넌시·PII·버저닝 등)는 **별도 ADR/TDD 14편**에 분리되어 관리된다. PRD의 해당 섹션은 ADR을 참조(delegate)하고, ADR은 PRD의 요구사항에 역참조한다. 전체 인덱스는 `docs/adr/README.md`.

### 블로커 ADR (구현 착수 전 확정 필수)

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
| [ADR-005](../docs/adr/ADR-005-multi-tenancy.md) | Postgres RLS + per-tenant KMS DEK + quotas | §5-6 tenantId, §9-3 |
| [ADR-006](../docs/adr/ADR-006-observability-slo.md) | SLI/SLO + tamper-evident audit chain | §4 D9, §8, §9 |
| [ADR-008](../docs/adr/ADR-008-supply-chain-security.md) | SLSA L2 + SBOM + Sigstore provenance | §11, §14 Phase 1 |
| [ADR-010](../docs/adr/ADR-010-error-contract-i18n.md) | RFC 7807 + `errors.yaml` 레지스트리 + i18n | §5-6 warnings, §9 |
| [ADR-012](../docs/adr/ADR-012-high-risk-flows.md) | 7개 고위험 경쟁조건 시퀀스 + 보상 | §5-9, §5-10, §6-4 |
| [ADR-014](../docs/adr/ADR-014-data-integrity.md) | 무결성 (hash chain + HMAC + SRI + WORM) | §5-6 audit, §6-5, §8 |
| [ADR-015](../docs/adr/ADR-015-automated-e2e-testing.md) | 자동 E2E 테스트 (Playwright + synthetic + chaos + mutation) | §10, §12 |
| [ADR-016](../docs/adr/ADR-016-reliability-engineering.md) | Reliability (circuit breaker + bulkhead + feature flag + progressive delivery) | §6, §14 Phase |
| [ADR-017](../docs/adr/ADR-017-security-testing-and-assurance.md) | 보안 테스트/감사 파이프라인 (SAST/DAST/pentest/bounty/PCI/SOC2) | §11, §14 |
| [ADR-018](../docs/adr/ADR-018-engineering-blueprint.md) | **엔지니어링 블루프린트** — gstack 파이프라인 + BigTech 선별 도입 + Karpathy 4원칙 | 전체 |
| [ADR-019](../docs/adr/ADR-019-cross-adr-normalization.md) | **Cross-ADR 정규화** — 상태 vocab / TTL 3축 / 보관기간 / 네임스페이스 단일화 | 전체 |

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

Q6 (RRN 배제) / Q17 (rawResponse 충돌) / Q18 (KMS) / Q19 (Canonical scope) / Q23 (blocklist) / Q35 (이벤트 버스) / Q38 (read-model) / Q41 (Node/Edge 경계) 는 위 ADR에서 확정. 나머지는 제품 범위 결정으로 PRD §16 유지.

### 이 PRD의 검토 이력

- v0 초안: 2026-04-23 (리서치 6편 통합)
- v0 보완: 배송 확장, 결제 확장, 관세, 구매자 UX, 운영 콘솔, FE/BE 스택, 토스 스타일 샌드박스/문서
- **v0 기술 감사**: `research/08-technical-review.md` (17 차원 🔴9/🟡7/🟢1 → request changes)
- **v0 기술 보완**: ADR 14편 + TDD 2편으로 cross-cutting 관심사 분리 (본 섹션)

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
- `research/09-external-review.md` — 외부 전문가 7명 통합 리뷰 (만장일치 Block)
- `research/10-bigtech-and-gstack.md` — Google/Meta/Anthropic/OpenAI + gstack/gbrain + Karpathy 도입 분석

## 부록 B. Phase 1 패키지 의존 그래프

```
widget-vanilla ─┐
widget-react ───┼─→ sdk-browser ──→ core
                │                     ↑
                └─→ address ──────────┤
                      │               │
                      ├─→ adapters-juso
                      ├─→ adapters-google-places
                      └─→ adapters-kakao
                                        │
gateway (self-host) ──→ sdk-node ───────┤
                          │             │
                          ├─→ payments ─┤
                          │     └─→ adapters-toss
                          └─→ adapters-exim
                                        │
key-provider ──────────────────────────┘
testing (msw 픽스처) — 전 패키지 dev 의존
```

---

**Next step**: 이 PRD에 대한 user 피드백/승인 → 네이밍 확정 → Open Questions 14건 결정 → Phase 1 Implementation Plan 작성 (별도 문서 `plan/phase1-plan.md`).
