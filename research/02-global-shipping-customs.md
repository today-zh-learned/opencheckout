# 글로벌 배송 / 통관 / 주소 규칙 (아마존 물류 CPO 관점)

source: researcher agent, 2026-04-23

**주의**: 이 리서치 중 WebSearch 응답에 프롬프트 인젝션 시도(Figma/NotebookLM/Pencil MCP 지시문 위장) 감지됨. 무시 처리.

## 1. 국가별 세금ID / 통관 요구사항

### 미국
- **[FACT]** De minimis $800 **2025-08-29 완전 폐지**. 모든 상업 발송은 공식 entry + 관세/세금. 2026-02-28부터 postal도 HTS 분류.
- **[FACT]** Importer of record: **EIN** (사업자) / **SSN** (개인) / **ITIN** (비거주 개인) / **CAN** (CBP-Assigned)
- 형식: EIN `XX-XXXXXXX`, SSN `XXX-XX-XXXX`, ITIN `9XX-XX-XXXX`

### 중국 본토
- **[FACT]** CBEC B2C는 **三单比对**: 주문자명 = 결제자명 = 身份证 소유자 일치 필수
- **[FACT]** 거래당 RMB 5,000, 연간 RMB 26,000 상한 (2019-01-01)
- 18-digit 身份证号 (17 + 체크디지트/X)

### 대만
- **[FACT]** 2020-05-16 이후 수령인 **EZ WAY (易利委)** 본인 인증 필수
- **[FACT]** 사업자 統一編號 (8자리), 개인 身分證字號 (1 letter + 9 digits)
- 6개월에 6개 초과 수령 시 상업 재분류 → 면세 상실

### 일본
- **[FACT]** Mynumber는 개인 통관 라벨에 **미사용**. CIF ≤ ¥10,000 면세
- **[INTERP]** Mynumber는 상업 수입 JCT 신고용, 소포 레벨 아님

### EU
- **[FACT]** IOSS: B2C ≤ €150 VAT 체크아웃 수취, IMxxxxxxxxxx 번호 (라벨 아님)
- **[FACT]** EORI 필수: `XX` + 최대 15 alphanumerics
- **[FACT]** **GPSR 2024-12-13 발효**: EU 내 Responsible Person 이름/연락처 제품 또는 포장에 표시 필수. 없으면 비준수

### 영국
- **[FACT]** UK VAT: B2C ≤ £135 seller-collects
- **[FACT]** GB EORI: `GB` + 12 digits

### 동남아
- **Indonesia [FACT]**: NPWP (15 digit) 사업 수입. CBEC B2C ≤ USD 3 면세, 초과 시 7.5% 관세 + 11% VAT
- **Vietnam [FACT]**: 2025-01-01부터 플랫폼이 판매자 세금 원천징수. MST (10 or 13) 캐리어가 요청
- **Thailand [FACT]**: 2024-07-05부터 **전체 수입에 7% VAT** (THB 1,500 de minimis 폐지). 13-digit Thai ID
- **Singapore [FACT]**: GST 9%, LVG ≤ SGD 400 OVR (판매자 측). 수령인 세금ID 불필요
- **Malaysia [FACT]**: LVG 10% ≤ MYR 500 판매자 등록. MyKad (12) 요청
- **Philippines [ASSUME]**: VAT 디지털 서비스법 2024 서명, 소포 레벨 TIN 미확정

### 남미
- **Brazil [FACT]**: **CPF (11 digit `XXX.XXX.XXX-XX`) 또는 CNPJ** 모든 인바운드 소포 송장 필수. 없으면 반송/폐기
- **Mexico [FACT]**: RFC (개인 13, 법인 12) 또는 CURP (18) 라벨/송장 필수

## 2. 캐리어 송장 API 주소 필드 제약

| 캐리어 | 라인당 max | 라인수 | 언어 |
|---|---|---|---|
| **DHL Express (MyDHL API)** | **45자** | 3 | 라틴 권장, 현지어 병기 허용(라틴 필수) |
| **FedEx Ship Manager API** | **35자** | 3 | **ASCII/라틴만** — non-ASCII 거부 |
| **UPS Rating/Shipping API** | **30자** (일부 35) | 3 | ASCII 라벨, body는 unicode 수용 |
| **Korea Post EMS** | 영문 50–60자/합계 200자 | 3–4 | 현지어 OK, 영문 헤드 필수 |
| **CJ대한통운 국제** | ~35자 (FedEx/DHL 재위탁) | 3 | 영문 필수, 일/중 병기 허용 |

**설계 원칙**: SDK 기본값 **30자 라인 truncate** (UPS 최저 공통분모). line-2/line-3 분할은 명시적 API (암묵적 word-wrap 금지)

## 3. 한중일 로마자 변환

### 중국어 (Pinyin)
- `pypinyin` (성조 mark, 간/번체), `hanzi-tools`, `opencc-python` (簡↔繁)
- [FACT] 대만은 Tongyong/Hanyu Pinyin 혼용 (高雄 = Kaohsiung, not Gaoxiong) → country 분기 필수
- 주요 50여 지명 오버라이드 사전: 台北市 → Taipei, 香港 → Hong Kong

