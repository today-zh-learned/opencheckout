# ADR-007: Disaster Recovery & Incident Response

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-04-23 |
| **Last normalized** | 2026-04-24 (ADR-019) |
| **aggregates_touched** | [Payment, Address, Order] |
| **Deciders** | ziho.shin (product/eng), reviewer agent (red team) |
| **Consulted** | AWS Well-Architected Reliability Pillar, Google SRE Workbook Ch.9/12, GDPR Art.33/34, PCI DSS v4.0 §12.10, ISO 27001:2022 A.5.29/A.5.30 (was A.17), KISA 개인정보보호법 제34조, 정보통신망법 §48-3 |
| **Related** | PRD-v0 §4 (D5 상태기계, D9 Gateway/DB), §5-6 (Canonical Record), §6-3 (고위험 플로우), §8-3 (관측성), ADR-002 (Idempotency/Saga), ADR-003 (STRIDE), ADR-005 (Multi-tenancy/KMS), ADR-006 (Observability — SLO canonical), ADR-019 (Cross-ADR Normalization) |
| **Supersedes** | — |

---

## Context

`research/08-technical-review.md` dimension 9 rated the v0 PRD **🔴 on DR/IR** ("결제 데이터를 보관하는 시스템의 DR plan이 0자"). OpenCheckout는 결제 confirm path를 따라 토스페이먼츠 승인 토큰 + 주소 PII + KMS DEK + webhook ledger를 보유한다. 이 중 단 하나라도 복구 실패하면 머천트는 **주문-결제 불일치** (double charge or lost capture) 또는 **GDPR Art.33 72h breach notification 위반** 리스크에 노출된다.

본 ADR은 v1 릴리스 게이트로서 다음 7개를 계약한다:
1. 컴포넌트별 RTO/RPO
2. PITR + 백업 정책 (3-2-1 규칙)
3. Multi-region active/passive 토폴로지
4. KMS DR (tenant DEK 손실 시나리오 포함)
5. GDPR Art.33/34 72h breach playbook
6. Incident Severity Matrix + Runbook 템플릿
7. Chaos engineering + Compliance mapping

## Decision Drivers

- **Payment confirm path는 recovery-first 설계**. 승인 직후 outbox flush 전 장애 시 idempotency 재구동만으로 복구 가능해야 함 (ADR-002 연계).
- **PII/DEK는 loss > leak**. 키 손실 시 복호화 불가 → 머천트 통보 + re-encryption jobs가 계약 SLA.
- **Korean/EU dual regime**. GDPR 72h + 한국 개인정보보호법 제34조 (지체 없이 통지, 72h 기준 정렬).
- **self-host first** (D9). 플레이북은 Fly.io / K8s / bare-metal 모두에 이식 가능해야 함.

## Decision

### 1. RTO/RPO Matrix (컴포넌트별)

| 컴포넌트 | RTO | RPO | 정당화 | Degraded mode |
|---|---|---|---|---|
| **결제 confirm path** (`/v1/confirm`, webhook receiver, outbox flusher) | **30 min** | **5 min** | Toss 승인 직후 소실 = 이중청구/미청구 → outbox sync replica + WAL 5분 lag 상한 | 읽기 차단, confirm-only write with Toss replay |
| **Address lookup / canonicalization** (juso, Google Places, canonical record read) | **4 h** | **1 h** | 조회 일시 중단은 매출 손실이나 복구 가능. 캐시 + fallback provider로 degrade | stale cache + provider fallback chain |
| **Admin console** (merchant dashboard, audit viewer) | **24 h** | **1 h** | 내부 운영 도구. read-only status page로 대체 | 읽기전용 + 수동 CLI |
| **FX 환율 캐시** (수출입은행 daily rate × 1.10) | **1 h** | **0** | 재조회 가능 (stateless). downstream pricing만 잠깐 freeze | 전일 환율 + 10% buffer 확대 |
| **Event store / projections** | 4 h | 5 min | Outbox + LISTEN/NOTIFY 재구동, projection rebuild은 TDD-02 절차 | 신규 projection 읽기 지연 |
| **KMS master** | 15 min (region failover) | 0 (multi-region replica) | 키 불가 = 전체 복호화 중단. AWS KMS multi-region keys / GCP KMS multi-region location 사용 | none — hard dependency |
| **Webhook queue** (Toss → OpenCheckout) | 1 h | 5 min | At-least-once + dedup. Toss 측 재전송 정책과 정합 | Toss replay window 72h 활용 |

