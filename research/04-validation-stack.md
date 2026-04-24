# 주소/전화/세금ID 검증 + 다국어 OSS 스택

source: researcher agent, 2026-04-23

## 1. 주소 자동완성/검증 API

### Google Places Autocomplete (New) — 채택 (글로벌)

- **세션 토큰**: 클라이언트 UUID v4 재사용, Place Details 호출 시 동일 토큰으로 세션 과금 1회
- **languageCode**: `ko/en/ja/zh-CN/zh-TW` 지원 (BCP-47). `regionCode` 편향, `includedRegionCodes`(최대 15) 필터
- **가격 (Places API New, 2025)**: Autocomplete Session (Essentials) $2.83/1K (0–100K), Place Details Essentials $5/1K, Enterprise $20/1K. **월 10K 무료 크레딧은 2025-03-01 종료**
- **ko→en 다국어 응답**: 공식 단일-콜 필드 없음. 권장 패턴:
  1. `languageCode=ko` autocomplete → 사용자 선택 `placeId` 확보
  2. 동일 `sessionToken`으로 Place Details를 `languageCode=en`으로 재호출
  3. 세션 요금 1회만
  4. `addressComponents[].shortText/longText`로 도 레벨 표준화

### 참고 대안

- Mapbox Search Box: 월 50K 무료, CJK 품질 하위
- HERE v7: 월 30K 무료, B2B 배송 친화
- Radar: 월 100K 무료
- Loqate / Smarty: 물류 검증 특화, 유료

### 한국 전용

- **juso.go.kr 도로명주소 Open API** — 채택 (한국 1차): 무상, 정부 원본, 영문 `addrEngApi` 별도 제공, 승인키 필요, 호출 쿼터 없음(상업 허용)
- Kakao Local API: 월 300K 무료, 자동완성 우수하나 **영문 응답 없음**

**채택 확정**: KR = juso.go.kr (국문+영문 API 2콜), Global = Google Places New (세션 토큰 ko→en 2콜)

## 2. 전화번호 검증

- **google-libphonenumber** (Apache-2.0) — 채택
  - JS: `libphonenumber-js` (catamphetamine, BSD-3, 10x 작은 번들)
  - Python: `phonenumbers` (Apache-2.0)
- E.164: `parse(number, regionCode)` → `format(E164|INTERNATIONAL|NATIONAL|RFC3966)`
- 휴대폰/유선 판별: `getNumberType()`. 한국은 MOBILE 확정, 미국은 `FIXED_LINE_OR_MOBILE`

## 3. 주소 포맷 규칙 엔진

- **google-i18n-address** (Chromium libaddressinput 데이터) — 서버 채택
  - `required_fields`, `allowed_fields`, `upper_fields`, `postal_code_matchers`, `country_area_choices`
  - 한국 시·도, 일본 47都道府県, 중국 省 전수 드롭다운 소스
- **@shopify/address** (MIT) — 클라이언트 채택
  - `orderedFields`, 국가·지방 드롭다운 로컬라이즈
  - GraphQL 기반 Shopify 주소 포맷팅

**매핑 키**: ISO 3166-2 (예: `KR-11`, `JP-13`)로 두 라이브러리 공통 매핑

## 4. 세금ID / 신분증 검증

- **python-stdnum** (LGPL-2.1+) — 서버 채택
  - 150+ 국가 체크섬
  - EU VAT (체크섬+VIES), US EIN/SSN, 중국 居民身份证 (GB 11643), 일본 マイナンバー (12桁 체크디지트), 한국 사업자등록번호(`kr.brn`), 한국 주민등록번호(`kr.rrn` 체크섬만, 보관 금지)
  - **LGPL-2.1+ 주의**: 동적 링크 배포는 프로프라이어터리 유지 가능, 정적 링크·수정 배포는 소스 공개 의무
- **VIES** (EU VAT 실시간): 무료 SOAP, SLA 없음 (다운타임 잦음)
- **vatlayer**: 상용 REST
- **여권**: `mrz` (MIT, JS) — ICAO Doc 9303 MRZ 체크섬

**정책**: 한국 주민번호는 **수집 최소화** — 체크섬만 검증, 저장 금지

## 5. 한중일 로마자 변환

### Python
- **pypinyin** (MIT) — 中 채택
- **pykakasi** (GPL-3.0) — **라이선스 블로커**
- 대안: **cutlet** (MIT, MeCab 필요) 또는 **romkan** (BSD) — 日 채택
- **hangul-romanize** (BSD) — 韓 채택 (문화부 2000)

### JS
- **kuroshiro** (MIT, kuromoji.js) — 日
- **korean-romanizer** (MIT) — 韓
- **pinyin** (MIT, hotoo/pinyin) — 中

### 이름 vs 주소
- **이름**: 개인 선호 표기가 우선 (김→Kim vs Gim). 사용자 입력 필드로 노출, 알고리즘은 placeholder 제안용
- **주소**: 행정구역은 결정적(서울→Seoul, 東京都→Tokyo). 권위 데이터(juso.go.kr addrEngApi, Google Places en, 중국 우정영문역명) 우선, 알고리즘은 fallback

## 라이선스 블로커

1개 확정: **pykakasi = GPL-3.0**. 상용 SDK에 번들 시 GPL 감염 → **cutlet (MIT) 또는 kuroshiro (JS, MIT)** 대체
기타 확인 완료: python-stdnum LGPL-2.1+ (동적 링크 OK), libphonenumber Apache-2.0, google-i18n-address BSD-3, @shopify/address MIT — 상용 안전

## 채택 확정 스택

- 주소: juso.go.kr (KR) + Google Places New (Global, 세션 토큰 ko→en 2콜)
- 전화: libphonenumber-js (JS) / phonenumbers (Python)
- 포맷 규칙: google-i18n-address (서버) + @shopify/address (클라이언트)
- 세금ID: python-stdnum + VIES (옵션)
- 로마자: pypinyin / cutlet (pykakasi 대체) / hangul-romanize

## Gaps

- Google Places New 2025 하반기 가격 — 출시 시점(2026+) 재확인
- juso.go.kr addrEngApi SLA — 공식 수치 미게재, 부하 테스트 필요
- KR RRN 수집 합법성 — 법정 근거 필요, 결제 플로우에서 제외 검토

## Sources

- https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
- https://mapsplatform.google.com/pricing/
- https://business.juso.go.kr/addrlink/openApi/apiExprn.do
- https://developers.kakao.com/docs/latest/ko/local/dev-guide
- https://github.com/google/libphonenumber
- https://www.npmjs.com/package/libphonenumber-js
- https://github.com/mirumee/google-i18n-address
- https://github.com/Shopify/quilt/tree/main/packages/address
- https://arthurdejong.org/python-stdnum/
- https://ec.europa.eu/taxation_customs/vies/
- https://github.com/mozillazg/python-pypinyin
- https://codeberg.org/miurahr/pykakasi
- https://github.com/hexenq/kuroshiro
- https://github.com/youknowone/hangul-romanize
