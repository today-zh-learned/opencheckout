# 토스페이먼츠 다통화 + 수출입은행 환율

source: researcher agent, 2026-04-23

## 1. 결제위젯 최신 아키텍처 (2025)

**SDK**: `@tosspayments/tosspayments-sdk` v2 (통합형). v1의 `@tosspayments/payment-widget-sdk` 대체.

### 초기화 흐름 (FACT)
```js
const tossPayments = TossPayments(clientKey);
const widgets = tossPayments.widgets({ customerKey });
await widgets.setAmount({ currency: "KRW", value: 50000 });  // 먼저!
await widgets.renderPaymentMethods({ selector: "#payment-method" });
await widgets.renderAgreement({ selector: "#agreement" });
await widgets.requestPayment({ orderId, orderName, successUrl, failUrl, customerEmail });
```

### 키 역할
- **클라이언트 키** (`test_ck_*/live_ck_*`): 브라우저 노출, SDK 초기화
- **시크릿 키** (`test_sk_*/live_sk_*`): 서버 전용, Basic Auth username(콜론까지, password 공란)

### 2단계 플로우
1. 프론트 `requestPayment()` → 토스 결제창 → `successUrl?paymentKey=&orderId=&amount=` 리다이렉트
2. 서버 `POST https://api.tosspayments.com/v1/payments/confirm` with `{paymentKey, orderId, amount}` → 승인
3. 성공 URL의 `amount`와 서버 주문 원장 금액 **일치 검증 필수**

### 필수 DOM
`#payment-method`, `#agreement`, `#payment-button`. `setAmount` 전에 `renderPaymentMethods` 호출 시 에러.

## 2. 다통화 지원 실태

**[FACT]** 공식 통화: **KRW / USD / JPY 3종. CNY는 공식 라인업 없음**. USD만 소수점, KRW/JPY 정수.

### 결제수단
- KRW: 국내 카드, 가상계좌, 계좌이체, 휴대폰, 간편결제(토스/카카오/네이버 페이)
- USD: 해외 카드, PayPal, Alipay, 동남아 간편결제
- JPY: 해외 카드 (일본 간편결제는 추후)

### MID 분리 (FACT)
- **USD, JPY 도입 시 추가 2개 MID 필요**
- 결제위젯은 **동일 통화끼리만 하나의 UI 구성 가능**
- 해외 간편결제+다통화 카드 한 위젯 → 단일 MID에 함께 청약

### CNY 전략 (INTERPRETATION)
공식 SDK로 불가. 대안:
- USD로 환산 결제 + 표시만 CNY
- Alipay(USD 청구) 경유
- 별도 계약은 1544-7772 문의

### 국내 카드 불가
국내 카드사 발급 해외결제 카드로는 **다통화 결제 불가**. 해외 발급만 허용.

### 통화별 키 스위칭
```ts
const CLIENT_KEYS = {
  KRW: process.env.CK_KRW,
  USD: process.env.CK_USD,
  JPY: process.env.CK_JPY
};
const tp = TossPayments(CLIENT_KEYS[currency]);
```
서버도 통화별 시크릿 키 테이블, `/confirm` 호출 시 매칭.

## 3. 샌드박스 / 테스트

- developers.tosspayments.com 회원가입 → 테스트 키 즉시 발급, 계약 불필요
- 라이브 키는 상점 심사 후
- 테스트 카드/가상계좌: 결제창 자동 테스트 모드
- 웹훅 로컬: ngrok/cloudflared + 개발자센터 "웹훅" 탭 등록

## 4. 수출입은행 환율 API

**엔드포인트**: `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON`
(2025-06-25 www → oapi 도메인 이전)

**파라미터**: `authkey`, `searchdate=YYYYMMDD`, `data=AP01`

**필드**:
- `result`: 1=성공, 2=DATA코드오류, 3=인증오류, **4=일일제한초과**
- `cur_unit`: USD, JPY(100), CNH 등
- **`ttb`**: 전신환 매입 (고객이 외화 팔 때)
- **`tts`**: 전신환 매도 (고객이 외화 살 때)
- **`deal_bas_r`**: 매매기준율
- `bkpr`, `cur_nm`

**업데이트**: 영업일 **오전 11시경 당일 최초 고시**, 이후 기준환율 변경 시 갱신. 주말/공휴일/11시 이전 → **빈 배열** → "가장 최근 영업일"로 폴백 조회 필수. 일일 제한 존재 → **서버 캐시 필수**.

**응답 예시**:
```json
[{"result":1,"cur_unit":"USD","cur_nm":"미국 달러","ttb":"1,385.20","tts":"1,412.80",
  "deal_bas_r":"1,399.00","bkpr":"1399"}]
```