> **ADR-019 정규화 적용 (2026-04-24)**: SLO 숫자는 **@see ADR-006 §1** canonical. v1 confirm path availability는 99.5% (gateway-local, Toss carve-out 포함). 기존 99.95% 수치 제거.

SLO 연계 (ADR-006 §1): v1 confirm path availability 99.5% monthly (gateway-local) → downtime budget ~3.4h. RTO 30 min은 단일 인시던트 기준 여유 보장.

### 2. Point-In-Time Recovery (PITR)

- **Postgres WAL 보관**: **14일** (PRD §6 언급된 민감 잡 retention과 정렬).
- **Archival target**: 별도 AWS 계정의 S3 (object-lock 14d compliance mode) + 별도 리전 (ap-northeast-2 primary → ap-northeast-1 mirror).
- **복구 리허설**: **분기별 (Q1/Q2/Q3/Q4)** 1회, staging PITR → 무작위 타임스탬프 → 데이터 diff 리포트. 책임자 rotation.
- **Synthetic transaction anchor**: 매 시간 canonical test tenant에 probe 결제 1건 기록 → PITR 대상시점 바로 앞뒤로 존재/무존재 검증.
- **Max data loss budget**: confirm path 5 min RPO는 WAL streaming replication (sync) + archive_timeout=60s로 실현.

### 3. Backup 전략 — `pgbackrest` + 3-2-1 규칙

| 구분 | 주기 | 보존 | 위치 |
|---|---|---|---|
| Full backup | 주간 (일요일 02:00 KST) | 8주 | Primary region S3 + separate account |
| Incremental | 일간 (매일 02:00 KST) | 14일 | Primary region S3 |
| Differential | 6시간 | 48h | Primary region S3 |
| Off-region copy | 일 1회 replicate | 30일 | Secondary region (ap-northeast-1) |
| Cold / offline | 월 1회 | 1년 (GDPR deletion policy 정렬) | Glacier Deep Archive (separate AWS account, MFA delete) |

**3-2-1**: 3 copies (prod + S3 + Glacier), 2 different media (block + object), 1 offsite (secondary region + separate account). Backup encryption key는 DEK와 **분리된 CMK**로 암호화 — 백업 유출시 DB key 영향 격리.

Integrity: `pgbackrest check` nightly + monthly restore drill (랜덤 backup 1개 staging 복원 → smoke test 50문항).

### 4. Multi-region Active/Passive

| 항목 | Primary | Standby |
|---|---|---|
| Region | Seoul (ap-northeast-2) | Tokyo (ap-northeast-1) |
| Postgres | Primary (writable) | sync streaming replica + 5min WAL archive |
| KMS | AWS KMS Seoul primary | Multi-region replica key Tokyo |
| Gateway (Hono/Node) | 3 AZ, active | 1 AZ warm standby, 30% capacity pre-provisioned |
| DNS | Route53 weighted 100/0 | Health-check triggered failover → 0/100 |
| Toss webhook endpoint | `api.opencheckout.io` | same FQDN, DNS flip |

**Failover trigger**: Primary Postgres unreachable 3 min OR confirm path 5xx rate > 50% for 5 min.

**Degraded read-only mode** (failover 초기 0–30분):
- 신규 confirm 거부 (429 + `Retry-After: 300`)
- 기존 session 조회, address lookup, webhook replay 허용
- Toss 재인증 위젯 일시 비활성화 (머천트에 status page 표시)
- 30분 내 primary 복구시 reverse 자동, 아니면 Tokyo promote

**Failover 리허설**: 반기 1회 (H1/H2) full region failover, 분기 1회 DNS-only drill.

DNS TTL 60s. 머천트 SDK는 재시도 정책 내장 (exponential backoff, idempotency-key 보존 → ADR-002).

### 5. KMS DR & Tenant DEK 손실 시나리오

