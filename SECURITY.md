# Security Policy

## Reporting

**공개 이슈 금지**. 아래 경로 중 하나를 사용하세요:

- **Email**: ziho.shin@gmail.com (별도 security@ 메일은 Phase 1 이후 개설)
- **GitHub Security Advisory** (private): https://github.com/today-zh-learned/opencheckout/security/advisories/new

## Safe Harbor (Bug Bounty)

다음을 준수하는 연구 행위에 대해 OpenCheckout은 **민사 소송 제기하지 않으며, 수사기관 요청 시 연구자의 선의를 증빙 자료로 제출**합니다:

- 본 Policy의 범위 내 행위만 수행
- 취약점 제보 전 악용하지 않음
- 데이터 추출·수정·파괴하지 않음
- 제보 후 90일 embargo 준수 (협의 가능)
- 사용자 데이터 열람·저장하지 않음

**중요**: 한국 정보통신망법 §48은 형사처벌 조항이며, 사인(私人) 간 계약으로 **형사 면책은 불가합니다**. 본 Safe Harbor는 민사 소송 비제기 및 선의 증빙 협조에 한정됩니다. 한국 법 적용 가능 연구자는 사전에 법률 검토를 권장합니다.

## Scope

### In scope
- `api.opencheckout.dev` 모든 엔드포인트
- `@opencheckout/*` npm 및 JSR 패키지
- `https://sandbox.opencheckout.dev` (공용 샌드박스)

### Out of scope
- DoS / DDoS 공격 (자동 스캐너 포함)
- 물리·사회공학 공격
- 3rd party 취약점 (Toss, Cloudflare, AWS 등 — 해당 벤더 보안팀에 별도 제보)
- 자동 스캐너의 검증되지 않은 결과
- 이미 공개된 취약점의 재제보

## Severity & Rewards

Phase 1 출시 초기는 **Hall of Fame + swag**만 제공합니다. Bug bounty cash는 유료 머천트 ARR $X 달성 후 HackerOne 프라이빗 프로그램으로 전환합니다.

### Hall of Fame
연구자 이름·X/GitHub 핸들·제보 요약을 `SECURITY-HALL-OF-FAME.md`에 공개 (연구자 동의 시).

### CVE 발행
Critical/High는 GitHub Security Advisory + CVE 발행, 90일 내 패치.

## Response SLA

| Severity | Ack | Fix Target |
|---|---|---|
| Critical | 24h | 24h |
| High | 48h | 7d |
| Medium | 5d | 30d |
| Low | 7d | 90d |

## CVSS 기반 분류

CVSS v3.1 / v4.0 기준:
- Critical: 9.0–10.0
- High: 7.0–8.9
- Medium: 4.0–6.9
- Low: 0.1–3.9

## Disclosure

패치 릴리스 ↔ 공개 Advisory 동시성 원칙. 연구자 크레딧 포함.

## 문의

- 보안 질문: security@opencheckout.dev
- 일반 문의: ziho.shin@gmail.com
