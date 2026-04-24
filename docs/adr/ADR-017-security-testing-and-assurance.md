# ADR-017: Security Testing & Assurance Program

- **Status**: Proposed
- **Date**: 2026-04-23
- **Last normalized**: 2026-04-24 (ADR-019)
- **aggregates_touched**: []
- **Deciders**: Security Lead, CISO (권한위임), Platform Lead, Compliance Lead, Release Engineering
- **Related**: PRD-v0 §4 D7 (PCI SAQ A), §11 (품질), §14 Phase 1
- **Sibling ADRs**: ADR-003 (STRIDE), ADR-004 (Authn/Authz), ADR-007 (Incident Response), ADR-008 (Supply-chain), ADR-009 (PII/Privacy), ADR-014 (Data Integrity)
- **Standards**: PCI DSS v4.0, OWASP ASVS v4.0 L2, OWASP SAMM 2.0, NIST SSDF (SP 800-218), BSIMM14, SOC 2 TSC 2017, ISO/IEC 27001:2022, RFC 9116 (security.txt), CVSS v4.0

## 1. Context

ADR-003/004/008/014는 각각 **개별 방어선**(위협 모델, 인증, 공급망, 무결성)을 정의한다. 그러나 "방어책이 실제로 작동하는가"를 **지속적으로 증명**하고, "침해가 발생하면 어떻게 대응하는가"를 **프로그램 수준**에서 규정하는 상위 문서는 없다. 금융 SaaS로서 OpenCheckout는 PCI DSS v4.0(2025-03 발효), 향후 SOC 2 / ISO 27001 / K-ISMS 감사 대상이 될 것이며, 머천트 실사(vendor due-diligence)에서 **테스트·감사·대응 프로그램 증빙**을 요구받는다.

이 ADR은 방어 결정이 아니라 **보증(assurance)** 결정이다. 즉 "SDLC 전체에서 어떤 테스트를, 어떤 주기로, 누가, 어떤 증거를 남기며 실행하는가"를 정의한다.

## 2. Decision

OpenCheckout는 OWASP SAMM 2.0 Level 2(성숙도 "managed")와 NIST SSDF 핵심 practice를 기준선으로, 다음 **9개 축**의 통합 보안 보증 프로그램을 채택한다: (1) Testing Pyramid, (2) Bug Bounty, (3) PCI DSS v4.0 compliance, (4) Certification roadmap, (5) Security regression tests, (6) Review cadence, (7) Security Champions, (8) Secret detection, (9) IR exercises. 모든 활동은 증거(artifacts)를 생성하고 `docs/assurance/` 경로에 보관한다.

## 3. Security Testing Pyramid

비용이 낮고 자주 돌릴 수 있는 테스트를 바닥에, 연간 수행되는 비싼 테스트를 꼭대기에 배치.

| Layer | Tool | Scope | Cadence | Gate |
|---|---|---|---|---|
| SAST | Semgrep OSS (`p/owasp-top-ten`, `p/typescript`, `p/nodejs`, `p/secrets`) + GitHub CodeQL | 전 코드베이스 | 모든 PR | blocker on HIGH+ |
| SCA | Dependabot + Socket.dev + Snyk CLI | 의존성 graph | PR + weekly full | blocker on CRITICAL |
| Secret scan | Gitleaks + GitHub push protection + TruffleHog | git history | pre-commit + PR | blocker |
| DAST | OWASP ZAP baseline / full / Burp Suite Enterprise | `api.opencheckout.dev` sandbox | baseline PR / full nightly / Burp quarterly | non-blocking alert |
| IAST | Contrast Security (optional, 엔터 라인용) | instrumented runtime | 상시 | telemetry only |
| Pentest | 외부 벤더 (e.g. NCC, Cure53, raxis) | 전체 프로덕션 (read-only) | 분기별 + 연간 중대 릴리스 전 | blocker: Critical/High fix before GA |
| Red Team | 외부 contracting | full-scope TIBER-like | 연 1회 | plan update |

**IAST는 v1 필수 아님** — OSS 배포는 instrumentation 인젝션 부담이 있어 옵션으로 유지.
**Pentest SoW 표준화**: STRIDE(ADR-003)에 맵핑된 checklist + PCI 6.4.3/11.6.1 scoped rules + ADR-014 무결성 번들 검증.

## 4. Bug Bounty Program

