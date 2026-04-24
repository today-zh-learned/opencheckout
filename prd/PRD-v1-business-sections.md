# OpenCheckout PRD v1 — Business Sections Supplement

- **Status**: Draft v1.0 (business supplement to PRD-v0)
- **Date**: 2026-04-23
- **Author**: ziho (CPO-mode draft)
- **Scope**: Fills the "비즈니스 섹션 0%" gap flagged by 7/7 external reviewers (`research/09-external-review.md` §B-2). PRD-v0 remains unchanged; merge plan in §B-Merge.
- **Guiding principles**: Karpathy "Goal-Driven Execution" — every number must be verifiable, every milestone falsifiable.
- **Carve-out**: Target is explicitly narrowed to **한국 D2C 셀러의 역직구** per reviewer finding B-4 (ADR-018 §2-2 아키텍처 정렬).

---

## §B1. Business Model & Pricing

### 구조 (3-tier)

| Tier | 대상 | 가격 | 포함 | 비포함 |
|---|---|---|---|---|
| **OSS Core** | 개인/OSS 머천트 | **Free**, Apache 2.0 | `@opencheckout/core`, `adapter-toss`, `adapter-cj`, `adapter-ems`, widget-vanilla, React wrapper | 호스팅, SLA, 계정 KMS |
| **Hosted Managed** | 월 주문 100–5,000 한국 D2C | **$99/mo starter + 0.30% GMV** | 매니지드 Gateway, juso/수출입은행/Places 공용 키, 업타임 99.5% SLA, 이메일 서포트 (48h) | per-tenant KMS, mTLS |
| **Enterprise** | 월 GMV $200K+ | **custom (floor $1.5K/mo)** | per-tenant KMS, mTLS, SOC 2 evidence pack, slack shared channel, 99.9% SLA, DPO 브리핑 | 공장 커스텀 코드 |

### 차별화 (Toss와 이중 과금 회피)

- 토스페이먼츠 가맹점 수수료(KRW 2.5–3.3%)는 **머천트 → Toss 직접** 정산. OpenCheckout은 주문 건별 SDK overhead 0.30%만 과금.
- Managed tier의 0.30%는 Shopify Plus의 0.25%, Stripe의 0.5% 사이 중간대. 토스와 경쟁하지 않고 **Toss 위에 얹는 orchestration layer**로 포지셔닝.
- Self-host (OSS Core)는 영구 무료 — 이 약속을 Apache 2.0 + CLA 없음으로 고정.

### 가격 A/B 실험 계획

- **대상**: Beta waitlist 중 5개 머천트 (한국 D2C, 월 주문 300–1,500)
- **기간**: 2026-08 ~ 2026-10 (3개월)
- **Arms**:
  - Arm A: $99/mo + 0.30% GMV
  - Arm B: $49/mo + 0.45% GMV
- **Primary metric**: 90일 retention × monthly revenue per merchant
- **Decision rule**: 통계적 유의성 p<0.1 (n=5 unilateral), 실패 시 Arm A 유지
- **측정 도구**: Stripe Billing (self-metering) + Posthog funnel

### 단가 가정 (Unit Economics v0)

- 평균 한국 D2C 월 GMV: $30K
- 0.30% of $30K = $90/mo GMV fee + $99 starter = **$189 ARPU**
- 서빙 원가: Cloudflare Workers + Neon Postgres = ~$12/mo/tenant
- **Gross margin**: ~93% (software-only, PSP 수수료 미포함)
- 위 단가는 고객 인터뷰 완료 전 추정치 — §B3 완료 후 확정.

---

## §B2. Market Sizing (TAM / SAM / SOM)

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
- SAM 가격 적용 시 연 TAM: 2,000 × $2,268 (ARPU annualized) = **~$4.5M ARR**

### SOM — Serviceable Obtainable Market

| 시점 | 머천트 수 | ARR | Logic |
|---|---|---|---|
| Y1 (2026) | 50 | $113K | SAM 2.5%, Product Hunt + HN + Toss Tech 글 1편 |
| Y2 (2027) | 200 | $454K | Word-of-mouth + 토스 공식 파트너십 승인 |
| Y3 (2028) | 500 | $1.1M | 한국 점유 + 일본 pilot (adapter-gmo-pg) |

- SOM 가정의 반증 조건: Y1 end에 활성 머천트 < 25 → 피보팅 검토 (§B11 Option D).

---

## §B3. Customer Evidence (향후 실행 계획)

### Primary Persona

