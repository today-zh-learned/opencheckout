# ADR-015: 자동 E2E 테스트 전략

- **Status**: Accepted
- **Date**: 2026-04-23
- **Deciders**: QA Architecture, Platform Engineering, SRE, Payments, Security
- **Scope**: PRD §10 (Sandbox), §12 (Testing), 전체 SDK/Widget/Gateway 품질 게이트
- **Related**: ADR-003 (Security), ADR-006 (SLO), ADR-011 (API Versioning), ADR-012 (High-risk Flows), ADR-013 (Concurrency), TDD-01 (Gateway Design)

## Context

OpenCheckout는 (a) 다국가 결제 · 배송 · 관세 · 마일/포인트 복합 상태기계, (b) iframe PCI-SAQ-A 경계, (c) 3rd-party eventual consistency (Toss / DHL / FedEx / FX / Duty), (d) 공개 SDK/Widget 버전 호환성, (e) WCAG 2.2 AA 접근성, (f) 머천트 샌드박스 (GitHub Pages + Cloudflare Workers 프록시)를 한 번에 보장해야 한다. 단일 테스트 계층으로는 증명 불가. Stripe/Shopify는 Test Pyramid + Contract + Synthetic + Chaos를 다층 결합한다. 본 ADR은 OpenCheckout 품질 게이트를 수치 SLO와 함께 표준화한다.

## Decision

### 1. Test Pyramid (수치 목표)

| 계층 | 비중 | 도구 | 예산 | Gate |
|------|------|------|------|------|
| Unit | 70% | Vitest | p95 < 5ms/test, 전체 < 60s | PR 차단 |
| Integration | 20% | msw + nock + Testcontainers-Postgres/Redis | 전체 < 5min | PR 차단 |
| Contract | 5% | Schemathesis (OpenAPI) + Pact (webhook) | 전체 < 3min | PR 차단 |
| E2E | 5% | Playwright (API + Browser) | 전체 < 10min | main merge gate |

**Coverage 게이트**: line 80%, branch 75%, mutation score 60% (Stryker). Critical 모듈(`packages/payments`, `packages/duties`, `packages/idempotency`, `packages/saga`)은 line 90% / mutation 75%.

### 2. E2E Test Matrix

각 행은 독립된 spec 파일, 독립 격리된 DB/Redis 네임스페이스, 공유 Playwright global fixture.

| Spec | 시나리오 | 커버 요구 |
|------|---------|----------|
| `e2e/checkout-krw-domestic.spec.ts` | KR→KR 국내 (CJ 택배) | PRD §4, §6 |
| `e2e/checkout-usd-export-ddp.spec.ts` | KR→US 역직구 DDP + EIN 수집 | PRD §7, §8 |
| `e2e/checkout-jpy-export-dap.spec.ts` | KR→JP DAP + JCT (¥10,000↑) | PRD §7, §8 |
| `e2e/checkout-cn-sandan-bijiao.spec.ts` | KR→CN 三单比对 (订单/支付/物流) | PRD §7 |
| `e2e/checkout-br-cpf-hard-blocker.spec.ts` | Brazil CPF 검증 hard-blocker | PRD §7 |
| `e2e/refund-saga.spec.ts` | Scenario 1 (ADR-012) | Saga 부분실패 |
| `e2e/webhook-race.spec.ts` | Scenario 2 (ADR-012) | Transition guard |
| `e2e/address-change-post-label.spec.ts` | Scenario 3 (ADR-012) | 캐리어 amendment |
| `e2e/duty-expire-reprice.spec.ts` | Scenario 4 (ADR-012) | ±5% 밴드 |
| `e2e/toss-timeout-reconcile.spec.ts` | Scenario 5 (ADR-012) | Reconcile polling |
| `e2e/fx-snapshot.spec.ts` | Scenario 6 (ADR-012) | 30분 TTL |
| `e2e/partial-full-refund.spec.ts` | Scenario 7 (ADR-012) | Running balance |
| `e2e/widget-pci-iframe-isolation.spec.ts` | iframe boundary | SAQ-A 경계 카드번호 parent 접근 불가 |
| `e2e/widget-a11y-axe.spec.ts` | WCAG 2.2 AA | axe-core 위반 0 |
| `e2e/rtl-hebrew.spec.ts` | RTL 언어 (v2) | 레이아웃 mirror |