- **Platform**: HackerOne (primary) — GitHub Security Advisory는 CVE 발행 전용.
- **In-scope**: `api.opencheckout.dev`, `checkout.opencheckout.dev`, `@opencheckout/*` npm/JSR 패키지 **최신 3 minor**, sandbox 환경.
- **Out-of-scope**: DoS/volumetric, 물리·사회공학, 취약점 스캐너 원시 출력, rate-limit bypass w/o impact, 이미 공개된 CVE.
- **Rewards**: Critical $5,000 / High $1,500 / Medium $500 / Low $100. Duplicate `50%`. Chain-bonus: 2+ 취약점 체인 시 `125%`.
- **Safe Harbor**: researcher가 정책을 따를 경우 **민사 소송 비제기** (민사 한정). 정통망법 §48 형사처벌 조항은 사인 간 계약으로 면책 불가 — 형사 면책 문언 사용 금지(대법원 2011도4894). 고의적 데이터 유출·파괴·서비스 방해는 제외. (@see ADR-019 §3.12, SECURITY.md)
- **SLA**: triage 2영업일, validated 5영업일, reward 10영업일, disclosure 90일(기본).
- **Hall of Fame**: 월 1회 `security.opencheckout.dev/hall-of-fame` 업데이트 (researcher opt-in).
- **Private program phase**: 론칭 후 3개월은 invited-only (50명) → 이후 public.

## 5. PCI DSS v4.0 Compliance

| 요건 | 달성 방법 | 증거 |
|---|---|---|
| SAQ A-EP 경계 | ADR-003 iframe hosted fields + postMessage allowlist. SAQ A-EP 적용: merchant JS가 결제 페이지에 함께 로드됨 (@see ADR-019 §3.12) | DFD + SAQ A-EP questionnaire |
| 6.4.3 script inventory | CI job이 빌드 시 `scripts.manifest.json` 생성 + 서명 | manifest + SBOM (ADR-008) |
| 11.6.1 tamper detection | CSP `report-uri` + SRI(SHA-384, ADR-014 §F) + weekly hash-diff 모니터링 | `security.tamper_alert` 로그 |
| 10.x audit log | ADR-014 hash-chain + OpenTimestamps → PCI 12개월 보존 초과 달성 | audit_log Merkle root daily |
| 12.10 IR 플레이북 | ADR-007 | 연 1회 tabletop + drill report |
| ASV 외부 스캔 | 연 1회 + 주요 변경 후 (Qualys / Trustwave) | ASV report + attestation |
| SAQ A self-cert | 연간 self-assessment questionnaire + 머천트 공개 attestation | `compliance/pci-saq-a-YYYY.pdf` |

## 6. Compliance Certifications 로드맵

| Year | 목표 | 비고 |
|---|---|---|
| Y1 (2026) | PCI DSS SAQ A self-cert, ISO 27001 gap analysis, SOC 2 readiness | 외부 자문 필요 |
| Y2 (2027) | SOC 2 Type I (Security + Availability + Confidentiality), ISO 27001 stage 1 | 관측성(ADR-006) + IAM 필수 |
| Y3 (2028) | SOC 2 Type II (6-month window), ISO 27001 full cert | audit log 연속성이 Type II 핵심 |
| 옵션 | K-ISMS (KR 엔터 SLA 트리거), GDPR Art.42 cert (EU 감독기관 승인 시), SOC 2 Privacy TSC | 고객 확보 트리거 |

## 7. Security Regression Tests (CI 필수)

ADR별 방어책이 깨지지 않았는지 매 PR 검증 — 신속 실행(5분 이내). `packages/gateway/test/security/*.test.ts`에 배치.

| Test | 기대 결과 |
|---|---|
| CSRF — `Origin` 누락 POST | `403` |
| SSRF — 내부 IP(`169.254.*`, `10.*`) fetch | `blocked` + alert |
| Timing — HMAC 검증 랜덤 payload 1000회 | stdev < 5ms (constant-time 보장) |
| XSS — `deliveryNotes`에 `<script>alert(1)` 주입 | sanitized, 저장값 literal |
| Webhook replay — timestamp skew 301s | `401 STALE_TIMESTAMP` |
| OTP brute force — 연속 5회 오류 | account lockout 15분 |
| JWT — `alg=none` 또는 `HS256` (키는 ES256) | `401 INVALID_ALG` |
| Rate limit — burst 초과 | `429` + `Retry-After` header |
| IDOR — 타 tenant resource 접근 | `404` (exists 여부 누설 방지) |

CI에서 이 스위트가 실패하면 **merge blocker**. 우회 불가(admin override는 감사 로그 남김).

## 8. Security Review Cadence

| 주기 | 활동 | 책임 |
|---|---|---|
| Per PR | SAST/SCA/secret/DAST-baseline (alert) | 저자 + CODEOWNERS (`security-team`) |
| Weekly | 신규 의존성 Socket.dev 리포트 | Platform on-call |
| Monthly | ZAP full scan 리뷰, bug bounty 트리아지 review | Security Lead |
| Quarterly | External pentest, STRIDE 재검토(ADR-003 §9), tabletop | Security + SRE |
| Annually | SOC 2/ISO audit, red team, ASV, DPA 갱신 | CISO + Legal |

