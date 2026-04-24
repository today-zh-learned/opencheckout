# ADR-009: PII 라이프사이클 — DSAR / Erasure / Portability / Cross-Border

- **Status**: Proposed
- **Date**: 2026-04-23
- **Last normalized**: 2026-04-24 (ADR-019)
- **aggregates_touched**: [Address, Payment, Identity]
- **Deciders**: OpenCheckout Core, DPO(예정), Security WG
- **Consulted**: Toss Payments DPA, 수출입은행 API, Cloudflare Privacy Center
- **Related**: ADR-005 Multi-Tenancy Isolation (per-tenant PII DEK), ADR-007 DR & Incident Response (breach 72h), ADR-006 Observability (tamper-evident audit), ADR-014 (Audit DEK separate KMS), ADR-019 (Cross-ADR Normalization), PRD §5-3 (세금ID), §5-6 (AddressCanonicalRecord), §6 (Payment), §7-5 (관리자 권한·감사)
- **Scope**: OpenCheckout SDK + Gateway + (선택) Self-host 배포. Phase 1 필수 블록. research/08 차원 14 해소

---

## Context

PRD v0는 `source.rawResponse` 전량 보관, `retentionPolicy: "indefinite"`, soft delete 기본 전략을 기술했다(§5-6-2, 5-6-3). 기술 리뷰(research/08 차원 14, Q17)는 이 전략이 **GDPR Art.17 "right to erasure"와 정면 충돌**한다고 지적했다. PRD Q6는 한국 주민등록번호 수집 금지 여부를, Q17은 rawResponse 보관 정책을, Q18은 KMS 공급자를 결정 보류로 남겼다.

OpenCheckout은 다국적 머천트가 아시아·EU·미주 구매자에게 판매하는 시나리오를 1차 타깃으로 하며, 4개 관할(GDPR 27개국 / 한국 PIPA / 중국 PIPL / 인도 DPDPA)의 법률이 동시에 적용된다. Phase 1 출시 전에 다음을 결정하지 않으면 "잊혀질 권리" 요청을 처리할 수 없고, 유럽/중국 머천트가 SDK를 채택할 수 없다.

---

## Decision

### 1. Controller vs Processor 역할 분리

| 배포 형태 | 개인정보 처리자(Processor) | 개인정보처리자(Controller) | 근거 |
|---|---|---|---|
| **Hosted SDK** (OpenCheckout 호스팅) | OpenCheckout Foundation | 머천트 (상점) | GDPR Art.28, PIPA §26 위수탁 |
| **Self-host** (머천트 자체 배포) | 머천트 자체 | 머천트 자체 | OpenCheckout은 소프트웨어 공급자에 불과. 계약적 책임 없음 |
| **구매자 ↔ OpenCheckout 직접 상호작용**(Order Tracking 페이지) | OpenCheckout Foundation | OpenCheckout Foundation (Joint Controller with merchant) | GDPR Art.26 공동 컨트롤러 조항 필수 |

**DPA 템플릿 필수 제공**: GDPR Art.28 Module 2/3 준수 DPA, PIPA 위·수탁 계약서 한·영 이중본을 `legal/dpa/` 하위 `.md`로 배포. 머천트 온보딩 시 전자서명 필수(`merchant.compliance.dpaAcceptedAt`).

### 2. DSAR 엔드포인트 설계

```
POST /v1/privacy/dsar/access       # machine-readable export (JSON + CSV)
POST /v1/privacy/dsar/rectify      # 정정 (필드 단위 patch)
POST /v1/privacy/dsar/erase        # 삭제 요청 (아래 충돌 해결 규칙 적용)
POST /v1/privacy/dsar/portability  # 기계 가독 이동성 (JSON-LD + schema.org)
POST /v1/privacy/dsar/restrict     # 처리 제한 (GDPR Art.18)
POST /v1/privacy/dsar/object       # 처리 거부 (GDPR Art.21)
GET  /v1/privacy/dsar/:requestId   # 진행 상태 조회 (pending|in-progress|fulfilled|denied)
```

