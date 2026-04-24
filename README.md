# OpenCheckout

오픈소스 체크아웃 SDK — 한국 셀러의 한국+글로벌 역직구용. Shop Pay 수준의 가속 체크아웃 경험을 OSS로.

- **License**: Apache 2.0
- **Status**: Pre-release (PRD v0, 17 ADR, 2 TDD)
- **Maintainer**: [Ziho Shin (@today-zh-learned)](https://github.com/today-zh-learned) · ziho.shin@gmail.com
- **Repo**: https://github.com/today-zh-learned/opencheckout (Phase 1 공개 예정)
- **Related**: [claude101](https://github.com/today-zh-learned/claude101), [clawcrew](https://github.com/today-zh-learned/clawcrew), [cc-path](https://github.com/today-zh-learned/cc-path)

## 설치

```bash
npm install @opencheckout/widget-vanilla
```

3줄 시작 (테스트 키 제공):

```ts
import { OpenCheckout } from "@opencheckout/widget-vanilla";
OpenCheckout.mount("#checkout", { publicKey: "test_ck_..." });
```

## 문서

- **시작하기**: https://docs.opencheckout.dev (Phase 1 이후)
- **API Reference**: `spec/openapi.yaml`
- **PRD**: `prd/PRD-v0.md`
- **ADR 인덱스**: `docs/adr/README.md` (18개)
- **TDD**: `docs/tdd/` (Gateway, Event Sourcing)

## 핵심 결정

- 위젯 = TS + Web Components + Preact (25KB gzipped)
- Gateway = Hono (Node primary, Edge secondary)
- DB = PostgreSQL + outbox + LISTEN/NOTIFY
- 테스트 = Vitest(Small/Medium/Large) + Playwright + axe-core
- 문서 = Docusaurus + OpenAPI renderer
- 파이프라인 = [gstack](https://github.com/garrytan/gstack) (`/office-hours → /ship`)

## 운영 원칙

### Beyoncé Rule
> *"If you liked it, you should have put a test on it."*
>
> 테스트로 잠겨있지 않은 동작은 **공식 계약이 아닙니다**. 테스트 없는 동작에 의존하여 breakage가 발생해도 breaking change로 간주하지 않습니다. 의존해야 하는 동작은 반드시 테스트를 추가하여 공식화하세요.

### Karpathy 4원칙 (모든 PR 적용)

1. **Think Before Coding** — 가정 명시, 트레이드오프 표출
2. **Simplicity First** — 최소 코드, 투기적 추상 금지
3. **Surgical Changes** — 요청된 것만 변경
4. **Goal-Driven** — verifiable success criteria

### 리뷰 표준
Google Engineering Practices를 그대로 채택합니다:
https://google.github.io/eng-practices/

## 기여

- 이슈·PR 전 `CONTRIBUTING.md` 필독
- 모든 PR은 `.github/PULL_REQUEST_TEMPLATE.md` 체크리스트 준수
- 코드 리뷰 SLA: **메인테이너 응답 3영업일 이내**

## 보안

- 취약점 제보: `SECURITY.md`
- Responsible disclosure + CVE 발행 프로세스
- Bug Bounty: Hall of Fame + swag (paid ARR $X 이후 cash 전환)

## 라이선스

Apache 2.0 — `LICENSE` 파일 참조.
