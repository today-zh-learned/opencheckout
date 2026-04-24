# ADR-014: Data Integrity (End-to-End)

- **Status**: Proposed
- **Date**: 2026-04-23
- **Last normalized**: 2026-04-24 (ADR-019)
- **aggregates_touched**: [AuditLog, Payment, Webhook]
- **Deciders**: Security Lead, Platform Team, Compliance Lead
- **Related**: PRD-v0 §5-6 (`audit.changeLog`, `source.rawResponseHash`), §6-5, §8
- **Sibling ADRs**: ADR-002 (Idempotency/Saga), ADR-003 (STRIDE — Tampering/Repudiation), ADR-004 (Authn), ADR-006 (Observability — tamper-evident audit), ADR-008 (Supply-chain), ADR-009 (PII)
- **Standards**: NIST SP 800-193 (Platform Firmware Resiliency), RFC 2104 (HMAC), RFC 8017 (PKCS#1 v2.2), RFC 5280 (X.509), RFC 3161 (TSP), EU eIDAS qualified timestamping, AWS S3 Object Lock (WORM 참조 구현), Sigstore (supply-chain)

## 1. Context

OpenCheckout는 결제·주소·관세 원장을 다루는 SDK. PRD v0 리뷰 차원 **7 (tamper-evident audit 없음)**, **8 (projection rebuild 절차 없음)**, **11 (공급망 SBOM 서명 없음)** 에서 무결성 결함이 지적됐다. 사용자가 "무결성까지 포함"을 명시적으로 요청했기에 보안 축(ADR-003)·감사 축(ADR-006)·공급망(ADR-008)에 흩어진 체크섬/서명 요구를 **단일 end-to-end 무결성 계약**으로 통합한다.

무결성 실패는 대부분 **탐지되지 않는 손상**으로 나타나고(silent corruption), 결제·관세 원장에서는 즉시 회계·규제 리스크로 연결된다. 탐지 장치 없이는 "오래된 버그인지, 내부자 조작인지, 외부 침해인지" 사후 구분 불가.

## 2. Decision

무결성을 **7개 차원**으로 분해하고, 각 차원에 (a) 알고리즘, (b) 저장 위치, (c) 검증 주기, (d) 위반 시 액션을 명시한다. 전 계층 **공통 불변식**: *"쓰기는 append-only, 읽기는 검증 후 사용"*.

### 2-1. 무결성 차원 분류

| # | 차원 | 기본 알고리즘 | 스코프 | 위반 시 |
|---|---|---|---|---|
| M | Message integrity | HMAC-SHA256, Ed25519 (고위험) | Webhook, API 요청 | 401/403 + 알림 |
| S | Storage integrity | SHA-256 체크섬 + 이중 저장 | `rawResponse`, 업로드 파일, 원장 row | `security.integrity_violation` |
| A | Audit log integrity | 해시체인 + Merkle root + OpenTimestamps | `audit_log`, `payment_ledger` | 체인 break → 즉시 page |
| T | Transaction integrity | outbox + idempotency + saga | 모든 상태변경 (ADR-002 참조) | saga compensation |
| U | Supply-chain integrity | Sigstore Cosign keyless, SBOM 서명 | npm 패키지 (ADR-008 참조) | 설치 차단 |
| F | File integrity | SRI SHA-384 | CDN 위젯, `tosspayments-sdk` | CSP block |
| C | Chain of custody | 접근 로깅 + 서명 감사 | PCI/PII 열람 | anomaly 감지 → 잠금 |

## 3. Message Integrity — Webhook 서명 규격

### 3-1. 헤더 포맷

```
OC-Signature: v1=<hex-hmac-sha256>,t=<unix-ts>,nonce=<base64url-32>,kid=<key-id>
OC-Timestamp: 1714012345
```

- `v1` — HMAC-SHA256(secret, `${t}.${nonce}.${rawBody}`) (RFC 2104)
- `t` — Unix seconds. 서버 시각과 **±300s 창** 밖이면 거절
- `nonce` — 32B random, base64url. `webhook:nonce:{merchantId}:{nonce}` Redis 24h 저장 → replay 차단
- `kid` — 머천트 secret **key_id**. 현행 키 + 이전 키를 동시에 accept 하는 **grace 7d** 로테이션 (신→구 순서로 검증)
- **서명 대상**: raw body 바이트. JSON re-serialize 금지 (key order/whitespace 차이가 서명 깨뜨림)

### 3-2. 고위험 작업: Ed25519 detached signature

대량 환불, 자동화된 환불 API, 분쟁 증빙 제출 등 **위험도 "high"** 엔드포인트는 HMAC 위에 **Ed25519 요청 서명**을 **추가** 요구(RFC 8032). 머천트가 공개키를 Gateway에 등록, 요청 시 `OC-Request-Signature: ed25519=<base64>`.

### 3-3. 검증 구현 (Node)

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(
  raw: Buffer,                          // req.rawBody — 절대 JSON.parse 결과 재직렬화하지 말 것
  header: string,
  secretsByKid: Record<string, string>, // { current: "...", previous: "..." }
  nonceStore: { seen(n: string): Promise<boolean>; mark(n: string, ttl: number): Promise<void> },
): Promise<void> {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const { v1, t, nonce, kid } = parts;
  if (!v1 || !t || !nonce || !kid) throw new IntegrityError("malformed_signature");

  const skew = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(skew) || skew > 300) throw new IntegrityError("timestamp_out_of_window");

  if (await nonceStore.seen(nonce)) throw new IntegrityError("replay_detected");

  const secret = secretsByKid[kid];
  if (!secret) throw new IntegrityError("unknown_kid");

  const expected = createHmac("sha256", secret)
    .update(`${t}.${nonce}.`)
    .update(raw)
    .digest("hex");

  if (!timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"))) {
    throw new IntegrityError("signature_mismatch");
  }

  await nonceStore.mark(nonce, 86_400);
}
```

### 3-4. 검증 구현 (Python)

```python
import hmac, hashlib, time
from typing import Mapping