## 9. Security Champions Program

- 각 스쿼드(Gateway, SDK, Console, Ops)당 **1명** 지명. 20% time 할당.
- Monthly working group (1h) — 최근 bounty report, CVE, 신규 위협.
- 필수 수료: OWASP Top 10 2021 training, Secure Coding in TypeScript (SANS SEC522 or equivalent).
- Champion은 해당 팀 PR에 "security reviewer" 역할 (non-blocking이나 OVERBUILD 감지 담당).
- 성과 지표: 팀 내 security bug escape rate (1000 LOC당 심각 취약점).

## 10. Secret Detection in Production

- **CanaryTokens**: 레포(예: `README.example.env`), Notion, Slack pinned에 심음. 접근 시 PagerDuty `sec-critical`.
- **Secrets Manager 로깅**: AWS Secrets Manager + Doppler access log → SIEM. 비정상(이상 IP/시간/빈도) 이벤트는 ML baseline 대비 탐지.
- **Git push protection**: org-wide. pre-commit hook Gitleaks.
- **Expiration**: 모든 토큰 TTL 필수. `never-expire`는 관리형 예외 리스트로 별도 관리(월 1회 리뷰).

## 11. Privacy by Design (ADR-009 연계)

- DSAR SLA 자동 모니터링: 접수 후 30일(EU 기본) / 10영업일(KR). `dsar.aging` 대시보드 + 24h 전 escalation.
- PII 수집 범위 **분기별 감사** — schema diff 대비 PRD §5-3 허용 리스트. 초과 필드는 `OVERBUILD` finding.
- Sub-processor 변경 승인: Legal + Security + Compliance 3-signoff + 머천트 30일 사전 공지.

## 12. Incident Response 연습 (ADR-007 연계)

- **분기별 tabletop**: 회전 시나리오 — (Q1) Ransomware on ops laptop, (Q2) Malicious insider w/ prod DB, (Q3) 3rd-party Toss 키 유출, (Q4) Supply-chain(@opencheckout upstream poisoning). 2h, CISO + Legal + PR 참관.
- **연 1회 live fire**: controlled breach drill — sandbox 환경에서 red team이 실제 exploit, blue team이 playbook 대로 대응. 외부 감독.
- Drill → 24h 내 retro → 72h 내 playbook/룰 PR.

## 13. Vulnerability Management SLA

| Severity (CVSS v4.0) | Fix SLA | 예외 |
|---|---|---|
| Critical (9.0–10.0) | 24h (production) | offline signed waiver + risk accept (CISO) |
| High (7.0–8.9) | 7d | 14d w/ compensating control |
| Medium (4.0–6.9) | 30d | — |
| Low (0.1–3.9) | 90d | best-effort |

- Dependabot auto-PR: **patch → auto-merge** (CI 통과 시), **minor → Champion review**, **major → manual**.
- Emergency patch pathway: off-cycle release ≤ 4h, release notes skipped (retroactive), SBOM/provenance 필수 유지.

## 14. Security Metrics Dashboard

Grafana `security-overview` 대시:

- Open vulnerabilities by severity (Dependabot + Snyk)
- MTTR per severity (30d rolling)
- Pentest findings aging (days open, target < SLA)
- Bug bounty: reports/month, valid %, median payout
- SAST false positive rate (target < 30%)
- ZAP weekly trend (new HIGH findings)
- Phishing simulation click-through rate (quarterly)
- Champion PR coverage %

## 15. Responsible Disclosure Policy

- `SECURITY.md` 루트 + `/.well-known/security.txt` (RFC 9116, PGP + expires + policy + acknowledgements).
- Embargo: 기본 90일, 협의 가능. Active exploitation 증거 시 embargo 단축 + 동시 공개.
- CVE 발행: GitHub Security Advisory (GHSA) 경로. CVSS 산정 + CWE 태깅 + fixed version 명시.
- Public advisory ↔ patched release **동시성** — advisory 공개 시점에 `@opencheckout/*` 패치 버전이 npm 퍼블리시 완료 상태여야 함.

## 16. Access Control Audit

- **분기별 entitlement review**: GitHub org, AWS IAM, Prod DB, Doppler, HackerOne, PagerDuty, Toss merchant portal. 대상자 서명 + 증거 보관.
- **Offboarding**: Workday/오프보딩 webhook → 60분 내 모든 계정 revoke (SSO 포함). SRE on-call 더블체크.
- **Admin dual-control** (ADR-004 §8): prod write, key rotation, DSAR erase 등은 2명 승인.
- **Break-glass**: cold-wallet 패턴 — Yubikey 2개 분리 보관, 월 1회 개봉 테스트, 사용 시 72h 내 retro.

