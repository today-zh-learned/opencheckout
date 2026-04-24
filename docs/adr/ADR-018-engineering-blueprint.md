# ADR-018: Engineering Blueprint — gstack/gbrain + BigTech 프랙티스 선별 도입

- **Status**: Accepted
- **Date**: 2026-04-23
- **Deciders**: ziho (maintainer)
- **Supersedes**: 없음 (기존 17 ADR의 운영 모델을 통합하는 메타 ADR)
- **Related**: 모든 ADR, `research/07-fe-be-stack.md`, `research/09-external-review.md`
- **Guiding principles**: Karpathy 4원칙 (Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution)

## 1. Context

외부 리뷰 7명 전원이 "과대 스코프 / 1인 메인테이너 비현실적"으로 Block 판정. 본 ADR은 BigTech(Google/Meta/Anthropic/OpenAI) 프랙티스와 gstack/gbrain(Gary Tan) 철학을 **스코프를 줄이는 방향으로만** 선별 도입하여 지속가능한 개발 운영 모델을 확립한다.

**핵심 철학 (Karpathy + gbrain)**:
- *"Thin harness, fat skills"* — 지능은 markdown ADR/skill에, 런타임은 결정론적 TS 최소화
- *"Minimum code that solves the problem"* — 200줄 → 50줄로 줄일 수 있으면 다시 쓴다
- *"Every changed line traces to the requirement"* — 요구사항 ↔ 증거 매트릭스

## 2. Decision

### 2-1. 개발 파이프라인 — gstack workflow 채택

모든 변경은 다음 파이프라인을 거친다 (skill 호출):

```
/office-hours        → 요구사항 심문 (6 forcing questions)
/plan-ceo-review     → 전략 스코프 (Expansion↔Reduction 4 modes)
/plan-eng-review     → 아키텍처 확정, 데이터 흐름, edge case, 테스트
/plan-design-review  → UI 차원 점수 (위젯 변경 시만)
[implement]          → executor
/review              → Claude 프로덕션 버그 감지
/codex               → OpenAI 독립 교차 검증
/qa                  → 실 브라우저 E2E 회귀 테스트
/ship                → PR 생성 + 테스트 부트스트랩
/retro               → 주간 회고
```

**근거**: gstack이 50일간 10K LOC/주 생산성 입증. `/review`+`/codex` 이중 독립 검증이 XSS 같은 미묘한 결함을 잡은 사례 공개.

**이번 ADR 자체가 이 파이프라인을 따른다**: 외부 리뷰(`/review` equiv) → 본 ADR(architecture lock) → 다음 단계 /codex 교차 검증 대기.

### 2-2. Thin Harness, Fat Skills 원칙 — 어댑터 분리

**문제**: 외부 리뷰에서 지적된 과대 스코프의 근본 원인은 **PSP/캐리어 어댑터가 core monorepo에 포함**되어 있다는 것.

**결정**: gbrain + Claude Code Skill 시스템 패턴을 따라 **어댑터를 외부 패키지로 분리**:

```
@opencheckout/core          ← 얇은 primitive 5개 (createSession/confirm/refund/getStatus/cancel)
@opencheckout/adapter-toss  ← markdown manifest + TS handler
@opencheckout/adapter-cj    ← 한국 택배
@opencheckout/adapter-ems   ← 글로벌 폴백
@opencheckout/adapter-dhl   ← 글로벌 express
```

각 어댑터는 `manifest.md` + `index.ts`의 2-file 구조. 머천트가 `npm i @opencheckout/adapter-toss` → core가 manifest로 자동 등록.

**효과**: 코어 PR이 어댑터 추가마다 부풀지 않음. 한국 PSP 미사용 글로벌 머천트는 deps 최소.

### 2-3. BigTech 채택 Top 10 (우선순위 순)

**P0 (즉시 도입, 비용 XS/S)**

1. **Google Engineering Practices 전문 채택** — `CONTRIBUTING.md`에 `https://google.github.io/eng-practices/` 링크. 자체 리뷰 가이드 작성 금지. [2시간]

2. **Google AIP (API Improvement Proposals)** — AIP-121/132/134/158/193 적용, `api-linter` CI. 모든 HTTP 엔드포인트 자동 검증. [1-2일]

3. **Google Small/Medium/Large 테스트 분류** — Vitest tag. Small=순수로직, Medium=mock PSP, Large=실 sandbox. CI가 PR에는 Small, nightly Medium, pre-release Large. [1일]

4. **Meta "Test Plan" PR 템플릿** — Phabricator 관행. `.github/pull_request_template.md`에 한 섹션 추가. [30분]

5. **Beyoncé Rule** — "테스트로 잠그지 않은 동작은 부서져도 책임 없음" 정책. README 한 줄. [15분]

6. **Karpathy 4원칙 PR 체크리스트** — Think/Simplicity/Surgical/Goal 4개 체크박스를 PR 템플릿에 추가. [15분]