def verify_webhook(raw: bytes, header: str, secrets: Mapping[str, str], nonce_seen, nonce_mark):
    parts = dict(kv.split("=", 1) for kv in header.split(","))
    v1, t, nonce, kid = parts["v1"], parts["t"], parts["nonce"], parts["kid"]
    if abs(time.time() - int(t)) > 300:
        raise IntegrityError("timestamp_out_of_window")
    if nonce_seen(nonce):
        raise IntegrityError("replay_detected")
    secret = secrets.get(kid)
    if not secret:
        raise IntegrityError("unknown_kid")
    expected = hmac.new(secret.encode(), f"{t}.{nonce}.".encode() + raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, v1):
        raise IntegrityError("signature_mismatch")
    nonce_mark(nonce, ttl=86_400)
```

## 4. Audit Log 해시체인 + Merkle + 외부 노테리

### 4-1. Row-level 해시체인

```sql
CREATE TABLE audit_log (
  seq           BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  actor         JSONB NOT NULL,
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_hash     BYTEA NOT NULL,
  row_hash      BYTEA NOT NULL,
  CONSTRAINT audit_log_hash_shape CHECK (octet_length(row_hash) = 32)
);

CREATE UNIQUE INDEX audit_log_prev_idx ON audit_log (tenant_id, prev_hash);
```

Trigger computes `row_hash = sha256(prev_hash || canonical_json(payload) || occurred_at_iso || actor || event_type)`. `prev_hash`는 동일 tenant의 직전 row의 `row_hash`. Genesis row는 `prev_hash = sha256("opencheckout:genesis:" || tenant_id)`.

```sql
CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger AS $$
DECLARE
  last_hash BYTEA;
