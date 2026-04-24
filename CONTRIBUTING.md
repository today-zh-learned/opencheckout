# Contributing to OpenCheckout

환영합니다. 본 프로젝트는 **Google Engineering Practices**를 그대로 채택합니다. 별도 자체 가이드 대신 아래 링크를 따르세요.

## 리뷰 가이드 (필독)

- **Code Reviewer's Guide**: https://google.github.io/eng-practices/review/reviewer/
- **Code Author's Guide**: https://google.github.io/eng-practices/review/developer/

## 기본 룰

### 1. Small PRs
- 기본 목표: **400 LOC 미만** (diff 기준, 테스트 제외)
- 큰 변경은 여러 PR로 분할 (stacked PR 또는 feature flag 뒤 점진 도입)

### 2. Karpathy 4원칙
모든 PR은 [Karpathy Guidelines](https://x.com/karpathy/status/2015883857489522876) 준수:

- **Think Before Coding** — 가정을 명시, 불확실하면 질문. 여러 해석이 가능하면 선택하지 말고 제시.
- **Simplicity First** — 요청 이상 구현 금지. 200줄로 50줄 해결 가능하면 다시 쓴다.
- **Surgical Changes** — 건드린 것만 정리. 인접 코드 "개선" 금지.
- **Goal-Driven** — "make it work" 금지. 검증 가능한 success criteria로 번역.

### 3. Test Plan (Phabricator 관행)
모든 PR description에 **Test Plan** 섹션 필수:
```
## Test Plan
- [ ] 어떤 테스트를 추가/수정했는가
- [ ] 어떤 수동 검증을 수행했는가
- [ ] 어떤 엣지 케이스를 의도적으로 제외했는가 (근거 포함)
```

### 4. Beyoncé Rule
> "If you liked it, you should have put a test on it."

테스트로 잠기지 않은 동작은 공식 계약이 아닙니다. 의존하려면 테스트를 추가하세요.

### 5. Test Size 분류 (Google)
모든 테스트는 Vitest tag로 분류:

```ts
describe.concurrent("price calculation", { tags: ["@small"] }, ...);
describe("toss adapter", { tags: ["@medium"] }, ...);
describe("full checkout flow", { tags: ["@large"] }, ...);
```

- **@small** — 단일 프로세스, hermetic, <1s. PR마다 전체 실행.
- **@medium** — 단일 머신(Testcontainers, mock PSP). Nightly 전체, PR은 변경 관련만.
- **@large** — 실 sandbox(Toss, DHL, EMS). Pre-release만.

## gstack 파이프라인

비자명 변경은 다음 순서 권장:

```
/office-hours        요구사항 6개 질문 심문
/plan-ceo-review     스코프 (Expansion↔Reduction)
/plan-eng-review     아키텍처 확정
[implement]
/review              Claude 프로덕션 버그 감지
/codex               OpenAI 독립 교차 검증
/qa                  실 브라우저 E2E
/ship                PR 생성
```

(gstack 미설치 기여자는 메뉴얼 PR 템플릿 체크리스트만 준수하면 충분)

## Signing & Licensing

- **DCO**: 모든 commit에 `Signed-off-by` 필수 (`git commit -s`)
- **기업 기여자**: Corporate CLA (EasyCLA) 별도 서명 — 내부 법무 승인 이후 PR 안정
- **License**: Apache 2.0

## 지원 언어 / SDK

- **Core (v1)**: TypeScript만
- Python/Go/Java: **커뮤니티 인증 프로그램** (외부 레포 + 월간 호환성 체크)

## 어댑터 기여

어댑터는 **별도 npm 패키지**:
- `@opencheckout/adapter-<psp>` — 결제 (toss/kakaopay/...)
- `@opencheckout/adapter-carrier-<code>` — 배송 (cj/ems/dhl/...)

각 어댑터 = `manifest.md` + `index.ts` 2-file. 템플릿: `packages/adapter-template/`.

## 보안 이슈

공개 Issue 금지. `SECURITY.md` 참조 (responsible disclosure + CVE).

## 번역·i18n

- 원본 로케일: **한국어**
- Phase 1 지원: ko + en
- Phase 2: ja 추가 (네이티브 reviewer 섭외 후)

## 이슈 라벨

- `good first issue` — 단일 파일·단일 함수 변경
- `help wanted` — 중간 복잡도, 가이드 필요
- `i18n:ko/en/ja` — 번역/국제화
- `adapter:carrier-*`, `adapter:psp-*`

## 질문

- Discord: (Phase 1 이후 공개)
- Discussions: https://github.com/today-zh-learned/opencheckout/discussions (Phase 1 이후)
- Email: ziho.shin@gmail.com
- Maintainer: [@today-zh-learned](https://github.com/today-zh-learned)