각 spec 성공 기준: 최종 DB 상태 + Ledger 정합 + Notification 큐 어서션 + OTel span 검증.

### 3. Playwright 구성

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? 4 : 2,
  retries: process.env.CI ? 2 : 0,          // flaky 방지
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['./reporters/flaky-autoissue.ts'],      // flaky 자동 issue
    ['./reporters/otel-exporter.ts'],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    storageState: 'fixtures/auth.json',      // OTP fixture 재사용
  },
  projects: [
    { name: 'chromium',     use: devices['Desktop Chrome'] },
    { name: 'firefox',      use: devices['Desktop Firefox'] },
    { name: 'webkit',       use: devices['Desktop Safari'] },
    { name: 'mobile-chrome',use: devices['Pixel 7'] },
    { name: 'mobile-safari',use: devices['iPhone 14'] },
  ],
  globalSetup: './e2e/global-setup.ts',      // Toss 샌드박스 키 주입, DB seed, Workers proxy 시작
  globalTeardown: './e2e/global-teardown.ts',
});
```

- `globalSetup`: Toss 샌드박스 공개키 주입, Postgres `TRUNCATE ... RESTART IDENTITY`, Testcontainers Redis 기동, Cloudflare Workers 로컬 프록시(`wrangler dev`) 부팅, Toxiproxy 세팅
- `storageState`: OTP 통과 후 세션 저장 → 스펙마다 재인증 금지
- Trace + Video on failure → 실패 재현 패키지 `failures/{specId}/{timestamp}.zip`
- Flaky 2회 이상 연속 실패 시 `.flaky-quarantine.json`에 자동 등록 + GitHub issue 생성

### 4. Sandbox 통합 (PRD §10)

- **GitHub Pages 샌드박스 자체가 E2E 타깃**: `sandbox.opencheckout.dev`를 실제 E2E URL로 사용 → 머천트 경험과 동일 경로 검증
- **Cloudflare Workers 프록시**: 공개 테스트 키로 Toss 샌드박스 호출, rate limit + CORS 규칙 실측
- **Toss test 카드 매트릭스**: `4242...` 승인, `4000 0000 0000 0002` 거절, `4000 0027 6000 3184` 3DS challenge, `4000 0000 0000 0069` expired — 각 카드마다 confirm + refund 경로 스펙

### 5. Synthetic Monitoring (Production)

- **도구**: 자체 패키지 `@opencheckout/synthetic-probes` (Playwright headless runner, 왜: 테스트 카드 + 내부 API 키 관리 측면에서 Checkly보다 자유도 높음)
- **주기**: 매 5분
- **위치 × 통화**: 서울 / 도쿄 / 프랑크푸르트 × KRW + USD = 6 매트릭스
- **SLO**: p95 confirm 성공률 ≥ 99.9% (ADR-006 `/v1/payments/confirm` SLO 연계)
- **실패 알람**: 2연속 실패 → PagerDuty P1, Slack `#incidents`
- **분리 원칙**: prod 실데이터와 격리된 `synthetic_` prefix 주문만 생성, 일 24 × 12 = 288 주문 상한

### 6. Visual Regression

- **스택**: `@playwright/test` 내장 스크린샷 + `pixelmatch` diff (Percy 미도입 — OSS 우선)
- **커버**: 위젯 컴포넌트별 (card / 3DS / 주소 입력 / 완료), 다국어 ko/en/ja, 라이트/다크 모드
- **Docusaurus 페이지**: PR 리뷰 보조 스냅샷 (선택 gate, 권고)
- **Threshold**: `maxDiffPixelRatio: 0.01`, 위젯 핵심 요소는 `0.005`
- **업데이트**: 스크린샷 갱신은 PR 라벨 `visual-ok` 필요 (self-approve 방지)

### 7. Contract Testing

- **Schemathesis**: OpenAPI 3.1 스키마로부터 자동 fuzz + 속성 기반 (1000 케이스/엔드포인트)
- **Pact**: 웹훅 `consumer=merchant-mock`, `provider=gateway` — `payment.*`, `order.*`, `shipment.*` 계약
- **브레이킹 감지**: ADR-011 semver 정책 위반 시 PR 차단. `openapi-diff` + Pact broker 양방향 검증
- **실행**: PR마다 정적 diff, nightly full schemathesis sweep