BEGIN
  SELECT row_hash INTO last_hash FROM audit_log
    WHERE tenant_id = NEW.tenant_id ORDER BY seq DESC LIMIT 1 FOR UPDATE;
  IF last_hash IS NULL THEN
    last_hash := digest('opencheckout:genesis:' || NEW.tenant_id::text, 'sha256');
  END IF;
  NEW.prev_hash := last_hash;
  NEW.row_hash  := digest(
    last_hash ||
    convert_to(jsonb_canonical(NEW.payload)::text, 'UTF8') ||
    convert_to(to_char(NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USOF'), 'UTF8') ||
    convert_to(NEW.actor::text, 'UTF8') ||
    convert_to(NEW.event_type, 'UTF8'),
    'sha256');
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_chain_t BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();
```

### 4-2. 일일 Merkle root + 외부 노테리

- **매일 00:00 UTC** 스냅샷 잡이 전일 row들의 `row_hash`로 **Merkle tree** 구성(leaf order = `seq` asc). Root 32B를 `audit_log_snapshot(tenant_id, day, root, seq_from, seq_to, anchored_at, anchor_proof)`에 저장.
- Merkle root를 **OpenTimestamps**(RFC 3161 + Bitcoin) 또는 **Sigstore Rekor**(Cosign keyless)로 앵커. 수령한 proof는 `anchor_proof` JSONB 에 저장. 인증된 TSP 요구 고객은 eIDAS qualified TSA(예: Sectigo, GlobalSign) 사용.
- 2차 앵커로 동일 root를 **audit 전용 S3 bucket (Object Lock Compliance 모드, 10y, audit snapshot only)** 에 쓰기. 단일 노테리 다운 시에도 증거 유지.

### 4-3. 검증 CLI

`npx @opencheckout/verify-audit --tenant <id> --from <iso> --to <iso>` 가

1. `audit_log`에서 범위 rows를 가져와 chain을 **재계산**하고 `row_hash` 일치 확인
2. 해당 구간을 포함하는 `audit_log_snapshot` row 찾기 → Merkle proof 재계산
3. `anchor_proof` (OpenTimestamps `.ots` 또는 Rekor UUID)를 외부에서 재검증
4. 결과를 `{ verified: true, breaks: [], snapshots: [...] }` JSON으로 출력, exit code 0/1

break 발생 시 `seq` 범위 + diff 출력. 이 CLI는 규제기관/감사관에게 단독 제공 가능하도록 **DB 연결 없이 read-only replica dump만으로 동작**.

## 5. WORM Storage — Append-Only 강제

결제 원장과 감사 로그는 `UPDATE`/`DELETE`를 **DB 레벨에서 금지**. Application bug, 내부자 실수, SQL injection 어느 경로로도 과거 rewrite 불가.

```sql
-- 1) Row-level security: 전 tenant append-only
ALTER TABLE payment_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_ledger_insert ON payment_ledger
  FOR INSERT TO app_role WITH CHECK (true);
CREATE POLICY payment_ledger_select ON payment_ledger
  FOR SELECT TO app_role USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- UPDATE, DELETE 정책 없음 → 기본 deny

-- 2) 추가 방어: trigger 로 강제
CREATE OR REPLACE FUNCTION deny_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'WORM violation on %: table is append-only', TG_TABLE_NAME;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER worm_no_update BEFORE UPDATE ON payment_ledger
  FOR EACH ROW EXECUTE FUNCTION deny_mutation();
CREATE TRIGGER worm_no_delete BEFORE DELETE ON payment_ledger
  FOR EACH ROW EXECUTE FUNCTION deny_mutation();

-- 3) DBA 탈출구 차단: superuser 만 trigger DROP. 운영 계정은 RDS IAM 만.
REVOKE ALL ON FUNCTION deny_mutation FROM PUBLIC;
```

**Soft update 패턴**: 상태 변경 시 새 row INSERT(`version` bump), projection은 `SELECT DISTINCT ON (entity_id) ORDER BY version DESC`. PRD §5-6 §7의 `version`/`audit.changeLog` 설계와 호환.

## 6. `source.rawResponse` 체크섬

PRD §5-6 `source.rawResponseHash: string` 를 강제 규격화:

```ts
// @opencheckout/core/integrity
import { createHash } from "node:crypto";