#### 5-1. Master key multi-region 복제
- AWS KMS multi-region keys (mrk-…) or GCP KMS multi-region location.
- CMK 정책: IAM + separate key admins (break-glass 4-eye).
- 자동 로테이션 1년, 수동 early rotation on suspected compromise.
- CMK 삭제 pending window **30일** (AWS 기본). 이 기간 monitoring alert 필수.

#### 5-2. 지역 장애 페일오버
- Primary region KMS API 장애 감지 시 Gateway가 secondary region KMS endpoint로 switch (SDK에 region list 주입).
- 대상 RTO: 15 min (automated). 인증서/IAM 정책은 양 리전 pre-provisioned.

#### 5-3. ★ Tenant DEK 손실 시나리오

Envelope encryption (PRD §5-6-5 / ADR-005): `plaintext → DEK → ciphertext`, `DEK → CMK-encrypted → wrapped_dek column`.

**DEK 손실 경로**:
(a) `wrapped_dek` DB 레코드 물리 손상 (백업 전)
(b) CMK 정책 오설정으로 decrypt 영구 거부
(c) 머천트 요청 crypto-shred (right to erasure) — 의도된 손실, 별도 처리

**Recovery 불가 확정시 (a, b) 대응**:
1. **T+0**: Sev-1 자동 오픈, CTO + CSO 페이지.
2. **T+1h**: 영향 tenant 식별 (wrapped_dek lineage 조회). 영향 열 = `address.taxIdentifiers[].value`, `recipient.email` 암호화 컬럼.
3. **T+4h**: 영향 머천트에 `breach/key-loss` notification (GDPR Art.34 — high risk라면 data subject 직접 통보 병행).
4. **T+24h**: 새 DEK 발급 (`key_rotation_job`) → 해당 tenant 레코드 중 평문 원본이 살아있는 것만 re-encrypt. 원본 없는 PII는 **unrecoverable** 마킹 → 머천트에 복구 기한/불가 범위 제시.
5. **T+72h**: 감독기관 통보 (GDPR Art.33 / 한국 KISA 개보법 제34조 지체 없이).
6. Postmortem within 5 business days. Root-cause fix + replay-safe DEK 이중 보관(staged rollout) 도입 검토.

**예방**:
- `wrapped_dek`는 PITR + 주간 백업에 **plain schema로 포함** (암호화는 CMK로, DEK 자체는 백업에 존재 보장).
- `wrapped_dek` 테이블은 `DELETE` 금지 (soft delete + tombstone). crypto-shred는 CMK 권한 박탈 방식 (wrapped_dek를 복호화할 권한 제거) — 물리 삭제 금지.
- CMK 정책 변경은 Terraform + 2-reviewer + dry-run decrypt sample 필수.

> **ADR-019 정규화 적용 (2026-04-24)**: Tenant PII DEK destroy는 **2인 승인 + 7-30d grace window** (`active → retired → pending-destruction → destroyed`). Audit DEK는 **별도 KMS CMK** (ADR-019 §3.7) — PII DEK destroy job은 audit CMK에 ARN-level IAM으로 접근 불가. PII 삭제가 audit hash chain(ADR-014)을 깨뜨리지 않음.

### 6. GDPR Art.33/34 Breach Response Playbook (72h)

> **ADR-019 정규화 적용 (2026-04-24)**: KR breach notification은 **이중 SLA 병렬 트랙** (정통망법 §48-3 24h + PIPA §34/시행령 §39 72h). T+24h 누락은 정통망법 §49 형사처벌까지 확대 가능 (ADR-019 §3.12).