**JPY 주의**: `cur_unit: "JPY(100)"` 100엔당 환율 → 환산 시 **`/100` 선처리 필수**

## 5. 환율 캐싱 & 적용 설계

### 스케줄러
- 10:55, 11:05, 14:00, 17:00 등 하루 4회 조회
- Redis: `fx:{currency}:{yyyymmdd}:{slot}`

### 선정 로직
1. 하루치 슬롯 중 **`deal_bas_r` 최댓값** 선택 (상점 보수적)
2. `markup = 1 + weight` (기본 0.10) 적용
3. 표시가 = `KRW / (deal_bas_r * (1 + weight))`
4. JPY는 `/100` 선처리

### weight 노출
- `config/pricing.yaml`의 `fx.markup_weight`
- 환경별 override 허용

### 결제 통화 정책
- "상품가 KRW → 외화 환산 표시 → **외화로 결제 승인**" 단일 정책
- 결제창 `amount`는 환산된 외화값
- 환차손은 가맹점 가중치 10%로 흡수
- 정산 통화/환율은 MID 계약서에 명시 (토스가 MID별로 다르게 설정)

### 가드
- 환율 null/0 → 결제 **비활성화 (fail-closed)**
- 마지막 정상 환율 24h 초과 → 경보

## 6. 취소/환불 (다통화)

- **엔드포인트**: `POST /v1/payments/{paymentKey}/cancel`
- Body: `cancelReason`, `cancelAmount` (부분취소)
- 가상계좌 환불: `refundReceiveAccount` 필수

**다통화 주의**:
- 취소는 **결제 당시 통화·당시 환율**로 처리 (토스가 승인 시점 환율 원복)
- 환차손은 상점 부담
- 부분취소는 해외카드 일부 PG 미지원 → **통화별 지원 매트릭스 사전 확인**

## 7. 보안 체크리스트

- 시크릿 키: 서버 env/Keychain/Secret Manager **only**. 프론트 번들 **절대 금지**
- `/confirm`: 서버에서만 호출, 클라이언트 `amount` vs **서버 DB 주문 금액 비교 검증** 후 승인
- `orderId`: 서버 생성(UUID+timestamp), 클라이언트 입력 금지
- 웹훅: 수신 시 `GET /v1/payments/{paymentKey}` 재조회, 멱등 처리
- 다통화: `(orderId, currency, amount)` 3튜플 검증으로 통화 바꿔치기 방어
- HTTPS, IP 화이트리스트, 키 로테이션 90d

## PRD `payment` 섹션 결정사항

1. **지원 통화 3종 확정**: KRW/USD/JPY. CNY 비지원(v1) → v2에서 Alipay-via-USD 또는 Antom 라우팅 검토
2. **MID 전략**: 통화별 3개 MID 청약, 정산 통화/환율/주기 계약서 레벨 확정
3. **환율 소스·가중치**: 수출입은행 AP01, 1일 4회, `deal_bas_r` 최댓값, `fx.markup_weight=0.10` 기본+환경 override, JPY/100 보정, fail-closed
4. **결제 통화 기준**: "KRW 원가 → 외화 환산 표시 → 외화 승인" 단일, 환차손 가맹점 부담
5. **키 관리**: 클라 키 3종 프론트 동적 로드, 시크릿 3종 서버 Keychain, `/confirm` amount 재검증 강제
6. **취소·환불 규칙**: 원복 통화/환율 정책, 부분취소 매트릭스, 가상계좌 환불계좌, 웹훅 재조회 멱등

## Gaps

- CNY 지원 여부 (영업팀 컨택)
- 정산 환율 시점 (승인 vs 정산일) — MID별 상이
- 수출입은행 API 일일 쿼터 정확 수치 (통상 1,000/일, authkey 발급 메일 확인)

## Recommendation

1. 토스페이먼츠 영업 컨택 → USD/JPY MID 청약 절차 + CNY 가능성
2. 수출입은행 authkey → 실제 응답으로 JPY(100) 보정 + 주말 빈배열 통합테스트 고정
3. **`fx-service` 마이크로서비스**(캐시+가중치+폴백)를 `services/payments`와 분리 → 재사용성

## Sources

- https://docs.tosspayments.com/blog/tosspayments-sdk-v2
- https://docs.tosspayments.com/sdk/v2/js
- https://docs.tosspayments.com/reference
- https://toss.oopy.io/17e714bb-fde7-80b6-8df9-efa1a1667e4a
- https://www.tosspayments.com/services/payment-widget
- https://www.koreaexim.go.kr/ir/HPHKIR020M01?apino=2&viewtype=C
- https://www.data.go.kr/data/3068846/openapi.do