**인증**: 구매자는 이메일·주문번호·OTP 3-factor 검증(Order Tracking과 공유). 머천트 관리자(§7-5)는 `role: dpo` 또는 `role: admin` scope 필요.

**SLA**:
- GDPR Art.12(3): **1개월**(최장 3개월까지 복잡성 사유로 연장 가능) — 기본 30일
- 한국 PIPA §35: **10일** 이내 열람 통지, §36 정정/삭제 **10일**
- 중국 PIPL §45: **합리적 기간**(관행상 15일)
- 인도 DPDPA §11: **규정 별도**(2024 개정, 실무 30일)

→ **Worst-case 10일 SLA**를 모든 관할에 적용(`dsarSlaMaxDays: 10`). 10일 내 처리 불가 시 `inProgress` 상태로 통지 + 사유 기록.

**응답 형식**: JSON-LD `@context: https://schema.org/Person`, 포함 데이터 = §5-6 AddressCanonicalRecord, §6 Payment(민감정보 마스킹), §7-1 Locale/Currency 설정, consent log, webhook 수신 이력.

### 3. rawResponse 보관 ↔ 삭제권 충돌 해결 (핵심 결정)

PRD Q17의 답. 세 옵션 중 **(c) 기본 + (b) DSAR 트리거** 조합을 채택.

| 옵션 | 동작 | 선택 조건 |
|---|---|---|
| **(a) 부분 pseudonymization** | `recipient.phoneE164`, `taxIdentifiers[*].value` 등 PII 필드만 HMAC-SHA256(salt=tenant DEK로 암호화된 random) 치환, 나머지(좌표·지명·우편번호) 보관 | 분석·머신러닝 목적 보관 필요 시 머천트가 opt-in |
| **(b) 전체 rawResponse 삭제** | `source.rawResponse = null`, `source.providerRecordId` 유지(참조 추적용) | DSAR erase 요청 즉시 트리거 |
| **(c) 보관 기간 2년 상한** | 수집 후 **2년** 초과 rawResponse는 nightly cron이 자동 (a)로 변환 | **기본 정책(default)**. 머천트가 override 불가 |

**Rationale**:
- GDPR Art.5(1)(e) 저장 제한 원칙: "필요 이상으로 오래 식별 가능한 형태로 보관 금지"
- Art.17 erasure 요청은 (b)로 대응, 정상 운영은 (c)로 자동 감쇠
- 2년은 배송 클레임 처리 기간(관세 이의제기 EU 3년, 한국 2년, FedEx 1년) + 분쟁 평균 처리기간의 상한
- (a)는 "재식별 불가능" 수준(k-anonymity k≥5 권고)은 아니므로 여전히 개인정보로 취급. 단 erasure 대상에서는 "삭제된 것으로 간주"(GDPR Recital 26 해석)

**구현**:
```ts
interface RawResponseRetentionPolicy {
  defaultRetentionDays: 730;              // 2년
  pseudonymizationAlgorithm: "HMAC-SHA256";
  saltKeyRef: string;                      // tenant DEK로 wrap된 salt
  pseudonymizeFields: string[];            // ["phone", "email", "taxId", "name"]
  deletionOnDsar: "full" | "pseudonymize"; // 기본 "full"
  legalHold: boolean;                      // 소송·감사 중에는 cron 제외
}
```

`source.rawResponse` 스키마에 `retainedUntil: ISO8601`, `pseudonymizedAt?: ISO8601`, `dsarEraseId?: string` 필드 추가(§5-6-2 확장).

### 4. Crypto-shredding