| 시점 | 활동 | 책임 | 산출물 |
|---|---|---|---|
| **T+0** | 탐지 (SIEM alert, user report, anomaly detection) | on-call SRE | incident ticket (PagerDuty) |
| **T+1h** | Triage: severity 판정, breach 여부 pre-assessment | IC + CSO | severity tag, isolation 조치 (network quarantine, token revoke) |
| **T+4h** | 증거 보존 (snapshot, audit log export, tamper-evident seal — ADR-006) | Forensics lead | chain-of-custody ledger |
| **T+24h** ★ | **KR 트랙-A**: KISA 통지 (정통망법 §48-3) — 1,000명 이상 또는 민감정보 유출 시 | DPO + legal | KISA 통지 문서 |
| **T+24h** | 영향 평가: affected records 수, PII 카테고리, 국경간 이동 여부 | CSO + DPO | impact memo (internal) |
| **T+48h** | 내부 보고 (CEO + legal + affected merchants short list) | DPO | exec brief, 머천트 사전 통보 (controller 역할 고지) |
| **T+72h** ★ | **GDPR 트랙 + KR 트랙-B**: GDPR Art.33 관할 DPA + 개보위 통지 (PIPA §34 + 시행령 §39) | DPO + legal | 통보 문서 (영향 정보 유형, 규모, 조치, 연락처) |
| **T+5d (영업일)** | 정보주체 통지 (PIPA §34) + Art.34 high-risk subject 통보 | DPO | subject notice + status page post |
| +5 bd | Post-incident report, 머천트/공개 커뮤 | IC | postmortem + remediation backlog |

**Controller vs Processor**: OpenCheckout self-host의 경우 머천트가 controller, OpenCheckout 호스티드 서비스는 processor. Processor 의무 (Art.33(2)): controller에 "지체 없이" 통지. 계약상 **24h 내 머천트 통지** 약정.

**한국 개인정보보호법 제34조**: 1,000명 이상 영향 또는 민감/고유식별정보 포함 시 개인정보보호위원회 + KISA 통지, 5일 이내 서면 의무. GDPR 72h와 엄격한 쪽 적용.

### 7. Incident Severity Matrix

| Sev | 정의 | 예 | RTO 대상 | Escalation (15 min 이내) | On-call |
|---|---|---|---|---|---|
| **Sev-1** | 전사 장애, 결제 중단, 데이터 유출 의심, KMS 불가 | 전 리전 DB down, DEK 손실, Toss API 완전 차단 | 30 min | CTO + CSO + CEO + 법무 | 1차+2차 SRE + IC + comms |
| **Sev-2** | 주요 기능 저하, 단일 리전 장애, 부분 결제 실패 | Seoul AZ 1개 장애, webhook receiver 5xx > 20% | 2 h | Eng Director + CSO | 1차 SRE + IC |
| **Sev-3** | 지엽적 기능 저하, 비즈니스 논리 버그, 성능 저하 | 특정 캐리어 validator 오류, admin console 느림 | 1 bd | Team lead | 1차 SRE (업무시간) |
| **Sev-4** | 문서 오류, 단일 사용자 이슈, 모니터링 노이즈 | typo, single tenant bug | 5 bd | — | ticket only |

Escalation gates: 15 min 내 응답 없으면 자동 한 단계 승격. Status page 업데이트는 Sev-1/2는 15 min 이내 의무.

### 8. Runbook Templates

각 runbook은 `docs/runbooks/` 하위, 표준 헤더 (symptoms → verify → act → validate → rollback → postmortem trigger).

#### 8-1. `rb-db-failure.md` — Postgres primary 장애
1. **Verify**: `pg_isready`, replication lag check, CloudWatch RDS metrics.
2. **Triage**: AZ 장애 vs disk full vs query storm.
3. **Act**: standby promote (`pg_ctl promote` or managed failover), DNS update, outbox resume.
4. **Validate**: confirm path synthetic probe green, WAL lag < 5s.
5. **Communicate**: status page Sev-2, merchant webhook backpressure notice.

#### 8-2. `rb-toss-outage.md` — Toss Payments API 장애
1. Detect: confirm latency p95 > 10s or 5xx > 10%.
2. Act: circuit breaker open (ADR-006), user-facing "결제 재시도" UI, queue pending confirms with `Idempotency-Key` (ADR-002).
3. Merchant comms via SDK status endpoint.
4. Backfill: Toss 복구 후 dead-letter queue replay (idempotency 보장).
5. Validate: DLQ drain to 0, reconciliation diff report = 0.

