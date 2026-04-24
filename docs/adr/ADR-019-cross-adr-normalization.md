# ADR-019: Cross-ADR Normalization (Vocabulary, TTL, Retention, Namespaces, HMAC, SLO)

- **Status**: Accepted (Meta-ADR, supersedes conflicting fragments in ADR-001/002/006/007/009/012/013/014/017)
- **Date**: 2026-04-23
- **Deciders**: `@ziho`, Cross-ADR consistency reviewer (research/09)
- **Context source**: `research/09-external-review.md` "Cross-ADR 정규화 필수 항목" + Critical findings A-1/A-2/A-4, S-1/S-2, L-2/L-4
- **Scope**: **문서 간 불일치 해소만** 수행. 새 기능·새 경계는 도입하지 않는다. 각 원본 ADR은 본 ADR의 canonical 정의를 참조(`@see ADR-019 §N`)로 대체한다.

---

## 1. Context

17 ADR + 2 TDD + PRD-v0를 7명의 독립 리뷰어가 감사한 결과, 단일 ADR 내부 품질은 상위권이나 **문서 간 어휘·수치·경계 불일치 14건**이 보고되었다(`research/09-external-review.md` L5). 구체적으로:

- **상태 어휘 3중 분열**: PRD `captured` (line 111) vs ADR-002 §9 `approved` vs Toss API `APPROVED` (ADR-012 lines 232, 351). Guard 로직이 ADR마다 다르게 구현될 위험.
- **Late-webhook 정책 반대 결론**: ADR-002 §9 `payment.cancelled`는 last-write-wins, ADR-012 Scen 2는 first-writer-wins. `DELIVERED → CANCELED` 진입을 한 ADR은 허용, 다른 ADR은 거부.
- **TTL 3축 충돌**: Idempotency TTL 24h(ADR-002) vs FX 30m (ADR-002 duty) vs audit 7y/10y(ADR-014) — 세 축이 단일 매트릭스처럼 읽혀 오해 유발.
- **보관 기간 3중 충돌**: ADR-009 "2년 상한"(line 64) vs ADR-014 "Object Lock 10y"(line 162) vs PRD `retentionPolicy: "indefinite"` — 서로 다른 목적을 혼동.
- **SLO 자기 충돌**: ADR-006 §1 SLI-1 `99.9%` confirm success(line 34) vs ADR-006 SLI-5 `99.95%` webhook vs ADR-007 (line 48) `99.95%` confirm. 3곳 모두 "confirm"이라 주장.
- **Namespace 흔들림**: ADR-003 `X-OC-Signature`(line 94) vs ADR-004/014 `OC-Signature` (ADR-004 lines 135, 159; ADR-014 line 37). RFC 6748 준수 혼재.
- **암호화 계층 구분 없음**: ADR-009 crypto-shred와 ADR-014 audit DEK가 같은 KMS root를 쓸 때, PII 삭제가 audit chain을 무력화하는 risk.
- **HMAC 알고리즘 분산 정의**: ADR-002 §7(서명 검증만 언급), ADR-003 §T(포맷), ADR-004 §OC-Signature(구현), ADR-014 §3(kid/nonce) — 4곳에서 조금씩 다르게 정의.
- **Aggregate 경계 재확인**: ADR-001 §Aggregate 표가 canonical이나 후속 ADR들이 이를 명시 참조하지 않음.
- **PCI SAQ A vs A-EP**: ADR-003 line 13 "SAQ A 경계 유지"는 widget이 Toss iframe을 orchestrate하는 구조상 **QSA 실사 실패**(research/09 S-1).
- **KR breach notification**: ADR-007은 단일 SLA 표. 정통망법 §48-3 (24h) + 개보법 §34 시행령 §39 (72h) 이중 의무 미반영.
- **Bug Bounty Safe Harbor 문언**: ADR-017은 정통망법 §48 형사처벌 면책처럼 읽힘 (대법원 2011도4894 위배).

본 ADR은 **어떤 ADR도 rewriting하지 않는다** — 각 항목에 대해 "canonical 정의 + 후속 패치 체크리스트"를 제공한다. 후속 PR이 각 원본 ADR을 본 ADR 참조로 대체한다.

## 2. Decision Drivers