### 8. Property-based Testing

- **도구**: `fast-check`
- **대상**:
  - 환율/통화 변환 (associativity, idempotency, bounded precision)
  - 주소 파싱 (ISO 3166 국가 × 100개 샘플)
  - amount 분해 (세금 + 관세 + 배송 합계 무손실)
  - 멱등 키 (동일 키 → 동일 결과)
- **예산**: 1000+ 생성 케이스 per property, `seed` 고정 재현

### 9. Mutation Testing

- **도구**: Stryker (TS)
- **Gate**: critical 모듈 `mutation score ≥ 60%` (payments / duties / idempotency / saga는 75%)
- **주기**: merge to main + nightly diff (전체 실행은 주 1회)
- **배제**: codegen, 타입 전용 파일, fixture

### 10. Load / Stress Testing

- **도구**: k6
- **시나리오**:
  - `scripts/k6/confirm-500rps.js`: `/v1/payments/confirm` 500 RPS/pod × 10분
  - `scripts/k6/peak-valentine.js`: 발렌타인 시뮬 (30초 5배 스파이크)
  - `scripts/k6/blackfriday.js`: BF 시뮬 (3시간 3배 지속)
- **Gate**: p95 latency < 800ms, error rate < 0.1%, CPU < 75%
- **주기**: Nightly. 회귀 시 `perf-regression` issue 자동 생성

### 11. Chaos Testing

- **도구**: Toxiproxy (네트워크) + Chaos Mesh (K8s 파드/디스크/CPU)
- **Chaos Day**: 주 1회 스테이징
- **플레이북**:
  - Postgres primary kill → replica failover 검증
  - Toss API 503 10분 → reconcile backlog drain < 5분
  - KMS slow (+2s) → circuit breaker 트립 + fallback 키
  - Redis partition → idempotency store degrade-gracefully (DB fallback)
- **자동 회복 어서션**: SLO 90분 내 원복

### 12. Accessibility Testing

- **자동**: `@axe-core/playwright` — 모든 위젯 상태(idle / focus / error / loading / 3DS) WCAG 2.2 AA 위반 0
- **수동 분기별**: VoiceOver (macOS/iOS) / NVDA (Windows) / JAWS 매트릭스 — QA 리드 서명
- **Gate**: critical/serious axe 결과 0, moderate 이하 issue 자동 티켓

### 13. Security Testing in E2E

- **OWASP ZAP**: PR baseline (< 2min), nightly full scan (ADR-003 연계)
- **세션 하이재킹 시뮬**: 토큰 재사용 차단 (rotated token 403)
- **CSRF**: 토큰 부재 시 거부 검증
- **Rate limit E2E**: per-IP 초과 시 429 + `Retry-After` 헤더
- **시크릿 스캔**: gitleaks + trufflehog PR

### 14. CI/CD Pipeline

| 단계 | 실행 테스트 | 예산 | 차단 여부 |
|------|------------|------|----------|
| PR | unit + integration + contract + visual + a11y + ZAP baseline + lint + type | < 10min | 차단 |
| Merge → main | + E2E full + mutation(critical) + load smoke + ZAP full | < 30min | 차단 |
| Nightly | + synthetic replay + chaos day(월1) + mutation full + pen-test scripts | 2h 예산 | 비차단 / issue |
| Release tag | 전체 + 수동 a11y 스캔 + 머천트 샌드박스 smoke | — | 차단 |

- **Flaky quarantine**: 자동 격리 + issue, 7일 내 미수정 시 main 차단 escalate
- **증거 아카이브**: 모든 아티팩트(trace, video, HAR, coverage, mutation report) S3 90일 보관

### 15. Test Data / Fixtures

- 위치: `packages/testing/fixtures/`
- 구성:
  - `addresses/` — 15개국 × 7개 = 100+ 주소 (faker + 수동 검증)
  - `tax-ids/` — CPF / CNPJ / EIN / NIF / ABN 등 50개 (전부 알고리즘적 valid 합성)
  - `products/` — HS 코드 매트릭스, 카테고리별 duty rate
  - `scenarios/*.yaml` — 결제 시나리오 YAML (sandbox 재현 입력)
