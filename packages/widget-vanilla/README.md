# @opencheckout/widget

비회원 국제배송 체크아웃을 15분 이내에 완성하는 렌더-레디 위젯. 4개의 마운트 타깃(주소·배송·결제·약관)에 끼우기만 하면 동작합니다.

## 설치

```bash
npm install @opencheckout/widget
```

CDN 사용:

```html
<script src="https://cdn.opencheckout.dev/v1"></script>
```

## 빠른 시작

```html
<div id="address"></div>
<div id="shipping"></div>
<div id="payment"></div>
<div id="agreement"></div>
<button id="pay">결제하기</button>

<script type="module">
  import { OpenCheckout } from "https://cdn.opencheckout.dev/v1";

  const oc = await OpenCheckout.load({ publishableKey: "pk_test_..." });
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

실시간 편집: https://today-zh-learned.github.io/opencheckout/sandbox.html

## API

### OpenCheckout.load(opts)

게이트웨이 세션 인증. 모든 위젯 생성 전 호출해야 합니다.

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `publishableKey` | `string` | — | 머천트 공개 키 |
| `gatewayUrl` | `string` | `https://gateway.opencheckout.dev` | 게이트웨이 엔드포인트 (self-host 시만 변경) |

**반환**: `Promise<OpenCheckoutInstance>`

### instance.widgets(opts)

위젯 팩토리. 세션 상태 및 이벤트 버스를 공유하는 네 개 위젯을 생성합니다.

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `customerKey` | `string` | — | 고객 식별자. UUID 권장, 비회원은 `"ANONYMOUS"` |
| `locale` | `string` | `"en"` | `"ko"` \| `"en"` \| `"ja"` \| `"zh-CN"` |

**반환**: `CheckoutWidgets`

### CheckoutWidgets 메서드

| 메서드 | 서명 | 설명 |
|--------|------|------|
| `setAmount` | `(amount: { value: number; currency: "KRW"\|"USD"\|"JPY" }) => void` | 결제 금액 설정. 변경 시 모든 마운트된 위젯에 전파됩니다 |
| `setOrder` | `(order: { id: string; name: string; buyerCountry?: string }) => void` | 주문 정보 설정 |
| `renderAddress` | `(opts: { selector: string\|Element; variantKey?: string }) => AddressWidget` | 주소 위젯 마운트 |
| `renderShipping` | `(opts: { selector: string\|Element }) => ShippingWidget` | 배송 위젯 마운트 |
| `renderPayment` | `(opts: { selector: string\|Element; variantKey?: string }) => PaymentWidget` | 결제 수단 위젯 마운트 |
| `renderAgreement` | `(opts: { selector: string\|Element }) => AgreementWidget` | 약관 동의 위젯 마운트 |
| `requestPayment` | `(opts: { successUrl: string; failUrl: string; customerEmail?: string; metadata?: Record<string, unknown> }) => Promise<void>` | 결제 요청 초기화 |
| `destroy` | `() => void` | 모든 마운트된 위젯 정리 |

### 서브 위젯 이벤트

각 위젯은 `on(eventName, callback)` 메서드를 가지며 `() => void` 언서브 함수를 반환합니다.

| 위젯 | 이벤트 | 페이로드 |
|------|-------|---------|
| `AddressWidget` | `"addressSelect"` | `{ country: string; zip: string; line1: string }` |
| `ShippingWidget` | `"methodSelect"` | `{ carrier: string; rate: number; currency: "KRW" }` |
| `PaymentWidget` | `"paymentMethodSelect"` | `string` (method code: `"card"` \| `"transfer"` \| `"virtual-account"` \| `"foreign-card"` \| `"easy-pay"`) |
| `PaymentWidget` | `"installmentChange"` | `number` (개월수, 0 = 일시불). KR 카드 선택 시에만 emit |
| `PaymentWidget` | `"bankSelect"` | `string` (가상계좌 은행 코드, 예: `"shinhan"`, `"kb"`) |
| `PaymentWidget` | `"easyPaySelect"` | `string` (간편결제 브랜드 코드, 기본: `"paypal"`) |
| `AgreementWidget` | `"agreementStatusChange"` | `boolean` |

### PaymentWidget 옵션

`renderPayment({ ... })`에 다음 옵션을 전달할 수 있습니다.

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `selector` | `string` | — | 마운트 타깃 |
| `variantKey` | `string?` | — | A/B 식별자 |
| `methods` | `readonly string[]?` | 국가별 자동 | 노출할 method 코드 화이트리스트. 미지정 시 buyerCountry 기준 자동 (KR: card·transfer·virtual-account·easy-pay / intl: card·foreign-card·easy-pay) |
| `easyPayBrands` | `readonly string[]?` | `["paypal"]` | 간편결제 브랜드 칩. 예: `["paypal", "other"]` |
| `installmentMaxMonths` | `number?` | `12` | KR 카드 할부 최대 개월수 (2-24 사이로 clamp) |

**예**:

```js
const addr = widgets.renderAddress({ selector: "#address" });
const unsubscribe = addr.on("addressSelect", (sel) => {
  console.log(`배송지: ${sel.country} ${sel.zip}`);
});
```

## 상수

```ts
import {
  CUSTOMER_KEY_ANONYMOUS,   // "ANONYMOUS"
  CHECKOUT_EVENT_NAME,      // "opencheckout:event"
  WIDGET_VERSION,           // "0.0.1"
} from "@opencheckout/widget";
```

## 에러

| 에러 | 발생 조건 |
|------|---------|
| `OpenCheckoutValidationError` | 필수 파라미터 누락, 잘못된 금액/주문 형식, 호출 순서 위반 |
| `OpenCheckoutSecurityError` | PAN(카드번호)이 위젯 바운더리를 넘어갈 때 발생. `assertPanFree` 검사 실패 |

## 호출 순서

다음 순서대로 호출해야 합니다:

1. `load()` — 게이트웨이 인증
2. `widgets()` — 위젯 팩토리 생성
3. `setAmount()` + `setOrder()` — 세션 상태 설정
4. `renderAddress()` / `renderShipping()` / `renderPayment()` / `renderAgreement()` — DOM에 마운트
5. `requestPayment()` — 결제 요청 초기화

금액 재산정 시, `setAmount()`를 다시 호출하면 열려 있는 모든 위젯이 자동 갱신됩니다.

## 보안

- **PAN 경계**: `assertPanFree`로 모든 입력 검증. 카드번호는 절대 위젯 외부로 나가지 않음 (ADR-003)
- **Shadow DOM 격리**: 각 위젯은 Shadow DOM 내부에서 렌더되어 스타일 침투 방지
- **세션 토큰**: 게이트웨이에서 발급한 토큰으로 모든 요청 보호

## 브라우저 지원

- 모던 브라우저: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- iOS 15+
- Android Chrome 90+

## 번들 크기

ESM 빌드 (docs 페이지 자산 기준): **94.7 KB** (raw) / **20.7 KB** (gzipped)

25 KB gzipped 예산 범위 내.

## 링크

- **Sandbox** (테스트용, 키 불필요): https://today-zh-learned.github.io/opencheckout/sandbox.html
- **Main Repo**: https://github.com/today-zh-learned/opencheckout
- **Root README**: `../../../README.md`
- **ADR-003** (PAN 경계 설계): `../../../docs/adr/ADR-003-pan-boundary.md`
- **ADR-001** (Hexagonal 아키텍처): `../../../docs/adr/ADR-001-hexagonal-ports-adapters.md`

## 라이선스

Apache 2.0