- **Per-tenant DEK**(ADR-005 연계) + **per-subject sub-key**(선택, 고위험 머천트). 키 계층: Root KMS → Tenant DEK → Subject DEK → 필드 AES-256-GCM
- **Erasure 실행 = sub-key 삭제**. Ciphertext는 남아도 복호화 불가 → 실질 soft-delete이나 법적으로 "삭제"로 간주(ENISA 가이드라인, ICO 가이드)
- Tenant 탈퇴 시 tenant DEK 자체를 KMS에서 destroy → 수억 건 레코드 일괄 crypto-shred(O(1) 비용)
- **키 삭제 감사 로그**는 tamper-evident(ADR-006) 별도 저장소(WORM S3 Object Lock 7년). 키는 사라져도 "삭제했다"는 증거는 남음
- **Audit DEK는 crypto-shred 대상 아님** — Audit DEK는 PII DEK와 별도 KMS CMK 사용(ADR-014 §10). 감사 로그의 법적 증거력 유지를 위해 tenant 탈퇴 후에도 Audit DEK는 보존. (@see ADR-019 §3.7)

### 5. Cross-Border Transfer

OpenCheckout은 글로벌 CDN(Cloudflare)을 쓰므로 기본적으로 국경 이동이 발생한다. 다음을 기본 계약·기술 통제로 설정:

| 출발지 | 도착지 | 근거 | 보조 조치 |
|---|---|---|---|
| EU/EEA | 제3국(한국·미국·인도) | **SCC 2021-06-04 Module 2(C→P) / Module 3(P→P)** | TIA(Transfer Impact Assessment) 보고서 머천트 제공 |
| EU → 한국 | | **한국 적정성 결정 2021-12-17** 활용 (SCC 보조) | |
| EU → 미국 | | **EU-US DPF**(2023) 활용, DPF 미참여 벤더는 SCC | DPF 인증 서브프로세서 우선 선택 |
| 한국(PIPA §17) | 제3국 | 정보주체 동의 + 이전받는 자·국가·목적·항목 고지 | 체크아웃 시 동의 UI 표기(§7-1) |
| 중국(PIPL §38) | 제3국 | (1) CAC 안전평가(필수 업종/대량) / (2) CAC 표준계약(일반) / (3) 인증기관 인증 | Phase 1은 CN 머천트 onboarding 시 "**중국 데이터 역외 이전 요건 자가진단**" wizard |
| 인도(DPDPA 2023) | 제3국 | 중앙정부가 notify한 국가 외 이전 금지 규정(시행규칙 대기) | Phase 1은 인도 구매자 데이터 **로컬 저장 옵션**(`dataResidency: "IN"`) 제공 |

**데이터 레지던시 옵션**: 머천트별 `dataResidency: "KR" | "EU" | "US" | "IN" | "CN"` 설정. 값에 따라 Postgres cluster region + KMS region 고정. 기본값 `"KR"`(한국 호스팅).

### 6. Retention Matrix