- **PII 금지**: 실데이터 사용 금지(GDPR). `faker` + seed 고정
- **검증**: 매 nightly fixture 정합성 린트(`fixture-lint.ts`)

### 16. Observability

- Playwright 실행 자체 OTel 계측: span `e2e.spec.{name}`, attr `commit_sha`, `run_id`, `project`
- Slack/Discord 실시간 실패 요약 (`#qa-signals`)
- Flaky 대시보드: Grafana, 스펙별 7일/30일 flake rate
- Coverage/mutation 장기 추세 — Codecov + Stryker dashboard

---

## Consequences

**긍정**
- 7대 race 시나리오(ADR-012) 자동 회귀 방지, 재무 정합성 수치 보증
- SLO(ADR-006)를 prod synthetic으로 상시 검증, MTTR 단축
- Contract + mutation이 semver 브레이킹 조기 차단 (ADR-011 보강)
- 머천트 샌드박스 자체가 E2E 타깃 → dogfooding 강제
- iframe PCI 경계 + WCAG 2.2 자동 레그레션

**부정**
- 초기 구축 4–6주(QA 2명, SRE 1명). 도구 11종 운영 복잡도
- CI 비용 월 예상 $1.5–2.5K (GitHub Actions runners + k6 cloud + synthetic 위치 3곳)
- Flaky 관리 오버헤드 — quarantine 큐 주간 리뷰 루틴 필요
- Chaos Day 스테이징 점유 (주 1회 2시간)
- Mutation testing full sweep 주 1회 3–5시간

---

## Checklist (릴리스 게이트)

1. [ ] Unit line ≥ 80%, branch ≥ 75%
2. [ ] Critical 모듈 line ≥ 90%, mutation ≥ 75%
3. [ ] Integration suite < 5min, green
4. [ ] Contract (Schemathesis + Pact) 통과, 브레이킹 없음
5. [ ] E2E 15개 spec 전부 green × 5 브라우저 프로젝트
6. [ ] Visual regression diff < threshold, 갱신 승인 라벨 완료
7. [ ] axe-core critical/serious 0
8. [ ] ZAP full scan high/critical 0
9. [ ] k6 p95 < 800ms, error < 0.1% at 500 RPS
10. [ ] Chaos Day 최근 회차 복구 SLO 충족
11. [ ] Synthetic probes 최근 24h 성공률 ≥ 99.9%
12. [ ] Fixture 린트 통과, 실 PII 0
13. [ ] Flaky quarantine 0 open (또는 추적 issue 모두 triaged)
14. [ ] OTel 테스트 span 수집 확인, 대시보드 live
15. [ ] OpenAPI snapshot 업데이트, Pact broker publish 완료
16. [ ] Release note에 mutation score / coverage delta 기록

---

## Open Questions

1. Synthetic 카드 발급량 상한 — Toss 샌드박스 rate 정책 재확인 (Payments 팀)
2. Percy 재도입 여부 — OSS 스냅샷 diff의 위음성(false-negative)률 4주 관찰 후 결정
3. Chaos Mesh vs. Litmus 선택 — K8s 팀 장기 표준 확정 대기
4. Mutation Gate 임계값 60/75% 엄격도 — Critical 모듈 실측 후 3개월 재보정
5. WCAG 수동 스크린리더 자동화 — Assistiv Labs / BrowserStack Live 비용 분석 필요
6. 샌드박스 synthetic 주문이 머천트 대시보드 지표 오염 우려 — `synthetic_` prefix 필터 UI 반영 여부

## References

- PRD §10 (Sandbox), §12 (Testing)
- ADR-003 Security, ADR-006 SLO, ADR-011 API Versioning, ADR-012 High-risk Flows, ADR-013 Concurrency
- TDD-01 Gateway Design
- Stripe Engineering — "Online migrations at scale" (contract + dual-writes 테스팅)
- Shopify — "Testing at scale" (pyramid + contract)
- Playwright docs, Stryker Mutator, Schemathesis, Pact Foundation, k6, Toxiproxy, Chaos Mesh
- WCAG 2.2 AA (W3C, 2023-10)
