# OpenCheckout

한국 셀러의 국내·글로벌 판매에 쓰는 오픈소스 **체크아웃 위젯**입니다.
**주소·배송·결제·약관** 4개 위젯을 머천트 페이지 4곳에 끼우면 끝납니다.
역직구 체크아웃 연동을 18줄 안에서, 15분 이내에 마칩니다.

- **License**: Apache 2.0
- **Bundle**: ~21 KB gzipped (25 KB 예산 내), 111 small tests, Preact 런타임 단일 공유
- **Address coverage**: 15개국 스키마 · KR 시/도 17개 + 시/군/구 250+ cascading · 한글 초성 검색 · 우편번호 정규식 검증
- **Status**: Pre-release (PRD v1, 19 ADR, 2 TDD)
- **Maintainer**: [Ziho Shin (@today-zh-learned)](https://github.com/today-zh-learned) · ziho.shin@gmail.com
- **Repo**: https://github.com/today-zh-learned/opencheckout
- **Sandbox**: https://today-zh-learned.github.io/opencheckout/sandbox.html (키 없이 즉시 체험)

## 설계 철학

SDK 원시 요소를 머천트가 조립해 쓰는 방식이 아니라, **네 개의 마운트 타깃에 위젯을
끼우면 끝나는 방식**을 채택했습니다. 결제 UX에 그치지 않고 역직구 체크아웃에서
가장 비용이 큰 주소 · 배송 · 약관 영역까지 위젯이 책임지므로, 머천트는 세션·금액·
국가·약관 상태를 직접 관리할 필요가 없습니다.

| | SDK 조립 모델 | **OpenCheckout (위젯-우선)** |
|---|---|---|
| 머천트가 작성하는 UI | 결제수단 선택 UI, 약관, 주소 폼, 배송 옵션 전부 | **없음** — 위젯이 a11y · 모바일 레이아웃 · i18n · 에러 UI 포함 제공 |
| 머천트 코드량 | 수백 줄 | 약 18줄 (HTML + JS) |
| 내부 오케스트레이션 | 머천트가 port/adapter DI | **숨김** — `widgets` 객체가 세션·금액·국가·약관 정책 일체 관리 |
| 커스터마이징 | v1부터 headless | v1.1에서 테마 토큰 + slot |

## 설치

v0 빌드는 GitHub Pages 샌드박스에서 즉시 확인 가능합니다.  
**https://today-zh-learned.github.io/opencheckout/sandbox.html**

npm publish는 v1.0 릴리스 시점에 동시 진행 예정입니다 (`@opencheckout/widget`).

v0 번들을 직접 사용하려면 sandbox-bundled 경로를 사용하세요:

```html
<script type="module" src="https://today-zh-learned.github.io/opencheckout/assets/opencheckout-widget.js"></script>
```

> v1.0에 `https://cdn.opencheckout.dev/v1` 정식 CNAME 전환 예정.

## 빠른 시작

```html
<div id="address"></div>
<div id="shipping"></div>
<div id="payment"></div>
<div id="agreement"></div>
<button id="pay">결제하기</button>

<script type="module">
  import { OpenCheckout } from "https://today-zh-learned.github.io/opencheckout/assets/opencheckout-widget.js";

  const oc = await OpenCheckout.load({ publishableKey: "pk_test_demokey_DEMOnotProd123" });
  const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "ko" });

  widgets.setAmount({ value: 49900, currency: "KRW" });
  widgets.setOrder({ id: "order_abc", name: "Glow Serum", buyerCountry: "US" });

  widgets.renderAddress({ selector: "#address" });
  widgets.renderShipping({ selector: "#shipping" });
  widgets.renderPayment({ selector: "#payment" });
  widgets.renderAgreement({ selector: "#agreement" });

  document.querySelector("#pay").addEventListener("click", () =>
    widgets.requestPayment({
      successUrl: `${location.origin}/success`,
      failUrl: `${location.origin}/fail`,
    }),
  );
</script>
```

> 호출 순서는 항상 `load → widgets → setAmount + setOrder → render* → requestPayment`로 단일합니다. 머천트는 마운트 지점만 4개 잡으면 되고, 위젯 간 상태 동기화·국가별 분기·약관 검증은 `widgets` 객체가 내부적으로 처리합니다.

실시간으로 구성 값을 바꾸며 확인하려면 샌드박스를 여세요:
**https://today-zh-learned.github.io/opencheckout/sandbox.html**

## API 개요

```ts
OpenCheckout.load(opts: {
  publishableKey: string;
  gatewayUrl?: string;            // self-host 시만
}): Promise<OpenCheckoutInstance>;

OpenCheckoutInstance.widgets(opts: {
  customerKey: string;            // UUID 권장, 비회원은 "ANONYMOUS"
  locale?: "ko" | "en" | "ja" | "zh-CN";
}): CheckoutWidgets;

CheckoutWidgets {
  setAmount(amount: { value: number; currency: "KRW"|"USD"|"JPY" }): void;
  setOrder(order: { id: string; name: string; buyerCountry?: string }): void;

  renderAddress(p: { selector: string; variantKey?: string }): AddressWidget;
  renderShipping(p: { selector: string }): ShippingWidget;
  renderPayment(p: {
    selector: string;
    variantKey?: string;
    methods?: readonly string[];           // 노출할 결제수단 화이트리스트 (미지정 = 국가별 자동)
    easyPayBrands?: readonly string[];     // 간편결제 브랜드 (기본: ["paypal"])
    installmentMaxMonths?: number;         // KR 할부 최대 (기본 12)
  }): PaymentWidget;
  renderAgreement(p: {
    selector: string;
    clauses?: ReadonlyArray<{ id: string; label: string; required: boolean; href?: string }>;
  }): AgreementWidget;

  requestPayment(p: {
    successUrl: string;
    failUrl: string;
    customerEmail?: string;
  }): Promise<void>;  // PREVIEW: v1 ships mock redirect; live PG wiring lands in v1.0.1.

  destroy(): void;
}

// 각 서브 위젯은 자체 on()/destroy()를 가집니다
AddressWidget.on("addressSelect", (a: {
  country: string;
  admin1?: string;        // 주/도 (예: 서울특별시)
  admin1Code?: string;
  admin2?: string;        // 구/군 (예: 강남구)
  admin2Code?: string;
  city?: string;
  line1: string;
  line2?: string;
  postal: string;
  zip: string;            // postal alias (deprecated, 호환용)
}) => void);
ShippingWidget.on("methodSelect", (m: { carrier: string; rate: number }) => void);
PaymentWidget.on("paymentMethodSelect", (code: string) => void);     // card | transfer | virtual-account | foreign-card | easy-pay
PaymentWidget.on("installmentChange", (months: number) => void);     // 0 = 일시불, KR 카드 한정
PaymentWidget.on("bankSelect", (bankCode: string) => void);          // 가상계좌 은행
PaymentWidget.on("easyPaySelect", (brand: string) => void);          // 간편결제 브랜드
AgreementWidget.on("agreementStatusChange", (agreed: boolean) => void);
AgreementWidget.on("clauseChange", (e: { id: string; accepted: boolean }) => void);
```

**다중 약관 예시**:

```ts
widgets.renderAgreement({
  selector: "#agreement",
  clauses: [
    { id: "tos",     label: "서비스 이용약관",   required: true,  href: "https://example.com/tos" },
    { id: "privacy", label: "개인정보 처리방침", required: true,  href: "https://example.com/privacy" },
    { id: "promo",   label: "마케팅 정보 수신",  required: false },
  ],
});
```

필수 호출 순서: `load` → `widgets` → `setAmount` + `setOrder` → `render*` → `requestPayment`. 금액이 바뀌면 `setAmount()`를 다시 호출하면 열려 있는 모든 위젯에 전파됩니다.

## 문서

- **시작하기**: [GitHub Pages](https://today-zh-learned.github.io/opencheckout/) · [repo fallback](docs/pages/index.html)
- **샌드박스 (키 없이 체험)**: [sandbox.html](docs/pages/sandbox.html)
- **API Reference**: [`spec/openapi.yaml`](spec/openapi.yaml)
- **PRD**: [`prd/PRD-v1.md`](prd/PRD-v1.md)
- **ADR 인덱스**: [`docs/adr/README.md`](docs/adr/README.md) (19개)
- **TDD**: [`docs/tdd/`](docs/tdd/) (Gateway, Event Sourcing)

`docs.opencheckout.dev`는 정식 도메인 연결 후 GitHub Pages로 CNAME 전환 예정입니다.

## 모노레포 구조

머천트가 보는 공개 패키지는 **`@opencheckout/widget` 하나**입니다. 나머지는 내부
구현 세분화로, npm publish 되지 않습니다. (Headless 페르소나 수요가 확인되면 v1.1에
`@opencheckout/headless`를 별도 공개합니다.)

| 패키지 | 공개 | 역할 |
|---|---|---|
| `@opencheckout/widget` | ✅ public | 머천트가 쓰는 유일한 패키지. `OpenCheckout.load`, 4개 위젯 제공 |
| `@opencheckout/core` | ⛔ internal | 도메인 타입 · port 인터페이스 · `Result<T>` |
| `@opencheckout/payments` | ⛔ internal | 결제 오케스트레이터 (gateway 서비스 전용) |
| `@opencheckout/address` | ⛔ internal | 주소 정규화 DTO |
| `@opencheckout/adapter-toss` | ⛔ internal | Toss PG 클라이언트 + 웹훅 정책 |
| `@opencheckout/adapter-juso` | ⛔ internal | 도로명 주소 검색 어댑터 |
| `services/gateway` | ⛔ internal | Hono API 게이트웨이 (Fly.io) |

## 핵심 결정

- 위젯 = TypeScript + Web Components(Shadow DOM) + Preact (25KB gzipped 목표)
- PAN 경계 = `assertPanFree` / `containsPan`으로 위젯 bound 전체에서 강제 (ADR-003)
- Gateway = Hono (Node primary, Edge secondary)
- DB = PostgreSQL + outbox + LISTEN/NOTIFY
- 테스트 = Vitest(Small/Medium/Large) + Playwright + axe-core
- 문서 = Docusaurus + OpenAPI renderer
- 파이프라인 = [gstack](https://github.com/garrytan/gstack) (`/office-hours → /ship`)

## 배포

Gateway의 Phase 1 기본 배포 타깃은 Fly.io입니다.

```bash
fly apps create opencheckout-gateway
fly secrets set \
  WIDGET_TOKEN_SECRET="$(openssl rand -base64 32)" \
  ALLOWED_ORIGINS="https://merchant.example"
fly tokens create deploy --app opencheckout-gateway
```

생성한 deploy token을 GitHub Actions secret `FLY_API_TOKEN`으로 등록하면 `main` push마다
`.github/workflows/deploy-gateway.yml`이 `fly.toml`과 `Dockerfile`로 배포합니다.
(Phase 1 ready — workflow lands with first publish.)

GitHub Pages 샌드박스는 `.github/workflows/pages.yml`에서 위젯 번들을
`docs/pages/assets/`에 배치한 뒤 `actions/deploy-pages`로 게시됩니다.

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