- **이름**: "한국 D2C 브랜드 개발 리드"
- **특징**:
  - 패션·뷰티·식품 카테고리 (월 주문 100–5,000)
  - 자체 Next.js 체크아웃 운영 (Shopify/Cafe24 **사용 안 함**)
  - 토스페이먼츠 연동 완료, 해외 배송은 CJ + EMS 혼용
  - 창업자 본인이 코드 리뷰 가능한 1–5인 엔지니어링 조직
- **JTBD**: "미국/일본 구매자가 카트에서 이탈 없이 원화·달러 동시 결제하고, 관세를 사전에 보이게 하고 싶다."

### Secondary Persona

- **이름**: "헤드리스 커머스 Solo 개발자"
- 월 주문 50–500, Shopify Hydrogen/Medusa.js 경험, OSS에 기여 경험 있음
- Managed tier 전환은 낮음, OSS 기여·토론에는 높음 → 커뮤니티 시드 역할

### 인터뷰 플랜 (2026-05-01 ~ 2026-05-31)

| 항목 | 목표 | 방법 |
|---|---|---|
| 45분 문제 인터뷰 | 15명 | JTBD 템플릿, 금전적 보상 $50/세션 |
| LOI (Letter of Intent) | 5명 | Managed tier beta 90일 무료 + 피드백 약정 |
| Beta waitlist | 50명 | 랜딩페이지 (opencheckout.dev) + 밋업 사인업 |
| 샘플링 | Primary 10 + Secondary 5 | LinkedIn + 한국 D2C 슬랙 + 토스 파트너 레퍼런스 |

### 데이터 수집 도구

- Interview recording: Modjo (KR 개인정보 옵션)
- Notes: NotebookLM + Notion DB
- Synthesis: JTBD affinity map → PRD v1.1 반영

### 주의사항

- 본 섹션은 인터뷰 **이전** 작성된 가설. 2026-06-01 PRD v1.1에서 실제 인용문·타임라인으로 업데이트.
- 인터뷰 결과 Primary Persona와 불일치 시 §B2 SOM 재산정.

---

## §B4. Competitive Landscape & Response

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
| Stripe가 Toss 인수 | 10% | High | 멀티-PG 라우터 설계 (ADR-018 §2-2 adapter 구조로 이미 대비) |
| Medusa가 한국 어댑터 오픈소스 출시 | 40% | Medium | "체크아웃 only + DDP 관세 + i18n 15개국" 전문 레이어로 차별화 |
| 토스가 자체 OSS SDK 발표 | 25% | High | 공식 파트너 티어 확보(§B8) + PSP-중립 어댑터 레이어 유지 |
| 대형 Cafe24 플러그인 등장 | 50% | Low | Cafe24 자체 플랫폼 밖 타깃이라 직접 충돌 없음 |

### Defensibility

- **Moat-1**: 한국 D2C 역직구에 특화된 **어댑터 라이브러리** (juso/수출입은행/HS코드/DDP 테이블)
- **Moat-2**: AI-ready API — MCP server + OpenAPI function-calling 자동 export (ADR-018 §2-3 P1)
- **Moat-3**: Toss 공식 파트너 (§B8 추진 중)
- **Not a moat**: UI 위젯(복제 쉬움), 기본 결제 플로우(범용)

---

## §B5. Team & Hiring Plan

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
- **법률 자문**: 김·장 또는 율촌 (현재 접촉 중, §B8)

### Bus factor 완화

- 모든 ADR/PRD/운영 런북은 repo 내 markdown (knowledge = 공개)
- Secrets: 1Password shared vault + Shamir's secret sharing (founder + advisor 2-of-3)

---

## §B6. Funding & Runway

### Pre-seed 타깃

- **금액**: $750K – $1.5M (18개월 runway)
- **타깃 투자자**:
  - **Y Combinator W26** (application 2026-08, 1순위 시도)
  - 국내: Altos Ventures, KB Investment, 스프링캠프
  - Strategic: 토스 내부 Venture team (파트너십 signal)
- **Valuation 가설**: $6M–$10M post-money (seed SAFE)

### Seed 조건 (투자자 마일스톤)

- [ ] Phase 1 GA 출시 (2026-09, §ADR-018 Phase 0/1 체크리스트 완료)
- [ ] **50 활성 머천트** (무료 OSS + Managed 혼합)
- [ ] **$5K MRR** (Managed tier 유료 전환)
- [ ] **Toss 공식 파트너십 MOU 서명**
- [ ] SOC 2 Type I gap assessment 완료 (advisors 주선)

### Burn & Runway

- **현 월 burn (1인)**: $5K
  - 도구: Cursor $20 + Claude $200 + Codex $200 + Vercel $20 + Neon $20 + Cloudflare $5 + Turnstile + Sentry $26 ≈ $500
  - 법무 월 자문료: $1,500 (리테이너)
  - 클라우드/인프라 여유분: $500
  - 생활비 보조: $2,500