- 어휘·수치·경계는 **한 곳에서만** 정의되어야 한다(Single Source of Truth, cross-ADR traceability).
- 외부 벤더 어휘(Toss `APPROVED`, Stripe `succeeded`)는 **adapter 경계 안에서만** 등장. Canonical 도메인 어휘와 섞이지 않음.
- 기존 ADR을 파기하지 않고 **patch-by-reference**로 일관화 — 저자 수만큼 diff 비용이 확대되지 않도록.
- 충돌하는 두 결정이 있을 때, **더 엄격한 쪽(fail-closed)** 을 채택.

---

## 3. Canonical Decisions

### 3.1 Payment Status Discriminated Union

**Before** (현재)

| 위치 | 값 |
|---|---|
| PRD-v0 line 111 | `draft → pending → captured → settled` |
| PRD-v0 line 1051-1052 | `payment.authorized`, `payment.captured` |
| ADR-002 §9 | `payment.approved` / `payment.cancelled` / `payment.refunded` / `payment.failed` |
| ADR-012 line 232, 351 | `APPROVED` (Toss raw) 섞여서 사용 |
| ADR-013 line 11 | `authorized → captured` / `authorized → voided` |

**After** (canonical, TS)

```ts
// packages/core/src/domain/payment/PaymentStatus.ts
export type PaymentStatus =
  | "authorized"           // 승인 완료, 청구 전 (2-step)
  | "captured"             // 청구 완료
  | "settled"              // 정산 완료 (T+N)
  | "voided"               // 승인 취소 (capture 전)
  | "refunded"             // 전액 환불
  | "partially_refunded"   // 부분 환불
  | "failed";              // 승인·청구 실패

export type PaymentEvent =
  | { type: "payment.authorized"; /* ... */ }
  | { type: "payment.captured"; /* ... */ }
  | { type: "payment.settled"; /* ... */ }
  | { type: "payment.voided"; /* ... */ }
  | { type: "payment.refunded"; /* ... */ }
  | { type: "payment.partially_refunded"; /* ... */ }
  | { type: "payment.failed"; /* ... */ };
```

**벤더 매핑**은 adapter 경계 내부에만 존재:

```ts
// packages/adapters-toss/src/TossPaymentStatusAcl.ts
const TOSS_TO_CANONICAL: Record<TossStatus, PaymentStatus> = {
  READY: "authorized",
  IN_PROGRESS: "authorized",
  WAITING_FOR_DEPOSIT: "authorized",
  DONE: "captured",
  CANCELED: "voided",        // capture 전 취소
  PARTIAL_CANCELED: "partially_refunded",
  ABORTED: "failed",
  EXPIRED: "failed",
};
```

### 3.2 Order State Machine (canonical DAG)

**Before**: ADR-001 §Aggregate 표(`draft→pending→confirmed→fulfilling→closed`), ADR-012 7 scenarios, ADR-013 lock vocabulary가 각자 정의.

**After** (canonical):

```
draft
  → pending_payment
    → paid
      → processing
        → label_purchased
          → in_transit
            → delivered
              → completed
(any non-terminal) → canceled   [guarded: post-DELIVERED 진입 금지]
```

- Terminal states: `completed`, `canceled`.
- `canceled` 진입 guard: `prev_state != 'delivered' AND prev_state != 'completed'`. 위반 시 conflict_log에 기록 + 2xx + `X-Transition-Rejected: post-delivery`.
- Optimistic lock: `UPDATE orders SET state=$new WHERE id=$id AND state=$expected_prev` (ADR-013 §4 참조).

### 3.3 Late Webhook Policy (통합표)

**Before**: ADR-002 §9 `payment.cancelled` = last-write-wins (event_time 기준). ADR-012 Scen 2 = first-writer-wins (이미 delivered면 취소 거부). 반대 결론.

**After**: **transition-guard-first + event_time tiebreaker (동일 상태 허용 시에만)**

| Event | 1차: Transition Guard | 2차: Tiebreaker | Conflict action |
|---|---|---|---|
| `payment.authorized` | `prev ∈ {pending_payment}` | first-write-wins | 2nd → drop + `conflict_log` |
| `payment.captured` | `prev ∈ {authorized}` | first-write-wins | 2nd → drop |
| `payment.voided` | `prev ∈ {authorized}` (capture 전만) | event_time DESC | stale event → drop |
| `payment.refunded` | `prev ∈ {captured, settled, partially_refunded}` | event_time DESC + saga dedup | — |
| `payment.failed` | `prev ∈ {authorized}` | first-write-wins | — |
| `order.canceled` (CANCELED webhook) | `prev NOT IN {delivered, completed}` | **guard reject** | `conflict_log` + human review |
| `shipment.*` | monotonic: `label_purchased < in_transit < delivered` | event_time DESC within same bucket | — |