| 데이터 종류 | 보관 | 근거 법률 | 삭제권 예외 | 비고 |
|---|---|---|---|---|
| 결제 원장(`payment.amount`, `payment.paymentKey`, `merchantName`) | **5년** | 전자상거래법 §6, 국세기본법 §85-3 | **예외 적용**(법정 보관) | GDPR Art.17(3)(b) 법적 의무 면제 |
| 부가세 계산서·세금계산서 | 5년 | 부가가치세법 §32 | 예외 | |
| 브라질 세금 문서(CPF 포함 NF-e) | **5년** | Brazil RFB 규정 | 예외 | |
| 멕시코 CFDI + RFC | 5년 | Código Fiscal §30 | 예외 | |
| EU VAT 인보이스 | **10년**(DE/FR/IT) / 7년(일부) | 국가별 VAT 법 | 예외 | 최장국 기준 통일 |
| 배송 주소(`AddressCanonicalRecord`) | **2년** + DSAR 즉시 | PIPA·GDPR 저장제한 | 없음 | 2년 후 pseudonymize |
| 수취인 전화·이메일 | 2년 | 동상 | 없음 | |
| 세금ID(CPF/RFC/EIN/VAT) | 해당 재무기록 보관 기간과 동기(5~10년) | 세법 | 예외 | 세금ID만 별도 암호화 keyset |
| 한국 주민등록번호 | **수집 금지** | PIPA §24-2 | n/a | §9 참조 |
| 웹훅 수신 로그(payload 포함) | **90일** | 운영 필요 최소 | 없음 | 90일 후 메타데이터만 남기고 payload 삭제 |
| 감사 로그(`audit.changeLog`, tamper-evident log) | **7년** | 상법 §33 | 예외 | 민감필드는 별도 KMS로 암호화 |
| 동의 로그(consent log) | 철회 + **5년** | 증빙 필요 | 예외 | withdrawal 이후에도 "동의했었다"는 증거 보관 |
| 관세 견적 snapshot(§5-10) | 5년 | 관세법 §12 | 예외 | |
| 신용조회 로그 (credit inquiry) | **3개월** | 신용정보의 이용 및 보호에 관한 법률(신정법) §32 | 없음 | 신용조회 사실 고지용 최소 보관 |
| 상사장부·영업 관련 중요 서류 | **10년** | 상법 §33(1) | 예외 | 계약서·회계장부·영업보고서 포함 |
| 전자상거래 소비자 분쟁 기록 | **5년** | 전자상거래 등에서의 소비자보호에 관한 법률(전상법) §6(1) | 예외 | 계약·청약철회·대금결제·분쟁 기록 |
| CDN/Rate limit 로그 | **30일** | 보안 운영 | 없음 | IP는 masked(`/24`) |
| Rate limit breach·fraud signal | 1년 | 보안 운영 | 없음 | |

구현: `ciphertextFields`마다 `fieldClass: "operational"|"financial"|"legal-hold"` 태그 부여 → retention cron이 클래스별 정책 적용.

### 7. Consent Management

- 체크아웃 폼에서 수집 항목별(마케팅·분석·쿠키·국경이전) **명시 동의** 체크박스. 기본값 **unchecked**(GDPR). 한국 PIPA §22 명시 동의 + 필수/선택 구분
- **Consent Receipt**(ISO/IEC 29184) 준수 JSON 저장:
  ```json
  {
    "version": "KI-CR-v1.1.0",
    "jurisdiction": "KR|EU|CN|IN",
    "collectionMethod": "web|app",
    "policyUri": "https://merchant.example.com/privacy/v2",
    "piiPrincipal": "hash_of_email",
    "piiControllers": [{"name":"merchant"}, {"name":"opencheckout","role":"processor"}],
    "services": [{"purpose":"order-fulfillment","purposeCategory":["contract-performance"],"lawfulBasis":"contract","piiCategory":["contact","address","payment"],"storage":"KR-seoul","thirdPartyDisclosure":["toss","exim-bank"]}],
    "acceptedAt": "2026-04-23T10:00:00Z",
    "signature": "ed25519:...",
    "ttl": 157680000
  }
  ```
- **Withdrawal**: `POST /v1/privacy/consent/withdraw`. 철회 즉시 해당 목적의 처리 중단, 철회 사실은 5년 보관(증빙)
- GDPR Art.7(3): 철회는 "제공만큼 쉬워야" → one-click 엔드포인트 제공

### 8. 데이터 맵 (Phase 1 필수 PII 필드)

