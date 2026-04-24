# FE/BE 스택 전문가 조언 (Stripe/Shopify/Toss 레벨)

source: researcher agent, 2026-04-23

## 확정 스택 테이블

| 영역 | 선택 | 핵심 근거 |
|---|---|---|
| 위젯 코어 | **TS + Web Components + Preact** | 25kB gzipped 예산, 프레임워크 중립 |
| FE 래퍼 | React/Vue/Svelte 개별 패키지 | 생태계 커버 |
| Gateway | **Hono** (Node primary, Edge secondary) | 런타임 이식성 + 성능 |
| API 스타일 | **REST + OpenAPI 3.1** | 다언어 SDK SSOT |
| DB | **PostgreSQL + outbox** | 단순성, V2에 이벤트 스토어 옵션 |
| 암호화 | App-layer envelope + KMS | 키 로테이션·멀티테넌시 |
| 라이브러리 빌드 | **tsup** | dual ESM/CJS |
| 위젯 빌드 | **Vite** | HMR, lib mode |
| 린터/포매터 | **Biome** (+ESLint 필요 시) | 속도·DX |
| 테스트 | **Vitest + Playwright** | iframe·E2E |
| OAS 클라이언트 | openapi-typescript + openapi-fetch | 경량 8kB |
| 멀티언어 SDK | OAS + 생성 70% / 수작업 30% | Stripe/Twilio 패턴 |
| Spec 게이트 | Spectral + oasdiff | breaking 감지 |
| 문서 | **Docusaurus + Scalar + Algolia + Sandpack** | OSS·i18n·인터랙티브 |
| 배포 기본 | Docker Compose → Fly.io → K8s Helm | self-host 우선 |
| 시크릿 | Doppler/1Password SDK (어댑터 Vault/ASM) | 락인 회피 |
| 관측성 | OpenTelemetry + Sentry Browser | 벤더 중립 |
| 배포 파이프 | Changesets + npm + JSR | 듀얼 레지스트리 |
| 기여자 환경 | devcontainer + nix-shell + pnpm | 원클릭 |

## 주요 결정 근거

### 1. 위젯 프레임워크
- Stripe Elements는 iframe 격리 + 얇은 부모 스크립트로 PCI 범위 축소
- Shopify Checkout UI Extensions는 Web Components/Preact 조합
- **iframe boundary 안은 Preact, 바깥 host script는 Web Components**가 최적
- React-only 기각: 번들 45kB+, Vue/Svelte 사용자 배제
- Lit 기각: Web Components 표준 준수는 좋으나 11kB 추가로 예산 초과

### 2. 백엔드 Hono 채택
- Cloudflare Workers/Vercel Edge/Node/Bun/Deno 모두 단일 코드베이스
- Web Standards(Request/Response) 기반 — 런타임 어댑터 교체 자유
- Fastify 수준 또는 상회 성능
- **하지만 Toss 승인 API 호출은 Node 런타임 고정** — 고정 IP allowlist 가능성, crypto.subtle 외 Node 동작, 타임아웃 제어
- Edge는 위젯 토큰 발급/공개 조회만. 승인·웹훅은 Node 분리

### 3. DB PostgreSQL 단독
- 전용 이벤트 스토어(EventStoreDB/Kurrent)는 V1 과잉 — 운영 복잡도 2배
- outbox + `LISTEN/NOTIFY` 또는 `pg_logical`로 Debezium/Kafka 이관 경로만 열어둠
- Read replica 분리, OpenSearch는 "90일 거래 검색" 전용
- **앱단 envelope encryption(KMS DEK) + pgcrypto 보조**. pgsodium은 Supabase 외 운영 레퍼런스 얇음

### 4. 문서 스택 재검토 (토스 벤치마크)
- docs.tosspayments.com은 Next.js 커스텀으로 추정. Reference는 독립 커스텀
- 하지만 우리는 OSS 기여자 친숙한 **Docusaurus + Scalar + Algolia + Sandpack** 조합 채택
- Mintlify 기각: SaaS 락인, self-host 불가
- Redoc 기각: UI 정체 (Scalar가 더 현대적)

### 5. 멀티언어 SDK 하이브리드
- TS: 수작업(DX 최우선, Stripe-node도 주로 수작업)
- Python/Go/Java: **생성 70% + 수작업 래퍼 30%**
  - Stripe는 Go/Java/PHP를 내부 `sdk-codegen` + 수작업 보강
  - Twilio는 OAS 기반 자동생성 비율 높음
  - Square는 완전 자동생성에서 DX 불만으로 수작업 전환 중
- 생성기: Python `openapi-python-client`, Go `oapi-codegen`, Java `openapi-generator`
- Spec 거버넌스: Spectral(lint) + oasdiff(breaking change CI 게이트) + Redocly bundle

### 6. 배포 우선순위
1. **Docker Compose** (기본, 자체 서버/온프렘)
2. **Fly.io** (한 줄 배포, 글로벌 edge + 지역 고정 IP 가능)
3. **Kubernetes Helm chart** (엔터프라이즈)
4. Cloudflare Workers — 위젯 토큰 발급만
- Vercel 기각: 장시간 웹훅 재시도/백그라운드 잡 부적합

### 7. 관측성
- OpenTelemetry 단일 계측(SDK/Gateway/Widget RUM)
- Exporter만 교체하면 Grafana/Datadog/Honeycomb 선택
- Widget은 OTel Web + Sentry Browser 병행
- Redaction 룰: 카드번호/CVC/생년월일/전화번호 마스킹, Authorization 헤더 삭제, webhook body 해시만 로깅

## OSS 기여자 온보딩 경험

기여자는 "Open in GitHub Codespaces" 배지를 누르면 60초 내 devcontainer 부팅. `pnpm i && pnpm dev` 한 줄로:
1. 위젯 데모 사이트 (Vite, :5173)
2. Gateway (Hono, :8787)
3. 문서 사이트 (Docusaurus, :3000)
4. Sandpack 플레이그라운드

`.env.example`에 Toss 테스트 키 주석 제공, 첫 테스트 `pnpm test:widget -- card` 한 줄.

`good-first-issue` 라벨은 전부 "한 파일·단일 함수" 범위. CI는 Biome/Vitest/Playwright/oasdiff/Changesets 5개 게이트. 문서 기여자는 MDX 한 파일 수정하면 Crowdin-sync가 나머지 언어에 placeholder 생성.

## Sources

- https://stripe.com/docs/js
- https://docs.stripe.com/payments/elements
- https://shopify.dev/docs/api/checkout-ui-extensions
- https://hono.dev/docs/getting-started/basic
- https://github.com/honojs/hono#benchmarks
- https://github.com/stripe/openapi
- https://www.postgresql.org/docs/current/sql-notify.html
- https://tsup.egoist.dev/
- https://biomejs.dev/blog/biome-v1/
- https://playwright.dev/docs/frames
- https://openapi-ts.dev/
- https://github.com/stripe/stripe-node
- https://github.com/oasdiff/oasdiff
- https://docusaurus.io/docs/i18n/introduction
- https://github.com/scalar/scalar
- https://sandpack.codesandbox.io/
- https://fly.io/docs/networking/dedicated-ipv4/
- https://docs.doppler.com/docs
- https://opentelemetry.io/docs/languages/js/
- https://github.com/changesets/changesets
- https://jsr.io/docs/publishing-packages
- https://docs.github.com/en/code-security/security-advisories