**P1 (Phase 1 중 도입)**

7. **Anthropic MCP Server** — `@opencheckout/mcp-server` 별도 패키지 (v1.1). Resources(주문/환불 조회) + Tools(환불은 human-in-loop) + Prompts(CS 템플릿). **"AI-ready commerce API" 차별화 포인트**. 한국 PG 중 아직 MCP 제공 안 함 → 1등 포지션. [1주]

8. **OpenAPI → OpenAI Function Calling / Anthropic Tool Use 자동 export** — 빌드 타임 `dist/function-calling/tools.json`, `dist/mcp-server/` 동시 생성. 단일 SSOT. [3일]

9. **Meta StyleX (위젯 styling)** — 빌드타임 atomic CSS, 런타임 0kB, host 페이지 CSS 충돌 차단. Tailwind보다 체크아웃 iframe에 적합. [3-5일]

10. **OpenAI Evals YAML 포맷 차용** (러너 아님) — `evals/scenarios/*.yaml` 시나리오 기반 E2E 재구성. `openai/evals` 런타임 도입 금지. [2일]

**P2 (Phase 2+, 필요 시)**

- Google gVisor (self-host Gateway 샌드박싱) — 머천트 untrusted 코드 실행 니즈 생길 때
- Meta Lexical plugin 패턴 (결제 step을 플러그인화) — 3+ PSP 동시 확장 니즈 생길 때
- Google SpiceDB (Zanzibar) — 멀티 테넌트 marketplace 등장 시

### 2-4. BigTech 거절 Top 10 (과대 스코프 방지)

1. **Google Bazel / Meta Buck2** — Turborepo로 충분. Bazel 설정 비용 >> 이득
2. **Meta Sapling as required VCS** — OSS 미지원, 기여자 진입 차단
3. **Google Kythe** — 팀 해체 시그널, LSP로 족함
4. **Google Readability certification** — 언어 council 필요, 1인 불가. Biome + tsc strict로 대체
5. **Meta FBInfer / Flow** — TS 안정 지원 미흡
6. **Meta Phorge self-host** — 기여자 audience 분산
7. **OpenAI Swarm multi-agent orchestration** — SDK 스코프 외 (운영 콘솔용)
8. **OpenAI Realtime API (WebRTC)** — SSE로 충분
9. **Weave/Phoenix LLM observability** — OTel 표준으로 족함
10. **자체 ML fraud detection** — PSP/Sift에 위임, PRD Non-Goals에 명시

### 2-5. gbrain 패턴 — OpenCheckout Knowledge Base

gbrain의 "markdown + PGLite + 지식 그래프" 패턴을 머천트 측 데이터 관리에 참조:

- **머천트 주소록** (ADR-005 §10): gbrain처럼 markdown SSOT + 선택적 PGLite 로컬 저장 옵션 제공
- **OpenCheckout 자체 문서**: `docs/` + `research/` + ADR은 이미 markdown SSOT. gbrain의 "thin harness, fat skills" 철학과 정합
- **i18n 번역 메모리**: gbrain의 entity extraction 아이디어를 차용해 반복되는 결제 용어를 자동 추출·일관성 검증

**금지**: gbrain의 PGLite + cron jobs 전체 스택을 그대로 도입하지 않음. **철학만 차용**, 구현은 최소.

### 2-6. Eval 프레임워크 (Anthropic + OpenAI 통합)

```
evals/
├── scenarios/              # YAML 선언적 시나리오 (OpenAI Evals 포맷 차용)
│   ├── checkout-happy-path.yaml
│   ├── refund-saga.yaml
│   ├── webhook-race.yaml
│   └── security-red-team/  # ADR-017 red-team 매핑
├── datasets/               # JSONL 고정 eval set (Anthropic 관행: generator 미노출)
│   ├── addresses-15countries.jsonl
│   ├── tax-ids.jsonl
│   └── hs-codes.jsonl
├── graders/                # 결정적 채점자 (TS, pytest)
│   ├── schema_equal.ts
│   ├── status_sequence.ts
│   └── error_code_match.ts
└── run.ts                  # 자체 러너 (openai/evals 런타임 미도입)
```

**게이트**: CI에서 100% 통과 = 릴리스 블로커. 새 공격 시나리오는 CVE급 이슈 발생 시 반드시 추가 후 릴리스.

## 3. Consequences

### 긍정
- **gstack 파이프라인** 도입으로 "구현 먼저 + 리뷰 나중" 안티패턴 차단. 외부 리뷰의 "과대 스코프" 문제는 `/plan-ceo-review`가 `Reduction mode`에서 잡는다
- **Thin harness, fat skills**로 어댑터 별도 패키지화 → core LOC 감소, 메인테이너 부담 감소
- MCP server + OpenAPI 자동 export로 **"AI-ready commerce API" 차별화 포인트** 획득
- Google AIP + Small/Medium/Large 테스트 분류로 $0 품질 기준선 확보
- Karpathy PR 체크리스트가 설계 회귀 자동 방지
- Beyoncé Rule로 hidden behavior 의존 차단