| 필드 | 수집 근거 | 보관 위치 | 암호화 | 공유 대상 | 보관 기간 |
|---|---|---|---|---|---|
| `recipient.fullName` | Contract Art.6(1)(b) | Postgres `addresses` | AES-256-GCM 필드단위 | 캐리어, Toss | 2년 |
| `recipient.phoneE164` | Contract | 동 | AES-256-GCM | 캐리어 | 2년 |
| `recipient.email` | Contract | 동 | AES-256-GCM | 알림 ESP | 2년 |
| `address.line1..postalCode` | Contract | 동 | AES-256-GCM(상세주소만) | 캐리어 | 2년 |
| `taxIdentifiers[*].value` | Legal obligation Art.6(1)(c) | Postgres `tax_identifiers` (별도 KMS) | AES-256-GCM + sub-key | 국세청·관세청·PG | 5년 |
| `payment.paymentKey` | Contract | Postgres `payments` | envelope | Toss | 5년 |
| `payment.cardBin`(last4+brand) | Contract | 동 | hash | 영수증 표시 | 5년 |
| `source.rawResponse` | Legitimate interest(분석) | S3 `raw-responses` WORM | SSE-KMS | 없음 | 2년(이후 auto-pseudonymize) |
| `audit.changeLog.actor` | Legal obligation | tamper-evident log(Cloudflare R2 + Merkle) | KMS | DPO | 7년 |
| `consent.receipt` | 명시 동의 | Postgres `consent_log` | AES-256-GCM | 없음 | withdrawal + 5년 |
| `webhookPayload` | Legitimate interest(재전송) | Redis(7일) + S3(90일) | SSE-KMS | 머천트 | 90일 |

`@opencheckout/privacy` 패키지가 위 표를 런타임 레지스트리로 exposé → `datamap.json`을 DSAR Access에 자동 포함.

### 9. 한국 주민등록번호 완전 차단

- PIPA §24-2: 법령상 근거 없이 주민등록번호 수집·처리 금지. OpenCheckout은 해당 없음 → **전면 금지**
- 스키마 린터(`@opencheckout/schema-lint`)에 **RRN 패턴 deny rule** 추가:
  - 정규식: `^\d{6}[-]?[1-4]\d{6}$` (6-7-c 체크섬)
  - 유니온 `taxIdentifiers[].kind`에 `KR_RRN` 추가 **금지**(타입 레벨에서 차단)
  - API Gateway 입력 검증 레이어에서 모든 string 필드 스캔 → 감지 시 `400 PII_DENIED` + audit event
- **Q6 결정**: B2B 세무 케이스에도 **대체수단 사용**(사업자등록번호 `KR_BIZ_ID`). 주민번호는 예외 없이 차단
- CI에 `scripts/check-rrn-deny.ts` 린터 등록, PR에 RRN 리터럴 있으면 fail

### 10. 서브프로세서 공개

`public/sub-processors.md` 파일을 **공개 레지스트리**로 유지. 변경 시 **30일 전 사전 고지**(DPA 계약 조항).

| 서브프로세서 | 용도 | 처리 데이터 | 국경이전 근거 | 국가 |
|---|---|---|---|---|
| Toss Payments | 결제 승인 | 카드 bin/last4, 금액, 주문ID, 구매자 이메일 | 국내 처리(KR→KR) | KR |
| Kakao(Local API) | 한국 주소 검색 | 입력 주소 쿼리 | KR→KR | KR |
| Google(Places/Maps) | 글로벌 주소 자동완성 | 입력 쿼리, 세션토큰 | SCC + DPF | US |
| 수출입은행 | 환율 조회 | 통화 코드만(PII 없음) | KR→KR | KR |
| Cloudflare | CDN·WAF·Workers | IP 주소, User-Agent, 요청 경로 | SCC + DPF | US(글로벌) |
| AWS(기본 호스팅) | DB·KMS·S3 | 전체 데이터(암호화 상태) | SCC + DPF, 지역 고정 | per-tenant region |
| Sentry(예정) | 에러 트래킹 | 스택트레이스(PII scrub 필수) | SCC + DPF | US |
| ESP(예: Postmark, 예정) | 알림 이메일 | 이메일 + 주문 요약 | SCC | US |

Self-host 머천트는 목록을 자체 작성 의무 — 템플릿 제공.

### 11. Breach Notification (ADR-007 연계)