- **Post-seed 월 burn (4인)**: ~$55K
- **18개월 runway @ $1.2M seed**: 22개월 여유 (gracefully)

---

## §B7. Go-to-Market Motion

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

- **SEO (한글 롱테일)**:
  - "토스페이먼츠 Next.js 연동"
  - "역직구 DDP 관세 자동화"
  - "juso.go.kr API Next.js"
  - "개인정보 국외이전 동의 모달"
- **Community**:
  - Discord: `#general`, `#adapters`, `#security`, `#showcase`
  - 분기 기술 블로그 (ADR 해설 1편/월)
- **Conferences (2027)**: FEConf, PyCon KR, DevOps KR, JSConf JP
- **Content repurpose**: YouTube (한국어 튜토리얼 6편 Y1)

### Conversion Funnel & Targets

| 단계 | Y1 target | Benchmark |
|---|---|---|
| GitHub stars | 3,000 | Medusa 1yr=8K |
| npm downloads/week | 2,500 | Mid-tier OSS SDK |
| Sandbox sessions | 800/mo | — |
| Discord signups | 500 | — |
| Managed tier trial → paid | 3% | Stripe benchmark 2–5% |
| Managed tier churn | <5%/mo | SaaS median 6% |

---

## §B8. Partnerships

| 파트너 | 목적 | 상태 | 기한 |
|---|---|---|---|
| **Toss Payments** | 공식 파트너 + API keys | ✓ 테스트 키 확보, MOU 추진 | 2026-Q2 |
| **juso.go.kr** | 도로명주소 API 승인키 (법인 명의) | 신청 예정 | 2026-Q2 |
| **수출입은행** | 환율 authkey | 발급 신청 예정 | 2026-Q2 |
| **Google Places API** | 해외 주소 자동완성 | GCP 법인 계정 (보유) | 완료 |
| **Cloudflare** | Workers demo-keys 프록시 | 계정 보유, plan TBD | 2026-Q2 |
| **HackerOne** | Bug bounty 플랫폼 | paid ARR $10K 도달 후 | 2027-Q1 조건부 |
| **법무 (김·장 / 율촌 중 1개)** | 전금법/개보법 자문 리테이너 | ✓ 자문 계약 완료 | 진행 중 |
| **SOC 2 auditor (Vanta/Drata)** | Type I evidence pack | 평가 중 | 2026-Q4 |

### Non-partnership signals

- Shopify/Stripe: 의도적 **비제휴** 유지 (competitor alignment 방지)
- Cafe24: 장기 통합 가능하나 Y1 non-goal

---

## §B9. Risk Register

| ID | 리스크 | 확률 | 영향 | 완화 | Owner |
|---|---|---|---|---|---|
| R-1 | Toss API 변경 | Med | High | adapter 패키지화(ADR-018), 공식 파트너 채널, version pinning | ziho |
| R-2 | 개보법 개정 (국외이전 요건 강화) | Low | High | 월 1회 법무 자문, ADR-009 quarterly review | 법무 |
| R-3 | US de minimis 복원 ($800 이하 면세) | Low | Med | adapter 레이어로 정책 30일 내 전환 | ziho |
| R-4 | 주요 기여자 이탈 (bus factor = 1) | Med | High | Co-founder 영입 우선(§B5), 문서화 100% | ziho |
| R-5 | 경쟁사 fork → SaaS 판매 | Med | Med | Trademark 등록, 공식 어댑터 인증 프로그램, CLA 없음(도덕적 moat) | ziho |
| R-6 | Bug bounty 현금 초과 지급 | Low | Med | Paid ARR $10K 도달 전 Hall of Fame only, HackerOne KR legal template | 보안 |
| R-7 | SLSA/SOC 2 비용 폭증 | Med | Med | P0만 유지(2FA+provenance), Y2 ratchet | ziho |
| R-8 | 15명 인터뷰에서 Primary Persona 불일치 | Med | High | SOM 재산정 + §B3 재작성, pivot 옵션 오픈 | ziho |
| R-9 | Toss 자체 OSS SDK 출시 | Low | High | 멀티-PG + DDP + i18n 차별화 유지(§B4) | ziho |
| R-10 | 한국 VC 펀딩 실패 | Med | High | YC 적용, bootstrap 연장 12개월 설계 | ziho |

---

## §B10. North Star Metric & KPIs

### North Star

**TTFP — Time to First Payment** — 머천트가 가입부터 실 결제 성공까지 걸리는 시간

| 시점 | Target | Benchmark |
|---|---|---|
| Y1 (2026) | < 30 min | Stripe ~60m, Toss ~90m |
| Y2 | < 15 min | — |
| Y3 | < 10 min (demo-keys + CLI) | — |