구현: `application/policies/WebhookTransitionPolicy.ts`에 선언적 매핑 파일 단일화. ADR-002 §9 표·ADR-012 Scen 2는 삭제하고 본 §3.3 참조.

### 3.4 TTL 3축 분리

**Before**: ADR-002 §4 TTL Matrix가 "재시도/가격/감사"를 한 표에 혼합, confusion 유발.

**After**: **명시적으로 3축으로 분리**.

**Axis A — Idempotency retry window (재시도)**:

| Operation | TTL | 근거 |
|---|---|---|
| `payment.confirm` | 24h | 카드 승인 윈도 |
| `payment.cancel`, `payment.refund` | **영구 (refundId 기반)** | Toss 환불 최대 6개월. 재시도 키는 `refund.{refundId}` 주소화 — TTL 제약 없음 |
| `subscription.renew` | 7d | |
| `webhook.delivery` | 30d | Toss 재전송 최대 7일 + 버퍼 |
| `address.*` | 1h | |

**Axis B — Price validity (가격 유효)**:

| Snapshot | TTL | Refresh policy |
|---|---|---|
| FX rate | 30m | **±0.5% silent refresh** (사용자 재확인 없이 시세 내 갱신), 초과 시 강제 재확인 |
| Duty quote | 15m | 만료 시 재견적 강제 |
| Shipping rate | 15m | 만료 시 재견적 강제 |

**Axis C — Audit/discovery (조회·감사)**:

| Store | Retention | 근거 |
|---|---|---|
| WORM audit log | **7년** | 상법 §33 + SOC2 |
| Merkle snapshot bucket | **10년** | ADR-014 S3 Object Lock Compliance |

각 축은 **독립 저장소·독립 cron**. Axis A expiry가 Axis C audit을 삭제하지 않는다.

### 3.5 Retention Matrix (통합)

**Before**: ADR-009 line 64 "기본 2년 상한" vs ADR-014 line 162 "10y Object Lock" vs PRD `retentionPolicy: "indefinite"` — 3곳이 다른 목적을 단일 축처럼 표현.

**After**: **목적별 분리 매트릭스** (ADR-009 §6 표를 확장, 법률 근거 명시).

| Data class | Retention | 법률 근거 | 처리 후 |
|---|---|---|---|
| 결제 원장 (amount, paymentKey, merchantName) | **5년** | 전자상거래법 §6 시행령 + 국기법 §85-3 | `payment_ledger_archive` 이동 |
| 상법 상업장부 (회계·재무 원장) | **10년** | 상법 §33 | WORM 보존 |
| 배송 주소 (recipient.*, address.line1..) | **2년** + DSAR 즉시 | PIPA + GDPR Art.17 | AES-DEK destroy → pseudonymize |
| 세금ID (CPF/RFC/EIN/VAT) | **5~10년** (국가별) | 세법 | 별도 keyset |
| Webhook inbox | **90일** | 운영 | partition drop |
| Audit log (tamper-evident) | **7년** | 상법 §33, SOC2 | PII는 pseudonymous ref만 기재 |
| rawResponse (벤더 원본) | **2년 후 pseudonymize**, DSAR 삭제 옵션 | 분석 정당이익 + GDPR | DEK destroy |
| 신정법 분리보관 | 철회 후 **3개월** | 신정법 §17-2 | 분리 DB |
| 청약철회 로그 | 3년 | 전자상거래법 §6 | — |
| 동의 로그 | 철회 + 5년 | PIPA + GDPR accountability | — |

PRD `retentionPolicy: "indefinite"`는 **삭제**. 각 필드는 `fieldClass: operational|financial|legal-hold|audit` 태그로 클래스별 cron 적용(ADR-009 §7 참조).

### 3.6 Namespace Registry (canonical)

**Before**: `tid` vs `tenantId` vs `tenant_id` 혼재, `X-OC-Signature`(ADR-003) vs `OC-Signature`(ADR-004/014).

**After**:

| Domain | Canonical identifier | 비고 |
|---|---|---|
| Tenant (SQL) | `tenant_id UUID` | snake_case |
| Tenant (TS) | `tenantId: string` | camelCase |
| Tenant (JSON/HTTP body) | `"tenantId"` | **no `tid`** |
| Request correlation | `X-OC-Request-ID: <ULID>` | 인바운드 요구 |
| Trace context | `traceparent: <W3C>` | 병행 (ULID도 유지) |
| Webhook signature | `OC-Signature: t=<ts>,v1=<hex>,nonce=<b64u>,kid=<kid>` | **no `X-` prefix** per RFC 6648 |
| API version | `OpenCheckout-Version: YYYY-MM-DD` | 헤더 기반 datestamp |
| Idempotency mismatch | `X-Idempotency-Mismatch: payload\|operation\|in-flight\|expired` | |
| Idempotency replay | `X-Idempotency-Replay: true` | |
| Original request (replay) | `X-Idempotency-Original-Request-Id: <ULID>` | |
| Webhook duplicate | `X-Webhook-Duplicate: true` | |

ADR-003 line 94 `X-OC-Signature`는 `OC-Signature`로 수정 (후속 패치). `X-`는 application-level custom header 중 idempotency 응답 계열만 유지.

### 3.7 Encryption Layer Separation

**Before**: ADR-005 per-tenant DEK, ADR-009 subject sub-key, ADR-014 audit DEK가 모두 "KMS DEK"로 불림 → PII crypto-shred가 audit chain을 훼손할 수 있는 착시.

**After**: **논리적으로 구분된 3개 key family**.

| Family | 목적 | Lifecycle | 삭제 시 효과 |
|---|---|---|---|
| **PII DEK** (per-tenant) | `recipient.*`, `address.*`, `cardBin` 암호화 | `active → retired (decrypt-only) → pending-destruction (7-30d grace) → destroyed` (2인 승인) | crypto-shred — 해당 tenant PII만 판독 불가 |
| **Subject sub-key** | `HKDF(tenant_DEK, record_id)` — 레코드 단위 파기 | PII DEK lifecycle 종속 | 단일 레코드 DSAR erase |
| **Audit DEK** (별도 KMS root) | `audit_log.payload` 민감 필드 암호화 | **PII DEK와 독립**, 연 1회 로테이션, destroy 금지 | 감사 무결성 보존 — PII 삭제가 audit hash chain을 깨뜨리지 않음 |

규칙: audit DEK는 **별도 KMS CMK**를 쓰고, `EncryptionContext`에 `purpose=audit`를 바인딩. PII DEK destroy job은 audit CMK에 ARN-level IAM으로 접근 불가(ADR-014 §4 참조).

### 3.8 HMAC Single Source of Truth

**Before**: HMAC 포맷이 ADR-002 §7, ADR-003 §T, ADR-004 §OC-Signature, ADR-014 §3에서 4회 부분 정의.

**After**: **ADR-003 §T(webhook payload 변조 방어)** + **ADR-014 §3(서명 포맷)** 두 곳만 canonical로 유지. ADR-002/004는 `@see ADR-014 §3` 참조만 남긴다.

Canonical 정의:

```
Header: OC-Signature: t=<unix>,v1=<hex(hmac_sha256(key, "<t>.<raw_body>"))>,nonce=<b64u-32>,kid=<key-id>
Algorithm: HMAC-SHA256
Clock skew window: ±300s
Nonce store: Redis 10min sliding window, fail-closed on Redis outage (ADR-003 JTI 연계)
Key rotation: kid 기반 overlap (old + new 30d)
Verification: `crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))` — 반드시 constant-time
```

**금지**: `==` 비교, MD5/SHA-1, body re-serialization 후 비교(raw bytes 사용).

### 3.9 SLO Reconciliation

**Before**:
- ADR-006 line 34: Payment confirm success = **99.9%**
- ADR-006 line 38: Webhook delivery = **99.95%**
- ADR-007 line 48: confirm path availability = **99.95%**

3곳이 "confirm"을 말하나 숫자가 다름.

**After**: **v1 출시 SLO는 보수적으로 하향 + Toss 의존성 carve-out 명시**.

| SLI | v1 SLO (28d) | Post-GA (6개월 shadow 후 ratchet) | Measurement carve-out |
|---|---|---|---|
| Payment confirm success (gateway-local) | **99.5%** | 99.9% 목표 | 분모에서 Toss 5xx (업스트림 귀속) 제외 |
| Payment confirm latency p95 | **≤ 500ms** (gateway-local) | 400ms | Toss 라운드트립 제외 |
| Webhook delivery 24h | 99.5% | 99.95% | 머천트 5xx는 태그만, SLO 분자에 포함 |
| Widget first render p95 | 2.5s | 2.0s | 4G 에뮬 |
| Event store durability | 99.99% | 99.99% | — |