## 17. Third-Party Risk Management

- 모든 sub-processor (Toss, Cloudflare, AWS, Doppler, HackerOne, PagerDuty): DPA + SCC(EU 전송 시) 체결, SOC 2 Type II 리포트 연 1회 수집 및 예외 검토.
- 신규 벤더 도입: **4-eyes**(Security + Legal/DPO) 승인. 자동화된 보안설문(SIG Lite) 필수.
- Material incident 시 벤더도 IR playbook에 통합.

## 18. Budget & Resource

- 보안 예산: R&D 총예산의 약 **10%** (SaaS 금융 중앙값 8–12%).
- 인력 비율: SDE:Sec **8:1** (Year 2+), Y1은 공유 CISO + 1 FT security engineer.
- Tooling 연간 예산(Y1): Semgrep Team $3K, Snyk Team $5K, Socket.dev $4K, Burp Ent $5K, HackerOne managed $10K, 1Password Business $2K, Doppler $1K ≈ **$30K/yr**. Pentest 별도 (분기 $25K × 4 ≈ $100K/yr).

## 19. Consequences

**Positive**

- 머천트 vendor due-diligence에 대응 가능한 증거 팩 확보.
- PCI SAQ A self-cert 자동화 — 머천트 실사 비용 감소.
- Bounty + regression tests로 배포 신뢰도 향상, 보안 결함 조기 발견.
- Compliance roadmap이 투자자·엔터 머천트 신뢰 신호.

**Negative / Trade-off**

- 초기 보안 비용 ~$130K/yr (tool + pentest) — ARR 대비 Y1 부담.
- CI 실행 시간 증가(+4~6분/PR) — parallel + 캐시 필수.
- Bounty 관리는 조직 문화 부담 (duplicate triage, noise) — managed 서비스로 완화.
- Compliance 인증 추진은 별도 풀타임 수준 — Y2 컴플라이언스 전담 고용 필요.

**Neutral**

- IAST는 유보 — 필요성 재평가 Y2.
- ZAP/Semgrep는 OSS 우선 — 관리형 전환은 신호 기반 판단.

## 20. Compliance Checklist (v1 GA 전 검증)

1. [ ] Semgrep/CodeQL PR workflow 그린(HIGH+ 0)
2. [ ] Dependabot + Socket.dev + Snyk 3축 SCA green
3. [ ] Gitleaks + GitHub push protection 활성화
4. [ ] ZAP baseline nightly 스케줄 등록
5. [ ] 외부 pentest 1회 완료 + Critical/High 0
6. [ ] `SECURITY.md` + `/.well-known/security.txt` 배포
7. [ ] HackerOne private program 초대(50명) 오픈
8. [ ] Security regression 스위트 ≥ 9개 테스트 통과
9. [ ] PCI SAQ A questionnaire 작성 서명
10. [ ] Script inventory manifest 자동화 (6.4.3)
11. [ ] CSP report-only + SRI 모니터링 가동 (11.6.1)
12. [ ] Audit log hash-chain + 일일 Merkle (ADR-014)
13. [ ] 전 서브프로세서 DPA 체결 + SOC 2 보고서 수령
14. [ ] IR tabletop 1회 완료 + playbook 업데이트
15. [ ] Dependabot auto-merge 정책 적용 (patch only)
16. [ ] CanaryToken 최소 5곳 배포 + alert 라우팅 검증
17. [ ] Break-glass 계정 월 1회 테스트 스케줄
18. [ ] Security Champion 4개 스쿼드 지명 완료
19. [ ] Grafana `security-overview` 대시보드 배포
20. [ ] Vulnerability SLA 자동 티켓팅 (CVSS → SLA 매핑)

## 21. Open Questions

1. **Bounty 예산 캡**: 월 상한 없이 운영할지, $15K/월 cap을 둘지 — cap은 체인 익스플로잇에서 불리.
2. **Pentest 벤더 로테이션**: 같은 벤더 지속 vs 연 단위 로테이션 — 익숙함 vs 신선한 관점 트레이드.
3. **IAST 채택 시점**: Contrast/Datadog ASM 중 Y2 PoC 후 결정.
4. **K-ISMS 우선순위**: KR 엔터 파이프라인 크기가 cert 비용($50K+)을 정당화하는 시점.
5. **SOC 2 Privacy TSC 포함 여부**: GDPR DPIA와 중복 부담 — 머천트 요구가 임계점.
6. **Red Team 범위**: 외부 어택 서피스만 vs 인사이더 시뮬 포함.
7. **Bounty safe harbor 국가별 적용**: KR 정보통신망법 48조 해석 — legal 자문 중.
8. **Zero-day 공급망 공격 대응**: 자동 차단 vs 수동 검토 — false positive 비용 평가 필요.
