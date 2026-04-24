# BigTech Engineering Practices + gstack/gbrain — Adoption Research

source: 4 researcher agents (Google/Meta/Anthropic/OpenAI) + Karpathy skill + Gary Tan's gstack/gbrain, 2026-04-24

## 요약

4개 리서치 + Karpathy 원칙 + gstack/gbrain 통합 결과를 ADR-018로 공식화. 본 문서는 각 리서치의 핵심 권고 bullet 요약.

## Karpathy 4원칙 (기준선)

1. **Think Before Coding** — 가정을 명시, 혼란을 숨기지 않음, 트레이드오프 표출
2. **Simplicity First** — 최소 코드, 투기적 추상 금지, 200줄을 50줄로 줄일 수 있으면 다시 쓴다
3. **Surgical Changes** — 요청된 것만, 인접 코드 "개선" 금지, 스타일 맞춤
4. **Goal-Driven Execution** — verifiable success criteria, "make it work" 금지

## gstack (Gary Tan) — 개발 파이프라인 철학

- "Vibe coding → Rigorous process"
- 23 roles + 8 power tools, MIT
- 파이프라인: `office-hours → plan-ceo → plan-eng → implement → review → qa → ship → retro`
- `/review` (Claude) + `/codex` (OpenAI) 이중 독립 검증
- Real browser testing, Design taste learning, Parallel sprints
- 입증: 50일 10K LOC/주, 3개 프로덕션 서비스, 40+ 기능 60일

## gbrain (Gary Tan) — 에이전트 메모리 철학

- *"Thin harness, fat skills"* — 지능은 markdown, 런타임은 결정론적 TS 최소
- Markdown SSOT + PGLite/Postgres + 자동 지식 그래프
- Hybrid retrieval: vector + keyword + graph, 95% recall
- 26 skills, 19 cron jobs, 17,888 pages + 4,383 people + 723 companies

## Google — 채택 Top 7