ADR-007 line 48 `99.95%`는 **삭제**, ADR-006 §1로 단일화. "confirm path"는 gateway-local 기준. Toss 다운 시 auto-degrade(ADR-016 circuit breaker) + status page 업데이트.

### 3.10 Aggregate Boundary Reaffirmation

ADR-001 §"Aggregate 경계 확정" 표가 **canonical**. 각 후속 ADR은 다루는 aggregate를 문서 상단 frontmatter에 명시:

```yaml
aggregates_touched: [Payment, Order]   # ADR-002
aggregates_touched: [Address]          # ADR-012 §scen-address
```

신규 aggregate 추가/제거는 본 ADR-019 §3.10 amendment + ADR-001 §Aggregate 표 동시 수정.

### 3.11 Shipment AddressSnapshot Timing

**Before**: ADR-001 Open Question #2는 "label.purchased 시점으로 추정".

**After**: **`label.purchased` 이벤트 payload에 immutable AddressSnapshot 포함** (ADR-012 §scen-address 근거).

```ts
type LabelPurchasedEvent = {
  type: "shipment.label_purchased";
  shipmentId: ShipmentId;
  orderId: OrderId;
  addressSnapshot: {                  // immutable value copy
    recipient: { name: string; phoneE164: string; email?: string };
    address: { line1: string; /* ... */ postalCode: string; country: string };
    snapshotAt: string;               // ISO8601
    sourceAddressId: AddressId;       // reference only, not for lookup
  };
  /* ... */
};
```

label.purchased 이후 `Address` aggregate bump은 Shipment에 **영향 없음**. ADR-013 §concurrency는 "`label.purchased` 이후 Address update는 Shipment에 non-propagating" 1줄 추가.

### 3.12 Miscellaneous Normalizations

**PCI scope**: ADR-003 line 13 "SAQ A"는 **SAQ A-EP로 재분류**. Widget이 Toss iframe을 orchestrate(postMessage, SRI, CSP 관리)하므로 PCI DSS v4.0 SAQ A-EP 기준 적용. 6.4.3/11.6.1은 OpenCheckout + 머천트 공동 책임. 런타임 PAN non-crossing enforcement(postMessage 값 regex check) + CI test 추가.

**KR breach notification**: ADR-007 §breach 표 단일 SLA → **이중 SLA 분리**:
- `T+24h`: KISA 통지 (정통망법 §48-3 개인정보 유출) — 1,000명 이상 또는 민감정보 유출 시
- `T+72h`: 개보위 통지 (PIPA §34 + 시행령 §39)
- `T+5d` (영업일): 정보주체 통지(PIPA §34)

Playbook에 두 SLA를 병렬 트랙으로 기재. T+24h 누락은 §49 (3년 이하 징역)까지 확대 가능.

**Bug Bounty Safe Harbor 문언**: ADR-017 현 표현 → **"민사 소송·형사고발을 제기하지 않는다"** 한정. 정통망법 §48 형사처벌 면책 문언은 **삭제** (대법원 2011도4894). HackerOne KR legal template 채택. 국내 로펌 의견서 확보 전 공개 금지.

---

## 4. 영향받는 ADR 목록 (파일 + 라인)