#### 8-3. `rb-kms-failure.md` — KMS 불가
1. Detect: KMS `Decrypt` error rate > 1%.
2. Act: failover to secondary region KMS endpoint (Gateway env var swap + deploy).
3. If MRK unavailable: halt encrypt ops (confirm 차단), allow decrypt via cached DEK (short TTL) — no new DEK writes.
4. Escalate: Sev-1, CSO 즉시 파싱.
5. Validate: Decrypt sample test, 신규 tenant 생성 smoke.

#### 8-4. `rb-suspected-breach.md` — 데이터 유출 의심
- Trigger: anomalous read volume, exfil signature (S3 public rule change, DB dump query), threat intel hit.
- Step 1: 네트워크 격리 (suspect host quarantine), 모든 세션 토큰 revoke, API key rotation broadcast.
- Step 2: Forensics snapshot (RDS snapshot + EBS + audit log export, WORM S3).
- Step 3: Counsel 참여 (attorney-client privilege 보호 하에 조사).
- Step 4: GDPR 72h playbook (§6) 진입.

#### 8-5. `rb-ransomware.md` — 랜섬웨어
1. **Do NOT pay** — 법무 상의 없이 금지.
2. 격리: 영향 네트워크 세그먼트 단절, IAM credential mass rotation, CI/CD lock.
3. 복구: 격리 환경에서 백업 복원 (3-2-1의 offsite copy 사용), PITR 최신 clean point 선택.
4. Forensics: indicator collection, CISA/KISA 신고 (법적 의무시).
5. Rebuild: 감염 자원 re-image, re-key. 백업 복원 전 malware scan 필수.

### 9. Chaos Engineering

**분기별 (Q1–Q4) game day**, 사전 공지 48h, failure budget 내 실시. 운영팀과 dev팀 교차 참여.

| 분기 | Fault | 기대 결과 |
|---|---|---|
| Q1 | Postgres primary kill (AZ-level) | standby promote ≤ 10 min, confirm RPO ≤ 5 min |
| Q2 | Toss API 503 injection (sandbox fault proxy) 30 min | circuit breaker, DLQ drain = 0, zero duplicate charge |
| Q3 | KMS 503 + slow decrypt (500ms added) | secondary region failover, p95 confirm ≤ 3s |
| Q4 | Full region failover (Seoul → Tokyo) + synthetic PITR restore | RTO 30 min, RPO 5 min, degraded read-only 동작 |

Continuous fault injection (daily in staging): connection drop (5%), slow disk (+100ms p99), clock skew (±2s). `toxiproxy` + `chaos-mesh` 기반.

### 10. Compliance Mapping

| 요구사항 | 본 ADR의 대응 섹션 |
|---|---|
| **ISO 27001:2022 A.5.29 / A.5.30** (ICT readiness for business continuity, formerly A.17) | §1 RTO/RPO, §4 multi-region, §9 rehearsal |
| **PCI DSS v4.0 §12.10** (Incident Response Plan) | §6 playbook, §7 severity matrix, §8 runbooks, §9 chaos |
| **PCI DSS v4.0 §12.10.1** (IRP testing annually) | §9 Q4 game day (연 1회 full failover = 테스트) |
| **GDPR Art.32** (security of processing) | §3 backup encryption, §5 KMS multi-region |
| **GDPR Art.33** (72h supervisory authority notification) | §6 T+72h |
| **GDPR Art.34** (data subject notification) | §6 post T+72h row |
| **한국 개인정보보호법 §34** (유출통지) | §6 T+48h/T+72h 병행, §5-3 tenant DEK 손실 시나리오 |
| **한국 정보통신망법 §48-3** (침해사고 통지) | §6 KISA 라인 |
| **SOC 2 CC7.3 / CC9.1** (availability, BCP) | §4 multi-region, §9 chaos |

## Consequences

**긍정**
- PRD red-team 차원 9 🔴 해소. v1 릴리스 게이트 통과 가능.
- Tenant DEK 손실이라는 envelope encryption 고유 리스크가 playbook화 → 머천트 계약서에 SLA 근거로 인용 가능.
- 분기 chaos + 분기 PITR drill로 문서가 runtime evidence로 증명됨.
- Compliance mapping은 SOC 2 / ISO 27001 감사 대응 시 1:1 매핑 근거로 재사용.