### 부정
- gstack 파이프라인 학습 곡선 (신규 기여자에게 진입장벽)
- 어댑터 분리 시 초기 버전 관리 복잡도 증가 (어댑터 vs core 버전 매트릭스)
- StyleX는 상대적 신기술, 기여자 익숙함 부족
- YAML eval 시나리오 유지보수 비용 (초기)

### 중립
- Vue/Svelte 래퍼 드롭, vanilla + React만 유지 (OSS 리뷰어 권고와 정합)
- SDK 언어 TS only, Python은 커뮤니티 인증 프로그램으로 이관

## 4. Implementation Checklist

### Phase 0 (즉시, 1주 내)
- [ ] `CONTRIBUTING.md` Google eng-practices 링크 + Test Plan 섹션 + Karpathy 4원칙 체크리스트
- [ ] `.github/pull_request_template.md` 완성
- [ ] README에 Beyoncé Rule 한 줄
- [ ] `docs/adr/README.md`에 gstack 파이프라인 (`/office-hours → /ship`) 명시

### Phase 1 초 (3개월 내)
- [ ] `api-linter` CI 통합, AIP-121/132/134 준수
- [ ] Vitest Small/Medium/Large tag + CI 분기 실행
- [ ] 어댑터 분리: `@opencheckout/adapter-toss`, `@opencheckout/adapter-cj`, `@opencheckout/adapter-ems` 3개만 초기
- [ ] `evals/` 디렉토리 + 5개 시나리오 YAML 시드 + 결정적 grader 3종
- [ ] StyleX 프로토타입 (widget 단일 컴포넌트)

### Phase 1.5 (6개월 내)
- [ ] `@opencheckout/mcp-server` 별도 패키지 릴리스
- [ ] OpenAPI → function-calling/mcp 자동 export 빌드 스크립트
- [ ] Generator-Evaluator eval 사이클 (i18n 번역 품질)

### Phase 2+ (이후, 트리거 조건 충족 시)
- [ ] gVisor Gateway 샌드박싱 (untrusted merchant code 니즈 시)
- [ ] Lexical 플러그인 패턴 (3+ PSP 확장 시)

## 5. Anti-Patterns (거절 이유 명시)

위 §2-4 거절 Top 10은 모두 "과대 스코프 방지" 목적. 이 결정을 재논의하려면 **새 ADR로 제안 + 외부 리뷰 의견** 필수. 현재 결정을 이 ADR에 고정함으로써 relitigate 방지.

## 6. Open Questions

1. gstack 파이프라인을 어디까지 OSS 기여자에게 강제? 내부 유지보수는 전면 적용, 외부 기여자는 `/review` + `/qa`만 권장?
2. MCP server의 Rate limit + abuse 방어 (Cloudflare Turnstile vs 자체)?
3. 어댑터 분리 시 breaking change 전파 정책 — ADR-011 버저닝과 어떻게 동조?
4. StyleX의 번들 크기 예산 25KB 가정이 실측 가능?
5. Generator-Evaluator에 어떤 모델 쌍을 기본 권고 (Claude Opus + Sonnet, GPT-5 + GPT-5-mini)?

## 7. References

- **gstack**: https://github.com/garrytan/gstack — 23 roles + 8 power tools, MIT
- **gbrain**: https://github.com/garrytan/gbrain — markdown + PGLite + 지식 그래프
- **Karpathy guidelines**: `~/.claude/plugins/cache/karpathy-skills/...`
- **Google**: https://google.github.io/eng-practices/, https://google.aip.dev/
- **Meta**: engineering.fb.com StyleX/Sapling/Stable Infra
- **Anthropic**: MCP spec, Claude Code harness
- **OpenAI**: openai/evals, Responses API, Cookbook
- **`research/09-external-review.md`** — 7명 전원 Block 판정의 근거
- **내부 참조**: `~/.claude/projects/.../memory/feedback_harness_design.md` (Generator/Evaluator 분리, 5+ 반복)

## 8. 이 ADR의 goal-driven 검증

Karpathy §4 Goal-Driven: 본 ADR이 해결했다고 주장하는 것:

```
1. "과대 스코프" 비판       → verify: Phase 1 패키지 수 14→6 감소
2. "1인 메인테이너 불가"   → verify: gstack 파이프라인 50일 10K LOC 입증
3. "기여자 진입장벽"        → verify: 4개 공용 데모 키 + Thin adapter + Vitest Small tier CI 3분 내
4. "BigTech 차별화"         → verify: MCP server + OpenAPI function-calling export 자동
5. "어댑터 monorepo 부하"  → verify: core LOC 측정, 신규 어댑터 추가 시 core LOC 변화 0
```

**이 5개 지표를 Phase 1 출시 조건으로 잠금**. 미달성 시 출시 연기.
