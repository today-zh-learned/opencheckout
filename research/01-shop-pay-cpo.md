# Shop Pay 벤치마킹 + 실리콘밸리 CPO 관점

source: researcher agent, 2026-04-23

## 1. Shop Pay 우위 3 / 약점 2

**우위 (FACT)**
- 네트워크 효과 프리필: Shopify 가맹 수백만 기반, 게스트 대비 최대 **50% 전환 리프트**, 경쟁 가속 체크아웃 대비 최소 **10%p 우위** (Shopify+Big Three, 2023.04)
- 속도: 게스트 대비 **4배 빠름**
- 단순 노출 리프트: 버튼 부착만으로 하부 퍼널 **+5%**, 모바일 포함 평균 **+9%**, 재방문 **+18%**

**약점 (INTERPRETATION)**
- Shopify 에코시스템 밖 이식성. Link by Stripe 같은 PSP 중립성 없음
- 글로벌 결제수단 깊이: Apple Pay/PayPal/Amazon Pay의 다국가 월렛 커버리지보다 얕음

## 2. Shop Pay 주소/전화/세금ID UX 특징

- **트리거**: 주소 자동완성이 아니라 전화/이메일 OTP 인증 후 프리필
- **국가 선택 순서**: 국가 먼저 → 하위 필드 동적 리렌더 (Baymard 권고와 일치)
- **우편번호 자동감지**: 우편번호 → City/State 자동 채움
- **편집 플로우**: 체크아웃 내 인라인 편집, 프로필 레벨은 Shop 앱/계정으로 격리
- **에러 복구**: 실시간 검증, OTP 재전송 경로 즉시 노출
- **세금ID**: Shop Pay는 B2C 중심, 세금ID는 머천트 설정 시에만. B2B/해외배송(CPF, PCCC, VAT) 필드는 Shopify Functions로 별도 구현 — **OSS가 파고들 빈틈**

## 3. OSS 체크아웃 시장 공백

| OSS | 한계 |
|---|---|
| Medusa.js | 체크아웃은 "모듈" 아닌 "스타터킷", 주소/세금/다통화/세금ID 직접 구현. 엔진 무거움 |
| Saleor | Django+GraphQL, K8s 권장, Postgres/Redis/Celery 끌려옴 — 무거움 |
| Spree/CommerceTools | Ruby/상용, 독립 체크아웃 SDK 아님 |

**차별화 3가지**
1. **"주소+결제 only" 초경량 SDK** — framework-agnostic (React/Vue/Vanilla), 커머스 엔진 종속 없음. Medusa/Saleor 위에 얹는 레이어
2. **아시아 퍼스트 주소 스키마** — 한국(PCCC/도로명/지번), 일본(郵便番号→자동완성), 중국(省/市/区), 세금ID 필드 표준. 서구 OSS 약점
3. **Toss 1급 통합 + 멀티-PG 라우터** — KRW는 Toss native, USD는 Toss FOREIGN_EASY_PAY, **JPY/CNY는 Toss 네이티브 미지원** → KOMOJU/Stripe JP/Antom으로 라우팅 필수

## 4. 배송+결제 번들 vs 분리

**권고**: "모노레포 + 2개 npm 패키지 + 얇은 오케스트레이터"
- `@ours/address`, `@ours/payments`, `@ours/checkout` (조립본)
- Stripe Elements 패턴: 자유 분해 가능하되 기본은 묶여있음
- PCI 경계는 payments-kit으로 격리해 address-kit 채택자 진입장벽 ↓

## 5. MVP 킬러 기능 5개

1. **식별자(전화/이메일) 프리필 + OTP** — Shop Pay 50% 리프트 엔진. 필수
2. **국가-선택-우선 동적 주소 폼** — 한/일/미 우선
3. **Toss + 멀티통화 라우터** — KRW native, USD=Toss FOREIGN, JPY/CNY=플러그인 PG
4. **토큰화 Vault** — 머천트 DB 저장 금지, SDK 내 토큰만. PCI SAQ A 유지
5. **3DS2 네이티브** — 라이어빌리티 시프트, 승인률 ↑

## 6. Blind Spot 3개

1. **PCI SAQ A 스코프 (v4.0, 2025.03 발효)**: iframe이라도 머천트가 악성 스크립트 보호 입증 필요. redirect vs hosted fields 분기. 놓치면 SAQ A-EP로 떨어져 질문 80→200+ 폭증
2. **세션 탈취 / SIM swap**: OTP만 쓰면 취약. WebAuthn/Passkey 병행 필수
3. **한국 법규**: 해외직구 PCCC 필수, 주민번호 수집 금지. APPI(일), GDPR(EU) "결제/배송 목적 외 사용 금지"

**추가 경고**: 사기방지 시그널(디바이스 핑거프린트/행동 분석)은 OSS 공개 시 회피당함 → MVP는 훅만, 상용(Sift/Signifyd) 어댑터로 위임

## PRD Decision Points

- **D1. 아키텍처**: 모노레포 / 3 패키지(address, payments, checkout-orchestrator). PCI 경계 payments로 격리
- **D2. PG**: Toss 1급, JPY/CNY는 멀티-PG 라우터(KOMOJU/Stripe/Antom). Toss 단독 글로벌 **불가능**이 확정
- **D3. 식별 UX**: 이메일/전화 OTP + Passkey 병행, 디바이스 바인딩 기본 on, 프리필은 OTP 성공 후에만
- **D4. 컴플라이언스**: 카드 필드는 호스팅 필드 또는 redirect만, iframe 자체관리 금지. 3DS2 기본 on
- **D5. 아시아 퍼스트 스키마**: 국가-우선 동적 폼 + PCCC/VAT/CPF 플러그형. 유일한 해자

## Gaps

- Toss의 2026 JPY/CNY 지원 로드맵 — 파트너 채널 확인 필요
- Shopify 비-Shopify Shop Pay 2025-2026 확장 현황 — 공개 1차 자료 부족

## Sources

- https://www.shopify.com/blog/shop-pay-checkout
- https://www.shopify.com/enterprise/blog/shopify-checkout
- https://baymard.com/labs/country-selector
- https://baymard.com/blog/zip-code-auto-detection
- https://docs.tosspayments.com/en/api-guide
- https://www.netguru.com/blog/saleor-vs-medusa
- https://stripe.com/guides/pci-compliance
- https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf
- https://hyperproof.io/resource/pci-dss-4-0-update-new-saq-a-eligibility-criteria/
