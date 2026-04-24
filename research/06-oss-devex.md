# GitHub Pages 샌드박스 & OSS DevEx

source: researcher agent, 2026-04-23

## 1. GitHub Pages 경계

**가능**: 정적 HTML/JS/CSS, iframe 결제 위젯, 브라우저 상태 시뮬레이션, Mapbox 방식 독립 데모 페이지+소스 토글

**불가능**: 서버 비밀키, 결제 승인 API 호출, 웹훅 수신, IP 레이트리밋, 동적 환율/VAT 조회

## 권장 아키텍처

| 기능 | 구성 |
|---|---|
| UI 위젯, 주소 autocomplete | GitHub Pages 정적 |
| 결제 승인(Toss confirmPayment) | Cloudflare Workers 프록시 (무료 100K req/day) |
| 환율/VAT | Workers + KV 캐시 24h TTL |
| 웹훅 검증 데모 | 사용자 자체 백엔드 필수 — "Deploy to Vercel" 버튼 |

**3계층 전략**:
1. 풀 모킹 (키 없음, 즉시 동작)
2. 관리자 호스팅 Workers 프록시 (공용 샌드박스 키, 레이트리밋)
3. 사용자 자체 백엔드 (프로덕션 시뮬레이션)

**Workers 구성**: 단일 Worker에 `/confirm`, `/rate`, `/vat`. Origin allowlist(`*.github.io`, `localhost`) CORS. `X-Demo-Notice` 헤더.

## 2. 데모 키 관리

**공개 샌드박스 키**: 토스 테스트 클라이언트 키(`test_ck_`)는 공식 문서에도 공개 → GitHub Pages 노출 정책 위반 아님
- **시크릿 키(`test_sk_`)는 절대 금지** → Workers 환경변수만
- 공개 엔드포인트는 origin/referrer lock + 분당 10 req IP 제한
- 하루 한도 초과 시 "샌드박스 과부하, 본인 키 입력하세요" UX

**BYOK UX**: localStorage `tossSandboxClientKey`, 우측 상단 "Use my keys" 토글. prefix 검증(`test_ck_` 허용, `live_` 차단). 배너: "키는 브라우저에만 저장, 서버로 미전송" + 소스 라인 링크

**악용 방지**:
1. Cloudflare Turnstile (무료 CAPTCHA)
2. Origin allowlist + `Sec-Fetch-Site`
3. orderId 재사용 차단 (KV 5분 dedup)
4. Abuse 이메일 + Workers Analytics 주간 점검

## 3. 문서 사이트

| 도구 | 장점 | 단점 |
|---|---|---|
| **Docusaurus** | React, 풍부한 플러그인, i18n(ko/en/ja) 공식 | 번들 무거움 |
| Mintlify | 디자인, AI 검색 | **클로즈드 SaaS** — OSS 정신 충돌 |
| Nextra | Next.js, 가벼움 | i18n 얕음 |
| VitePress | Vite 속도, MD 중심 | React 생태계 단절 |

**채택: Docusaurus**. `i18n/{ko,en,ja}/docusaurus-plugin-content-docs` 표준화, Crowdin 연동. Mintlify SaaS 락인은 OSS 포지셔닝 약화

## 4. 라이선스: Apache 2.0

**결제/배송 SDK = Apache 2.0**:
- §3 특허 grant: 결제 영역은 특허 지뢰밭(원클릭, 토큰화, 분할결제). MIT는 특허 명시 없음
- NOTICE 파일 + attribution → 엔터프라이즈 법무팀 수용성 ↑
- MIT는 UI 유틸 등 작은 패키지만
- BSL 과잉 — 토스 결제 대체 SaaS 경쟁자 현실적으로 없음

## 5. 기여자 유치

**README 상단부터**: 한 줄 소개 → 라이브 데모 GIF/링크 → 3줄 코드 최소 예제 → 설치 → 배지 → 문서

**라벨 위계**: `good first issue`(난1), `help wanted`(난2), `documentation`, `i18n:ko/en/ja`. Mapbox 방식 각 이슈에 "예상 시간, 건드릴 파일, 힌트" 3줄

**CLA vs DCO**: **DCO 권장**. `git commit -s` 한 줄, CLA는 한국 기여자 심리 장벽 큼. 듀얼 라이선스 가능성 있으면 EasyCLA(LF)

**한국/해외 균형**:
- 이슈 영어 원본 + 한국어 요약
- Discord `#kr #en #ja` 분리
- KR: 인프런/오키드/GDG 밋업, 라이브 "첫 PR" 워크숍
- Global: HN Show HN, Reddit r/webdev, Dev.to, Product Hunt

## 6. 단일 페이지 데모

"주소 → 송장 → 결제" 구성:
1. 3단계 progress bar
2. 좌측: Kakao autocomplete (공용 키, Workers 프록시)
3. 중앙: 장바구니 fixture → 송장 미리보기 (KRW/USD/JPY 셀렉터, 환율은 Workers)
4. 하단: 토스 결제 위젯 iframe
5. 우측: "View source" 사이드 패널 — 현재 단계 SDK 코드 하이라이트 (Mapbox 패턴)
6. `?step=2&currency=JPY` 딥링크

성공 → "Test card 4242…" + "GitHub 소스 보기" CTA

## 런치 체크리스트

### Week 1 (MVP)
- [ ] GitHub Pages + 커스텀 도메인
- [ ] Workers 프록시 + 공용 샌드박스 키
- [ ] 단일 페이지 3단계 데모
- [ ] README(영/한) + 3줄 예제
- [ ] Apache 2.0 + DCO
- [ ] `good first issue` 5개 사전 등록
- [ ] Docusaurus 기본(영문) + ko 스텁

### Week 4 (확장)
- [ ] BYOK + Turnstile + 레이트리밋 대시보드
- [ ] Docusaurus ko/ja 완성, Crowdin
- [ ] 다통화 데모 탭
- [ ] "Deploy to Vercel" 버튼
- [ ] CONTRIBUTING.md + 이슈/PR 템플릿
- [ ] Discord `#kr #en #ja`
- [ ] Show HN / GDG Seoul 발표
- [ ] Workers 어뷰즈 모니터링 주간 리포트
- [ ] 기여자 리더보드