**부정 / 비용**
- Multi-region active/passive: 인프라 비용 ~1.7× (standby 30% warm + full replica storage).
- 분기 chaos + PITR drill: SRE 인력 4인일/분기 고정 소비.
- 14일 WAL + 8주 full backup: 스토리지 비용 증가 (~연 수백만원, 머천트 볼륨 의존).
- Multi-region KMS multi-region key: AWS KMS 요금 리전별 별도 과금.

**트레이드오프**
- "active/passive" 채택 (not active/active). Active/active는 write conflict resolution (CRDT/consensus) 난이도 ↑, confirm path의 exactly-once 요구와 충돌. V2에서 read-heavy 서비스만 active/active 검토.
- RPO 5 min은 sync replication 지연 비용을 감수. Async로 완화 시 confirm RPO 30 min 수준 상승 — 허용 불가.

## Checklist (릴리스 전)

- [ ] Postgres WAL archive 14d retention 활성화 (check: `archive_command` + S3 object-lock)
- [ ] `pgbackrest` full-weekly + incr-daily cron 배포 및 2주간 grace monitoring
- [ ] PITR 분기 리허설 스케줄 캘린더 등록 (Q1/Q2/Q3/Q4 고정일)
- [ ] Multi-region KMS MRK 생성 + Gateway dual-region endpoint wiring
- [ ] Route53 health check + failover policy, TTL 60s
- [ ] Tokyo standby warm capacity provision (30%) + daily sync check
- [ ] PagerDuty Sev matrix rotation 등록 (L1/L2/L3 + CSO + DPO)
- [ ] Status page 도입 (public) + breach communication template 승인
- [ ] Runbooks 5종 작성/리뷰 (`rb-db-failure`, `rb-toss-outage`, `rb-kms-failure`, `rb-suspected-breach`, `rb-ransomware`)
- [ ] `toxiproxy` + `chaos-mesh` staging 환경 세팅
- [ ] GDPR/KISA 통지 문서 템플릿 법무 검토 완료
- [ ] Tenant DEK loss scenario tabletop exercise (1회) 수행
- [ ] 머천트 DPA (data processing agreement) 에 24h 통지 조항 반영
- [ ] Backup encryption separate CMK 구성 (key separation)
- [ ] WORM S3 (object lock compliance mode) audit log export target 확보 (ADR-006 연계)

## Open Questions

1. **Self-host merchant의 DR 책임 분계**: OpenCheckout self-host 배포 시 백업/리허설 책임은 머천트? 계약 + docs 에 명시 필요.
2. **Toss 측 replay window 공식 SLA**: Toss webhook 재전송 72h 근거가 공식 문서 기반인지 확인 (`research/05-toss-payments-fx.md`) — 상이하면 our RTO 재조정.
3. **EU lead supervisory authority**: 호스티드 서비스 EU 진출 시 representative establishment 어디? Ireland(DPC) vs France(CNIL) 후보.
4. **Ransomware 법적 통보 의무 범위**: CISA 신고 의무 (미국 영향 시) vs KISA 신고, cross-border 사건 어느 법역 우선 적용?
5. **Active/active 전환 트리거**: GMV/요청량 어느 임계에서 regional active/active 투자? V2 ADR 분리 예정.
6. **Backup 암호화 CMK 손실 시**: 3-2-1의 offsite copy 또한 같은 CMK 패밀리라면 단일장애점. 별도 HSM 백업 키 에스크로 필요 여부.
7. **Subprocessor 연쇄 breach**: Google Places / Kakao / 수출입은행 측 breach 통지 받을 경우 72h 카운트 시작점 — contractual propagation clause 필요.
8. **Synthetic transaction probe의 Toss 요금 영향**: 매시간 sandbox만으로 충분한지, 일부 prod probe 필요한지 재무 확인.

---

*References*: AWS Well-Architected Framework — Reliability Pillar (2026 rev), Google SRE Workbook Ch.9 (Incident Response) Ch.12 (Disaster Planning), GDPR Arts. 32/33/34, PCI DSS v4.0 (2025-03 effective), ISO/IEC 27001:2022 Annex A controls 5.29–5.30, 한국 개인정보보호법 (2024 개정) 제34조, 정보통신망법 제48-3조.