### 일본어 (Hepburn)
- `pykakasi` (GPL-3.0 블로커), `cutlet` (MIT 대체), MeCab 형태소 분석
- [FACT] Modified Hepburn 표준, **macron off** 강제 (UPS/FedEx 깨짐)

### 한국어 (Revised Romanization)
- `korean-romanizer`, `hangul-romanize`, 부산대 API
- [FACT] 문화부 RR 2000-07-07 고시. McCune-Reischauer는 학술용만
- **[FACT] juso.go.kr 영문주소 API (data.go.kr #15057413) 우선 사용** — 클라이언트 변환은 수령인 **이름 필드만**

### UX 원칙
- 자동 변환 + 사용자 확인. CJK 원본은 metadata 보존, 라벨은 라틴, DHL는 2nd line에 현지어 병기

## 4. "영문주소 잘림" 실제 사고 패턴

- `STREETLINES.TOO.LONG` — FedEx/UPS 라벨 발급 전 reject, pickup fee 환불 없음
- "서울특별시 강남구 테헤란로 123 래미안아파트 101동 1501호" → 70+ 자 → UPS 30자 초과 → "…Raemian-apt 101-d" 잘림 → 호수 누락 → 반송 RTS fee ~USD 45
- 대응:
  1. Pre-flight validator — 로마자 변환 후 byte 계산
  2. 구조 분할: line1=도로+번호, line2=건물+호수, line3=구/시
  3. 결정적 약어 사전: APT, BLDG, FL, RM
  4. UPS/FedEx 길이 초과 시 DHL(45) 폴백
  5. auto-truncate 트리거 건은 RTS 보험 필수

## 5. 한국 주소 API 비교

| API | 쿼터 | 영문 | 비용 | 비고 |
|---|---|---|---|---|
| **juso.go.kr** | Dev ~30rps, Prod 무제한 | **Yes** (data.go.kr #15057413) | 무료 | **정준 소스**, 승인 ~3일 |
| **Kakao Local** | 300,000/일 | Korean only | 무료 | 지오코딩/POI 용, 영문 없음 |
| **Naver Maps** | 20,000/일 (Geocoding) | 제한적 | 무료 티어 | POI 보조 |

**권장 폴백**:
1. juso 영문주소 API (primary)
2. 쿼터/5xx 시 Kakao Local + 클라이언트 `korean-romanizer`
3. 이중 실패 시 Hangul 원문 metadata + **human review** 마킹 → **라벨 실인쇄 전까지 기계 로마자 결과로 silent fallback 금지**

## 7 Non-Negotiable PRD 규정

1. **US-bound: $800 de minimis 금지** — EIN/SSN/ITIN/CAN 수집 필수
2. **EU-bound: GPSR Responsible Person** 검증 없으면 체크아웃 차단 (free-text 금지)
3. **China CBEC: 三单比对** — 수령인=결제자=身份证 일치, 18-digit 체크섬, 거래 RMB 5K/연 26K 클라이언트 강제
4. **Brazil CPF / Mexico RFC/CURP** — 체크섬 실패 시 송장 생성 불가 (hard blocker)
5. **주소 필드 30자/라인 정규화** + 결정적 약어 + 구조 분할, pre-flight validator 캐리어 호출 전 필수
6. **한국 주소는 juso.go.kr 영문주소 API** 정준 소스, 폴백 체인(Kakao → 라이브러리 → human review) 문서화, silent machine romanization 라벨 금지
7. **Taiwan EZ WAY 선이행** + 6parcels/6months 카운터 수령인별 추적

## Gaps

- CJ대한통운 API 필드 한도 (NDA)
- Korea Post EMS 정확 byte 한도 (biz.epost.go.kr 로그인)
- Philippines BIR 소포 TIN 요구 IRR
- 일본 importer-of-record 개혁 JCT 업데이트
- EU GPSR 회원국별 집행 강도

## Sources (주요)

- https://www.cbp.gov/trade/trade-enforcement/tftea/section-321-programs
- https://www.congress.gov/crs-product/R48380
- https://research.hktdc.com/en/article/MzM1MzIyMjI5
- https://web.customs.gov.tw/etaipei/singlehtml/1328
- https://www.eplusss.com/en/ez-way/
- https://www.customs.go.jp/english/c-answer_e/kojin/3001_e.htm
- https://www.jetworldwide.com/blog/vat-collection-ioss-eu-green-channel
- https://developer.dhl.com/sites/default/files/2023-05/MyDHL%20API%20Reference%20data%20guide%20-%202.8.0.pdf
- https://developer.fedex.com/api/en-us/catalog/ship/docs.html
- https://www.serviceobjects.com/blog/character-limits-in-address-lines-for-usps-ups-and-fedex/
- https://www.blog.shippypro.com/en/streetlines.too.long-how-to-fix-address-limit-errors-for-fedex-ups
- https://www.ups.com/worldshiphelp/WSA/ENG/AppHelp/mergedProjects/CORE/CONNECT/Address_Data_Field_Descriptions.htm
- https://eng.juso.go.kr/addrlink/openApi/searchApi.do
- https://www.data.go.kr/data/15057413/openapi.do