- **72시간 룰**: GDPR Art.33 감독기관 통지, 정보주체 고위험 시 Art.34
- **한국 PIPA §34**: 지체 없이 통지 + 5영업일 이내 신고(개보위)
- **중국 PIPL §57**: 즉시 통지
- **인도 DPDPA §8(6)**: Data Protection Board에 통지
- **Playbook**(ADR-007에서 상세):
  1. Detect → **SecOps on-call** (SLO: 평균 탐지 시간 < 30분)
  2. Contain → 해당 tenant DEK rotate, 영향 범위 산정
  3. Notify DPO(24h 내) → 감독기관(72h 내) → 정보주체(고위험시)
  4. Public disclosure(투명성 보고서 분기별)
- Breach ledger(`.omc/breach-ledger.jsonl`, tamper-evident) 보관 7년

---

## Consequences

### Positive
- GDPR/PIPA/PIPL/DPDPA 4개 관할 1차 통과 가능 → EU·중국·인도 머천트 onboarding 장벽 제거
- rawResponse 보관 ↔ erasure 충돌 명시적 해결(PRD Q17 close)
- Crypto-shredding으로 테넌트 탈퇴 O(1) 비용
- 서브프로세서 공개 레지스트리로 투명성 포지셔닝(Shopify·Stripe 대비 openness)
- Self-host 모드에서도 머천트가 직접 controller 역할 수행 가능 → B2B SaaS 채택 용이

### Negative
- **운영 복잡도 증가**: 국가별 retention·전송 근거를 런타임에서 결정하는 엔진 필요
- **Phase 1 출시 지연 리스크**: DPA 템플릿 법률 검토 + DSAR 엔드포인트 6종 구현 최소 3 sprint
- **KMS 비용**: per-tenant DEK + per-subject sub-key 계층은 KMS API 호출 증가 (AWS KMS $0.03/10k calls) → 캐싱 계층 필수
- 2년 자동 pseudonymization cron이 분석 파이프라인과 충돌 가능 — 분석은 **사전집계 후 원본 파기** 원칙으로 강제

### Neutral
- 데이터 레지던시 옵션은 Phase 1은 `KR` 단일, Phase 2에 `EU`/`US`/`IN` 추가
- Consent Receipt ISO/IEC 29184 JSON 포맷은 표준이나 실무 채택률 낮음 — 내부 사용 + 머천트에 optional로 공개

---

## Alternatives Considered

1. **A. rawResponse 전면 무기한 보관(PRD v0 그대로)** — GDPR 위반 리스크. Reject
2. **B. rawResponse 전면 수집 금지** — 재파싱 불가 → 다국어 백필·캐리어 포맷 재계산 불능(PRD §5-6-5 목적 상실). Reject
3. **C. 보관 2년 + pseudonymize + DSAR 삭제(채택)** — 운영과 규제 균형
4. **D. 각 머천트에 "자율 정책" 위임** — controller가 머천트라 법적으로 가능하나 기본값 없으면 대부분 무기한 보관 기본설정이 될 것. Reject
5. **인도 데이터 로컬라이제이션**: (a) 지금 구현 vs (b) DPDPA 시행규칙 확정 후 — (b) 채택. 단 `dataResidency: "IN"` 인터페이스는 미리 노출

---

## Checklist (구현 전 확인)