export function rawResponseHash(raw: unknown): string {
  // canonical JSON: sort keys, no whitespace. JCS (RFC 8785) 준수.
  const canonical = jcs(raw);
  return "sha256:" + createHash("sha256").update(canonical).digest("hex");
}
```

- 저장 시 `rawResponseHash` 계산·기록
- 로드 시 재계산해 불일치면 **`address.rawResponse.tampered`** 이벤트 발생 + 해당 record `integrity_status='broken'` 마킹
- 마이그레이션 잡(locale 백필 등)은 `rawResponseHash` 검증 **선행**, 실패 시 스킵 & 리포트

검증 CLI: `npx @opencheckout/verify-raw-response --since <iso>` — 샘플링 1% + 최근 24h 전수.

## 7. SRI — CDN 위젯/외부 스크립트

PRD §4 D9의 CDN 배포 위젯과 `@tosspayments/tosspayments-sdk`는 SRI 강제.

```html
<script
  src="https://cdn.opencheckout.dev/widget/v1.4.2/widget.min.js"
  integrity="sha384-KyEz0q1S4l0ZrW3Bj9VzU8dP1yK2YqJcZ7n4m3lQ2X1JrQvCgXkQ9g5m7hT2f1sQ"
  crossorigin="anonymous"
  referrerpolicy="strict-origin"
></script>
```

- 릴리스 파이프라인(ADR-008)이 build artifact의 SHA-384를 계산하고 `widget-integrity.json` 을 Cosign 서명 후 `cdn.opencheckout.dev/widget/v{X.Y.Z}/integrity.sig` 에 공개
- 머천트 스니펫 생성기는 SRI hash를 항상 동반
- CSP: `script-src 'self' https://cdn.opencheckout.dev https://js.tosspayments.com 'strict-dynamic'` + `require-sri-for script`

## 8. DB 무결성 — 제약·복제본·백업

### 8-1. 스키마 제약

- **FK**: 전 도메인 참조에 ON DELETE RESTRICT (soft-delete는 app 레벨)
- **CHECK**: 통화 ISO 4217, 상태 enum, 금액 ≥ 0, ISO 3166 country, sha256 길이 32B
- **UNIQUE 복합키**: `(orderId, currency, amount)` (PRD §6-5 3튜플), `(tenant_id, idempotency_key)`
- **EXCLUSION**: 예약 시간 겹침 방지 등 필요 시 `btree_gist`

### 8-2. 복제본 무결성

- Postgres `data_checksums=on` (initdb 시) — 페이지 단위 손상 탐지
- `pg_checksums --check` 주 1회 cron → 실패 시 페이지 지도 출력 + SRE 호출
- Logical replication publisher 측 `wal_level=logical` + subscriber 측 **해시 비교 jobs** (`pg_checksums`에 더해 sampled row hash 비교 매주)

### 8-3. 백업 무결성

- PITR (WAL archiving) + 일 full snapshot
- `restore-drill` **매월 1회** 잡: 백업 → clean cluster → 무작위 10개 주문 검증(Merkle proof 포함 audit chain 재검증)
- 결과를 `#security-evidence` 채널에 posting. 월 1회 드릴 실패는 P1.

## 9. Message Queue 무결성

NATS/Kafka 메시지 record-level checksum:

```ts
type IntegrityEnvelope<T> = {
  v: 1;
  payload: T;
  hash: string;         // "sha256:<hex>" over canonical(payload)
  producer: string;     // signing identity
  sig: string;          // Ed25519 signature over `${hash}|${producer}|${ts}`
  ts: number;
};
```

Consumer는 (1) 서명 검증, (2) `hash` 재계산, (3) `(producer, nonce)` dedup 테이블 조회(ADR-002 idempotency와 공유). 실패 시 DLQ + `security.integrity_violation{source=mq}`.

## 10. Crypto Material 무결성