| 항목 | 영향 ADR | 라인 | 패치 종류 |
|---|---|---|---|
| §3.1 Payment status | PRD-v0 | 111, 865, 1051-52 | 교체 |
| §3.1 Payment status | ADR-002 | §9 표 전체 | 교체 + `@see §3.3` |
| §3.1 Payment status | ADR-012 | 232, 351 | Toss raw → canonical + ACL 참조 |
| §3.1 Payment status | ADR-013 | 11 | enum 확장 |
| §3.2 Order state | ADR-001 | §Aggregate Order 행 | 교체 |
| §3.2 Order state | ADR-012 | scenario 1-7 state refs | 교체 |
| §3.2 Order state | ADR-013 | §4 optimistic lock | 반영 |
| §3.3 Late webhook | ADR-002 | §9 (lines 258-267) | 삭제 + `@see §3.3` |
| §3.3 Late webhook | ADR-012 | Scenario 2 결론 | 재작성 |
| §3.4 TTL axes | ADR-002 | §4 TTL Matrix (114-126) | 3축 분리 |
| §3.5 Retention | ADR-009 | lines 112-124 표 | 교체 + 신정법/상법 추가 |
| §3.5 Retention | ADR-014 | line 162, 284, 376 | "10y" 목적 명시(audit snapshot only) |
| §3.5 Retention | PRD-v0 | §5-6-2 `retentionPolicy: indefinite` | 삭제 |
| §3.6 Namespace | ADR-003 | line 94 `X-OC-Signature` | `OC-Signature`로 수정 |
| §3.6 Namespace | ADR-004 | lines 135, 159, 202 | 유지 (이미 canonical) |
| §3.6 Namespace | ADR-014 | line 37 | 유지 |
| §3.7 Key families | ADR-005 | DEK 섹션 | `PII DEK` 라벨 추가 |
| §3.7 Key families | ADR-009 | §3 crypto-shred | audit DEK 분리 명시 |
| §3.7 Key families | ADR-014 | line 284 | "PII DEK와 독립" 추가 |
| §3.8 HMAC SSoT | ADR-002 | §7 lines 220-242 | `@see ADR-014 §3` |
| §3.8 HMAC SSoT | ADR-004 | §OC-Signature | `@see ADR-014 §3` |
| §3.8 HMAC SSoT | ADR-014 | §3 | canonical 확정 |
| §3.9 SLO | ADR-006 | lines 32-41 표 | 숫자 하향 + carve-out |
| §3.9 SLO | ADR-007 | line 48 | 99.95% 제거, ADR-006 참조 |
| §3.10 Aggregate | 모든 ADR | frontmatter | `aggregates_touched` 추가 |
| §3.11 AddressSnapshot | ADR-001 | OQ #2 | close + §3.11 참조 |
| §3.11 AddressSnapshot | ADR-012 | scen-address | payload 스펙 |
| §3.11 AddressSnapshot | ADR-013 | §concurrency | non-propagation 1줄 |
| §3.12 PCI | ADR-003 | line 13 | SAQ A → SAQ A-EP |
| §3.12 KR breach | ADR-007 | breach 섹션 | 24h/72h 이중 트랙 |
| §3.12 Bug Bounty | ADR-017 | Safe Harbor 문언 | 재작성 |

---

## 5. Consequences

**Positive**
- 어휘·수치 단일 정의소 확립. 17 ADR 간 교차 참조가 `@see ADR-019 §N`으로 간결화.
- Guard 로직이 canonical enum + 단일 transition 표에 수렴 → 테스트 시나리오 수 절반.
- 법률 리스크(PCI A-EP 재분류, KR 이중 SLA, Bug Bounty 문언)를 코드 착수 전 해소.
- `payment.confirm` SLO 하향은 Toss 의존성에 solvent, 현실적 출시 가능.

**Negative**
- Diff 범위가 9개 ADR + PRD에 걸침. 후속 PR cadence 관리 필요.
- Payment status enum 7종이 DB migration + adapter 매핑 테스트를 요구.
- SLO 하향은 엔터프라이즈 머천트 contract 협상 시 마찰.

**Neutral**
- 본 ADR은 **기능을 추가하지 않는다** — 순수 정규화. 런타임 동작 변화는 late-webhook guard 강화(§3.3)와 SLO carve-out(§3.9)뿐.

---

## 6. Checklist (후속 패치)