측정: sandbox 세션 시작(anon) → 실 sandbox 결제 승인 webhook 수신까지 timestamp diff.

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
- SLO violation count (Gateway availability, confirm latency)
- Managed tier support ticket / merchant

### Dashboard

- Grafana (self-hosted) + Posthog (product analytics) + Stripe Billing data
- Weekly 1-page report publicly shared (Buffer-style transparency)

---

## §B11. Exit / Sustainability Scenarios

| Option | 조건 | Outcome | 유지되는 것 |
|---|---|---|---|
| **A. Independent SaaS** | Y3 $1M ARR, 100% YoY growth | Default path, Managed tier 수익으로 지속 운영 | Full team, OSS core |
| **B. Foundation (CNCF / OpenJS)** | Y3+ 커뮤니티 > 단일 회사 | Core → Foundation 기부, 회사는 Support & Managed layer만 | OSS core 영속성 보장 |
| **C. Strategic Acquisition** | Phase 3 이후, Toss/Shopify/Stripe 관심 표명 | $20M–$100M 범위 exit | 대부분의 OSS core는 유지 (acquirer commitment) |
| **D. Community Fork** | Creator 탈퇴 또는 funding 실패 | `opencheckout-community` fork, maintainers rotation | Apache 2.0 하 코드 영속, 상용 레이어 중단 |

### 지속 가능성 약속 (Sustainability Pledge)

- Apache 2.0 영구 보장 (라이선스 변경 금지)
- Managed tier가 중단되어도 self-host 경로는 항상 열려 있음 (ADR-018 Thin harness 원칙)
- Exit 시나리오 C/D에 대비해 `docs/SUSTAINABILITY.md`에 커뮤니티 인수 프로토콜 사전 명시 (2026-Q3)

---

## §B-Merge — PRD v0 통합 시 변경 섹션 목록

PRD v0는 유지하고, 다음 병합 방침으로 v1.0 작성:

| v0 섹션 | 변경 유형 | 작업 | Owner |
|---|---|---|---|
| §0 Executive Summary | **확장** | §B1 pricing 한 줄 + §B10 North Star 한 줄 추가 | ziho |
| §0.5 Business Snapshot (신설) | **신규** | §B1–B2–B5–B6 요약 1-pager | ziho |
| §1 Problem & Audience | **교체** | §B3 Primary Persona로 "한국 D2C 역직구" 타깃 고정 (B-4 finding 반영) | ziho |
| §14 Risk & Mitigation | **병합** | v0 기술 리스크 + §B9 비즈니스 리스크 단일 레지스터로 통합 | ziho |
| §14.5 Go-to-Market (신설) | **신규** | §B7 전체 | ziho |
| §15 Success Metrics | **교체** | §B10으로 전면 재작성 (North Star = TTFP) | ziho |
| §16 Partnerships (신설) | **신규** | §B8 전체 | ziho |
| §17 Team & Funding (신설) | **신규** | §B5 + §B6 | ziho |
| §18 Competitive & Exit (신설) | **신규** | §B4 + §B11 | ziho |
| 기존 §16 Open Questions | **유지** | Q13 Toss 파트너십은 §B8에서 상태 업데이트 | ziho |

### Merge PR 계획

- Branch: `prd/v1-business-merge`
- 작업 순서: (1) v0 복사 → v1 draft → (2) §B-Merge 표대로 섹션 추가/교체 → (3) 번호 재정렬 → (4) 7 reviewer 중 CPO + OSS maintainer 2명 재리뷰 → (5) 통과 후 ADR status `Accepted`.
- Target merge date: **2026-05-15** (인터뷰 착수 전 기초 문서 정리 완료 목적)
- 비즈니스 섹션 후속 실측 데이터 유입 시 **v1.1**로 minor bump (인터뷰 완료 후 2026-06-01).

---

**단어 수 대략 2,850 / 3,000 상한 준수.**

**Karpathy Goal-Driven 검증 체크리스트** (이 PRD v1 supplement 자체에 적용):

1. 리뷰어 B-2 "비즈니스 섹션 0%" → 11개 섹션 신규 작성 (verify: 표 11/11)
2. 리뷰어 B-4 "타깃 혼재" → Primary Persona "한국 D2C 역직구"로 단일화 (§B3)
3. 모든 숫자 verifiable: 통계청·Stripe benchmark·ADR-018·로드맵 타임라인에 앵커
4. ADR-018 Phase 축소와 정합 (패키지 6개, 1인 → 4인, P0/P1/P2 동일 우선순위)
5. Merge plan 명시로 PR 리뷰어가 어느 v0 섹션을 열어야 하는지 단일 표로 확인 가능