- [ ] DPA 템플릿(한·영) 법률 검토 완료 (GDPR Art.28 + PIPA §26)
- [ ] Joint Controller Agreement(Order Tracking용) 템플릿 작성
- [ ] `POST /v1/privacy/dsar/*` 6개 엔드포인트 구현 + OpenAPI 3.1 스펙 공개
- [ ] DSAR 요청 인증 플로우(이메일 + 주문번호 + OTP) 구현
- [ ] `@opencheckout/privacy` 패키지: datamap 레지스트리 + consent receipt + withdrawal
- [ ] rawResponse cron: 2년 경과 pseudonymize 배치 작업 + idempotent 재실행
- [ ] Crypto-shredding: tenant DEK destroy API + 감사 로그
- [ ] Retention policy runtime engine (field class 태깅 + cron)
- [ ] 한국 RRN deny linter + CI 훅 + API Gateway 입력 스캐너
- [ ] `public/sub-processors.md` 최초 발행 + 변경 알림 구독 endpoint
- [ ] Breach playbook 리허설(ADR-007)
- [ ] 공급자별 DPA/SCC 체결: Toss, Kakao, Google, Cloudflare, AWS
- [ ] `dataResidency` 옵션 인터페이스 정의 (Phase 1 `KR` only)
- [ ] DSAR SLA 타이머 + 지연 알림(9일째 escalation)
- [ ] Consent Receipt JSON 서명 키 rotation SOP
- [ ] 투명성 보고서 템플릿(분기별 breach·DSAR 통계)

---

## Open Questions

1. **Q-PII-1**: Phase 1 호스팅 리전 `KR-seoul` 단일로 시작 시, EU 머천트 요구에 대한 임시 조치는? → SCC + DPF + TIA 문서 제공으로 커버, Phase 2에 EU 리전 추가
2. **Q-PII-2**: 중국 PIPL CAC 표준계약 제출 의무 — OpenCheckout이 CN 머천트에 제공해야 하는가, 머천트가 자체 제출인가? → 법률 자문 필요
3. **Q-PII-3**: 구매자가 "포인트/마일리지" 적립한 경우 erasure 시 적립 이력은 삭제 vs 익명화? → 머천트 의사결정 권고, 기본 익명화
4. **Q-PII-4**: Joint Controller(Order Tracking)에서 책임 분배 — 주소 오타로 인한 오배송 클레임 시 누가 controller? → DPA 조항 명시 필요
5. **Q-PII-5**: DSAR erase 후 Toss에 저장된 `paymentKey`에 대한 삭제 요청 전달 프로토콜 — Toss가 응답하지 않을 경우 로그 남기고 종료?
6. **Q-PII-6**: 가족/법정대리인 DSAR — 만 14세 미만(PIPA), 16세 미만(GDPR) 구매자 처리. Phase 1은 구매 불가로 차단(이용약관) 후 Phase 2 아동 동의 UI?
7. **Q-PII-7**: GDPR Art.22 자동화된 의사결정(fraud score로 결제 거절)에 대한 설명 권리 — Phase 1 fraud engine은 인터페이스만이므로 유예, Phase 2 `@opencheckout/fraud` 도입 시 ADR 추가
8. **Q-PII-8**: SelfHost 머천트가 OpenCheckout 라벨을 달고 배포하는 경우 brand 상 책임 전가 리스크 — "Powered by OpenCheckout" 표기 약관 필요?
9. **Q-PII-9**: EU-US DPF 2025 재심의 결과 불확실 — DPF 붕괴 시 SCC 전면 전환 SOP 사전 준비

---

## References

- GDPR Art.5, 6, 7, 13-22, 26-28, 33-34, 46, 49
- 한국 PIPA §17, §22, §24-2, §26, §34, §35, §36
- 중국 PIPL §38, §45, §57
- 인도 DPDPA 2023 §8, §11
- EU SCC 2021/914 Module 2·3
- ISO/IEC 29184:2020 (Consent Receipt)
- ENISA, "Pseudonymisation techniques and best practices" (2021)
- ICO, "Deletion of personal data" (UK guidance)
- Shopify DPA (reference pattern for merchant-as-controller)
- Stripe Privacy Center (sub-processor public registry pattern)
- PRD v0 §5-3, §5-6, §6, §7-5
- research/08-technical-review.md 차원 14

---

*Status transitions: Proposed → Accepted (after Open Questions Q-PII-1, Q-PII-2, Q-PII-4 resolved + DPO 법률검토 승인) → Implemented (Phase 1 v0.1).*