- **KMS**: AWS KMS / GCP Cloud KMS / HashiCorp Vault Transit 중 택일. 키는 **non-exportable**.
- **Envelope encryption** (ADR-005, ADR-009): per-tenant **PII DEK**(ADR-005 §5), KEK 은 KMS. DEK 로테이션 90d, 과거 DEK 는 decrypt-only. Audit DEK 는 PII DEK 와 독립된 별도 CMK 사용 — crypto-shred 대상 아님 (@see ADR-019 §3.7).
- **Attestation**: KMS 호출 시 `EncryptionContext` 로 tenant_id 바인딩 — 키 오남용 시 복호화 실패
- **Rotation 이벤트**는 audit chain 에 기록 (`security.kms.key_rotated`) 후 노테리 앵커
- **Key loss DR**: 최소 3개 region replica + ceremony 기반 복구(ADR-007 참조)

## 11. Signed API Requests (선택적 고위험)

고위험 엔드포인트(대량 환불, scope=`payments:refund` bulk, `admin:ledger:export`)는 **Ed25519 서명 요구**.

```ts
// 요청측
const body = JSON.stringify(payload);
const msg = `${method}\n${path}\n${tsSec}\n${nonce}\n${sha256(body)}`;
const sig = ed25519.sign(privKey, msg);
headers["OC-Request-Signature"] = `ed25519=${base64(sig)},pub=${pubKeyId},t=${tsSec},nonce=${nonce}`;
```

Gateway는 `pubKeyId`로 머천트 등록 공개키 조회 → 검증. 키는 **YubiHSM / Vault Transit / 머천트 HSM** 권장, 로컬 파일 키는 warning.

## 12. 파일 업로드 무결성

CN23/상업송장/분쟁 증빙 등 머천트 업로드 파일:

1. 클라이언트가 `sha256(file)`을 presigned URL 요청시 함께 제출
2. S3 `x-amz-content-sha256` 로 네이티브 검증 + `Content-MD5` 이중
3. 서버가 다운로드 후 **재계산** → 저장 row 의 `file_hash` 와 대조
4. **ClamAV / YARA** 악성파일 스캔 비동기 수행, 결과 `file_scan_status` (pending/clean/quarantined)
5. 격리된 파일은 별도 bucket (Object Lock, 내부 키) 로 이동 + 접근 차단

## 13. Integrity Violation 탐지·알림

모든 위반은 단일 이벤트 타입으로 수렴:

```ts
type IntegrityViolation = {
  type: "security.integrity_violation";
  at: string;                // ISO 8601
  source:
    | "webhook_hmac"
    | "raw_response_hash"
    | "audit_chain_break"
    | "merkle_proof_fail"
    | "worm_violation"
    | "file_hash_mismatch"
    | "mq_record"
    | "db_page_checksum";
  tenant_id?: string;
  evidence: Record<string, unknown>;   // seq range, expected/actual hash, nonce, etc.
  severity: "P1" | "P2" | "P3";
};
```

라우팅:

- **audit_chain_break**, **worm_violation**, **merkle_proof_fail** → 즉시 PagerDuty P1 + `#security-incidents` + 자동 read-only fallback(쓰기 차단) 고려
- **webhook_hmac** 단발 → 레이트 임계치 통과 전 WARN, 초과 시 P2
- **raw_response_hash** → 배치 리포트, 1% 초과 시 P2
- 전체는 audit_log 자체에도 append (메타-무결성)

## 14. Threat Model 매핑 (ADR-003)

| ADR-003 TB / STRIDE | ADR-014 제어 |
|---|---|
| TB2 **T** body 변조 | §6 rawResponseHash + §5 WORM payment_ledger |
| TB2 **R** 행동 부인 | §4 audit chain + Merkle + OpenTimestamps |
| TB3 **T** MITM amount 변조 | §3 webhook HMAC + Ed25519 (§11) |
| TB5 **T** 웹훅 payload 변조 | §3 OC-Signature 규격 |
| TB5 **R** 수신 부인 | §3 nonce store + §4 audit |
| TB6 **T** 관리자 액션 변조 | §5 WORM + §4 chain + §11 signed requests |
| TB6 **R** 관리자 부인 | §4 + dual control 로그 |

## 15. Consequences

### 긍정
- 탐지 가능성: silent corruption이 **시간 단위**로 탐지됨 (현재 상태: 탐지 장치 0)
- 법적 증거능력: OpenTimestamps/eIDAS 앵커로 **제3자 검증 가능한** 감사 증거 확보
- PCI DSS v4.0 10.3 (감사 로그 보호), 10.5 (무결성 모니터링) 요구 충족
- Breach 대응(ADR-007)에서 "어느 row 가 조작됐는가" 범위 한정 가능