- [ ] ADR-001: OQ #2 close, `aggregates_touched` frontmatter 추가
- [ ] ADR-002 §4: TTL Matrix 3축으로 리팩터 (재시도/가격/감사 3개 표)
- [ ] ADR-002 §7: HMAC 본문 삭제, `@see ADR-014 §3` 참조
- [ ] ADR-002 §9: 표 삭제, `@see ADR-019 §3.3` 참조
- [ ] ADR-003 line 94: `X-OC-Signature` → `OC-Signature` (s/X-OC/OC/)
- [ ] ADR-003 line 13: "SAQ A" → "SAQ A-EP" + 공동 책임 매트릭스 추가
- [ ] ADR-004 §OC-Signature: HMAC 본문 삭제, 참조만
- [ ] ADR-005: DEK 섹션에 "PII DEK (per-tenant)" 라벨 + audit DEK 분리 언급
- [ ] ADR-006 §1: SLO 표 v1 숫자로 교체 + Toss carve-out 수식 명시
- [ ] ADR-007 line 48: SLO 숫자 제거, ADR-006 참조
- [ ] ADR-007 breach 섹션: T+24h (정통망법) / T+72h (PIPA) 이중 트랙 playbook
- [ ] ADR-009 §6 표: 신정법 3개월·상법 10년·전상법 5년 라인 추가
- [ ] ADR-009 §3: audit DEK는 crypto-shred 대상 아님 명시
- [ ] ADR-012: Scenario 2 결론 재작성 (guard-first)
- [ ] ADR-012: 모든 `APPROVED` 상수 → canonical enum + ACL 참조
- [ ] ADR-012 scen-address: label.purchased payload에 AddressSnapshot 스펙
- [ ] ADR-013 line 11: payment enum 7종으로 확장
- [ ] ADR-013 §concurrency: "label.purchased 이후 Address update non-propagating" 1줄
- [ ] ADR-014 line 162, 376: "10y" 앞에 "audit snapshot only" 명시
- [ ] ADR-014 line 284: DEK "PII DEK와 독립" 추가
- [ ] ADR-017: Safe Harbor 문언 재작성 (민사·형사 소송 비제기 한정), 정통망법 면책 문언 삭제
- [ ] PRD-v0 line 111: state machine 교체 (draft→pending_payment→paid→...→completed)
- [ ] PRD-v0 line 865: payment event 이름 canonical enum 기준 재정렬
- [ ] PRD-v0 §5-6-2: `retentionPolicy: "indefinite"` 삭제 → `fieldClass` 태그로 대체
- [ ] `packages/core/src/domain/payment/PaymentStatus.ts` 구현
- [ ] `packages/adapters-toss/src/TossPaymentStatusAcl.ts` 매핑 테이블 + 단위 테스트
- [ ] `application/policies/WebhookTransitionPolicy.ts` 선언적 매핑 + property-based test
- [ ] Architecture test: PII DEK KMS ARN과 Audit DEK KMS ARN이 다른 CMK임을 IAM policy로 검증
- [ ] CI gate: PAN regex가 postMessage 값에 등장하지 않음 (SAQ A-EP 근거)

---

## 7. Open Questions

1. **Payment `settled` 상태의 트리거**: T+N 정산 webhook을 Toss가 발행하지 않는 경우, 어떤 시그널로 `captured → settled` 전이시킬 것인가? (nightly reconcile cron vs 머천트 대시보드 수동 mark)
2. **`partially_refunded → refunded` 전이**: 누적 환불액이 원금과 같아지면 자동 전이할 것인가, 별도 이벤트 요구할 것인가? (UI 표시 차이)
3. **Audit DEK 두 번째 KMS 공급자**: PII DEK와 다른 region/vendor로 갈 것인가(blast radius 축소) vs 동일 공급자의 다른 CMK(운영 단순)?
4. **SLO ratchet 자동화**: 6개월 shadow 데이터 후 자동 상향(PR auto-generate) vs 분기 리뷰 gated?
5. **Order `canceled` post-delivery 거부 시 UX**: 머천트 대시보드에서 "환불로 처리 권고" linking을 어떤 섹션에 배치할 것인가?
6. **PCI SAQ A-EP 인증 비용**: QSA 실사 연 $40-80K Y1 감당 불가 시 self-attestation 범위 축소 vs GA 연기?
7. **Bug Bounty Safe Harbor 최종 문언**: HackerOne KR legal template이 없는 경우 국내 로펌과의 공동 작성에 소요되는 리드타임?

---

## 8. References

- `research/09-external-review.md` §"Cross-ADR 정규화 필수 항목" (line 126-156)
- 대법원 2011도4894 (정통망법 §48 형사처벌 면책 불가)
- RFC 6648 (Deprecating `X-` header prefix)
- PCI DSS v4.0 SAQ A-EP (2025-03 발효, 6.4.3/11.6.1)
- 개보법 §34 + 시행령 §39 (72h breach notification)
- 정통망법 §48-3 (24h KISA 통지)
- 상법 §33 (상업장부 10년)
- 전자상거래법 §6 시행령 (결제 기록 5년)
- 신정법 §17-2 (철회 후 분리보관 3개월)
- Vernon, *Implementing DDD* Ch.10 (Aggregate rules)
- Google SRE Book ch.3-4 (SLO + error budget carve-out)