1. **Engineering Practices 전문 채택** (https://google.github.io/eng-practices/) — free battle-tested
2. **AIP (API Improvement Proposals)** — AIP-121/132/134/158/193 + `api-linter` CI
3. **Small/Medium/Large 테스트 분류** — Vitest tag, CI 분기 실행
4. **Beyoncé Rule** — "테스트 없으면 behavior 깨져도 OK" 정책
5. **eval harness minimal** — HS code/i18n 고정 데이터셋 + 결정적 grader
6. **Design Doc vs ADR 분리** — ADR=결정 1p, TDD=설계 5-15p
7. **OpenTelemetry** — 이미 채택

## Google — 거절 Top 5

1. **Bazel/Blaze** — Turborepo로 충분
2. **Readability certification** — 언어 council 필요
3. **Kythe** — 팀 해체 시그널
4. **SpiceDB** — 멀티 테넌트 ReBAC 니즈 생길 때
5. **Rosie mass-change infra** — 수동 codemod로 족함

## Meta — 채택 Top 7

1. **StyleX 위젯 styling** — 빌드타임 atomic CSS, 0kB 런타임
2. **SEV-review + blameless post-incident** — 릴리스 노트에 회귀 시 명시
3. **Generator-Evaluator eval-set discipline** — 고정 eval set, 큰 모델 evaluator
4. **PR "Test Plan" 섹션** — Phabricator 관행, 비용 0
5. **Lexical plugin 아키텍처** — 결제 step pluggable
6. **Schema-generated fixtures** — Zod → fixture 자동
7. **Feature-flag adapter + PlanOut namespace model**

## Meta — 거절 Top 5

1. **Sapling as required VCS** — OSS 미지원
2. **Buck2** — Turborepo 충분
3. **Self-host Phorge** — 기여자 audience 분산
4. **FBInfer for TS** — 안정 TS 지원 미흡
5. **Scribe/ODS/Scuba** — PB-scale 가정

## Anthropic — 채택 Top 7

1. **Skill 패턴 (plug-and-play adapter)** — 어댑터 별도 npm + markdown manifest
2. **MCP server 제공** (v1.1) — `@opencheckout/mcp-server` 별도 패키지
3. **Red-team eval harness** — `evals/security/*` 릴리스 블로커
4. **Hook 시스템** — `onBeforeCharge`, `onAfterCapture`, `onRefundRequested`
5. **Artifacts 스타일 iframe** — Order Tracking 서명 iframe URL
6. **Evidence-tier 검증** — static/unit/integration/E2E 최소 tier 명시
7. **Error catalog structured codes** — 점표기 + retryable + i18n key

## Anthropic — 거절 Top 5

1. **자체 ML fraud detection** — PSP/Sift 위임
2. **코어에 모든 PSP 번들** — Skill 패턴 정면 충돌
3. **Prompt caching** — OpenCheckout LLM 없음
4. **Multi-agent orchestration을 SDK에** — 관리자 툴
5. **"Secure by default" 과대 마케팅** — Security Model Card 명시

## OpenAI — 채택 Top 7

1. **OpenAPI → Function Calling / MCP 자동 export** — 빌드 타임
2. **Structured Outputs 패턴 for 에러 카탈로그** — JSON Schema strict
3. **`openai/evals` YAML 시나리오 포맷 차용** (러너는 자체)
4. **Cookbook 스타일 `examples/`** — 실행 가능
5. **Assistants→Responses 전환 교훈 for 버저닝** — 12개월 overlap + codemod
6. **stainless-generated Pydantic v2 Python SDK** — stripe-python 수제 지양
7. **feature flag + "gradual rollout + evals + human review" 3단 체크**

## OpenAI — 거절 Top 5

1. **Swarm multi-agent 운영 콘솔** — 과대 스코프
2. **Realtime API (WebRTC)** — SSE로 충분
3. **Weave/Phoenix LLM observability** — OTel 표준 족함
4. **OpenAI Playground 복제 샌드박스** — Stripe 스타일이 체크아웃에 적합
5. **Codex-specific 런타임 통합** — 도메인 외

## 통합 우선순위 (ADR-018 채택 Top 10)

**P0** (즉시, 1주 내, 비용 XS/S):
1. Google eng-practices 링크 (CONTRIBUTING.md)
2. Google AIP + api-linter CI
3. Google Small/Medium/Large 테스트 분류
4. Meta Test Plan PR 섹션
5. Beyoncé Rule 정책
6. Karpathy 4원칙 PR 체크리스트

**P1** (Phase 1 중):
7. Anthropic MCP server (`@opencheckout/mcp-server`, v1.1)
8. OpenAPI → function calling / MCP 자동 export
9. Meta StyleX 위젯 styling
10. OpenAI Evals YAML 시나리오 포맷

## 통합 거절 (과대 스코프 방지)

Bazel, Buck2, Sapling, Kythe, FBInfer, Phorge self-host, SpiceDB, Swarm, Realtime API, LLM observability, 자체 ML fraud detection, 코어 PSP 번들, Vue/Svelte 래퍼 유지, Python/Go/Java SDK 자체 유지(커뮤니티 인증 프로그램으로 이관)

## 전체 검증 지표 (ADR-018 §8)

1. 과대 스코프 해소: Phase 1 패키지 14→6
2. 1인 메인테이너 현실성: gstack 파이프라인 입증 (50일 10K LOC)
3. 기여자 진입장벽: Vitest Small tier CI 3분 내
4. BigTech 차별화: MCP server + function-calling export 자동
5. 어댑터 monorepo 부하: core LOC 변화 0 (신규 어댑터 추가 시)

## References

- gstack: https://github.com/garrytan/gstack
- gbrain: https://github.com/garrytan/gbrain
- Karpathy: https://x.com/karpathy/status/2015883857489522876
- Google eng: https://google.github.io/eng-practices/
- Google AIP: https://google.aip.dev/
- Meta StyleX: https://engineering.fb.com/2025/11/11/web/stylex-a-styling-library-for-css-at-scale/
- Anthropic MCP: https://modelcontextprotocol.io/
- OpenAI Evals: https://github.com/openai/evals