### 부정
- Write latency: trigger hashing + KMS 호출로 **+5–15ms p95**
- 스토리지 오버헤드: audit row 당 64B + 일일 Merkle snapshot + OTS proof (~1KB/day/tenant)
- 운영 복잡도: Merkle job, 노테리 연동, restore drill 자동화 — SRE 공수
- **WORM은 legit 수정도 차단** — schema migration 은 새 버전 row 삽입 패턴으로 재설계 필요
- DBA 작업 경로 축소 (핫픽스 불가) → **인시던트 플레이북 필수**

## 16. Implementation Checklist

- [ ] `@opencheckout/integrity` 패키지: `rawResponseHash`, `verifyWebhook` (Node/Python/Go)
- [ ] Postgres: `data_checksums=on`, `pgcrypto`, `audit_log` trigger + WORM trigger 배포
- [ ] `jsonb_canonical` 확장 (JCS RFC 8785) 또는 app 레벨 canonicalizer
- [ ] Merkle snapshot job (daily 00:00 UTC) + OpenTimestamps client
- [ ] S3 Object Lock audit bucket (Compliance mode, 10y retention, audit snapshot only — Audit DEK는 PII DEK와 독립 CMK)
- [ ] `npx @opencheckout/verify-audit` CLI + `verify-raw-response` CLI
- [ ] CDN 위젯 SRI 파이프라인 + `widget-integrity.json` Cosign 서명
- [ ] KMS 키 로테이션 runbook + EncryptionContext 표준
- [ ] `restore-drill` 월 1회 cron + 결과 자동 포스팅
- [ ] PagerDuty P1 route: `security.integrity_violation{severity=P1}`
- [ ] `pg_checksums` 주 1회 cron + subscriber 해시 비교 잡
- [ ] Threat model(ADR-003) 매핑 표 유지 (이 ADR §14)

## 17. Open Questions

- **Q1** OpenTimestamps(무료, Bitcoin confirm 수시간) vs eIDAS qualified TSA(유료, 즉시) 중 기본값? → **기본 OpenTimestamps + 엔터프라이즈 플랜 eIDAS** 제안, 검토 필요
- **Q2** Merkle tree의 **테넌트 분리**: tenant별 독립 vs 전역 tree? 규제상 분리가 안전하나 비용↑. 기본 tenant별.
- **Q3** `rawResponse`의 GDPR 충돌(리뷰어 지적): hash는 유지하되 본문은 **crypto-shred** 시 폐기(ADR-009)로 분리. Hash 만 남은 경우의 검증 UX 정의 필요
- **Q4** 머천트 공개키(Ed25519) 등록 플로우 — 콘솔 UI? API? 로테이션 grace? (TB5 세부는 ADR-004)
- **Q5** WORM 하의 **schema migration 전략** — 신규 컬럼 add는 OK, semantic 변경은 projection rebuild(TDD-02)로 강제
- **Q6** 공공 Juso API가 TLS pinning 을 깰 경우(CA 전환)의 핀 로테이션 문서화 책임자
- **Q7** MQ 메시지 서명의 producer 신원 모델 — 서비스 계정별 Ed25519 키 → Vault Transit 관리 여부

## 18. References

- RFC 2104 — HMAC
- RFC 8032 — Ed25519
- RFC 8785 — JSON Canonicalization Scheme (JCS)
- RFC 3161 — Time-Stamp Protocol
- RFC 5280 — X.509
- RFC 8017 — PKCS#1 v2.2
- NIST SP 800-193 — Platform Firmware Resiliency
- EU eIDAS — Qualified electronic timestamps
- AWS S3 Object Lock — WORM reference
- Sigstore / Rekor / Cosign — transparency log + keyless signing
- OpenTimestamps — Bitcoin-anchored timestamping
- PCI DSS v4.0 §10.3, §10.5 — audit log protection & integrity monitoring
