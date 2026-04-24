# Description

&lt;!-- 이 PR이 무엇을 하는지 간결히 --&gt;

## Motivation

&lt;!-- 왜 이 변경이 필요한가. 관련 이슈 링크 --&gt;

Closes #

## Test Plan

- [ ] 추가/수정한 테스트: ...
- [ ] 수행한 수동 검증: ...
- [ ] 의도적으로 제외한 엣지 케이스 (근거 포함): ...

## Karpathy 4원칙 체크

- [ ] **Think Before Coding** — 가정을 명시했고, 여러 해석 가능 시 제시함
- [ ] **Simplicity First** — 요청 이상 구현 없음, 200→50줄 리팩토링 검토 완료
- [ ] **Surgical Changes** — 인접 코드 "개선" 없음, 스타일 일치
- [ ] **Goal-Driven** — 검증 가능한 success criteria 명시

## ADR/PRD 연계

- [ ] 관련 ADR: ADR-&lt;NNN&gt;
- [ ] PRD 섹션: §&lt;X&gt;
- [ ] 새로 ADR 필요 여부: (Y/N, Y이면 별도 PR)

## Test Size 분류

- [ ] `@small` (단일 프로세스, hermetic, <1s) — 필수
- [ ] `@medium` (Testcontainers, mock PSP) — 해당 시
- [ ] `@large` (실 sandbox) — 해당 시

## 스코프 체크 (Overbuild Protection)

- [ ] 어댑터(PSP/캐리어) 추가 시 — 이는 core 변경이 아닌 **별도 패키지** 변경인가?
- [ ] 코어에 새 기능 추가 시 — 20% 미만 머천트만 쓰는 기능이면 별도 패키지로 분리했는가?
- [ ] "미래 확장성" 추상화를 제거했는가? (YAGNI)
- [ ] 본 PR이 해결하는 단일 문제를 한 문장으로: ...

## Breaking Change

- [ ] Breaking 없음
- [ ] Breaking 있음 — `BREAKING CHANGE:` 섹션 아래 migration guide 첨부

## Beyoncé Rule

- [ ] 본 PR이 변경하는 동작 중 테스트로 잠겨있지 않은 것은 없다.
- [ ] 잠겨있지 않은 인접 동작은 **공식 계약 아님** (breakage 발생해도 책임 없음)

## DCO

- [ ] 모든 commit이 `Signed-off-by` 포함 (`git commit -s`)

## 체크리스트 완료 후 자동 실행

CI가 수행:
- `biome check` / `tsc --strict` / `pnpm test:small`
- `oasdiff` breaking API 감지
- `api-linter` (Google AIP 준수)
- 보안 스캔 (Semgrep, CodeQL, gitleaks)
- 의존성 스캔 (Dependabot + Socket.dev)

## Reviewers

- @maintainer (SLA: 3영업일)
- Security-sensitive PR은 추가로 @security-reviewer
