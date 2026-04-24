# ADR-008: Supply-Chain Security

- **Status**: Proposed
- **Date**: 2026-04-23
- **Deciders**: Platform / Security / Release Engineering
- **Related**: PRD §4 D6, §11, §14 Phase 1; Review 차원 11

## Context

OpenCheckout는 `@opencheckout/*` npm/JSR 패키지로 배포되며 머천트 체크아웃 경로에 서버사이드로 소비됨. 단일 악성 버전이 카드 데이터 유출, 결제 pivot을 야기 가능. 역사적 사건(`event-stream` 2018, `ua-parser-js` 2021, `node-ipc` 2022, `@solana/web3.js` 2024)이 보여주듯 npm 생태계 공격은 (a) 메인테이너 계정 탈취, (b) typosquat/네임스페이스 혼동, (c) 추이 의존성 탈취 경로로 오며, 발견 MTTD는 수 시간 단위. 위협 모델상 단순 취약점 스캔이 아니라 엔드투엔드 암호학적 provenance가 필수.

## Decision

Defense-in-depth 공급망 프로그램을 **SLSA v1.0 Build L2 (v1)** + **L3 roadmap (v2)** 기준으로 채택.

### 1. SLSA targets

| Version | SLSA Build Level | Gate |
|---|---|---|
| v1.x (GA) | **L2** — hosted build platform (GitHub Actions), signed provenance | Release blocker |
| v2.x | **L3** — hardened, non-forgeable provenance, isolated builders | Release blocker |

L2는 GitHub-hosted runner + npm provenance + Sigstore로 당장 달성 가능. L3는 `slsa-framework/slsa-github-generator` reusable workflow + hermetic build, v2 예산 후.

### 2. npm publish pipeline

- **2FA**: `auth-and-writes` org 레벨 강제. Automation token publish 금지. `NPM_TOKEN`은 OIDC exchange만
- **Provenance**: `npm publish --provenance` GitHub Actions OIDC → Sigstore Fulcio → Rekor. 로컬 publish 금지. `@opencheckout/*` protected environment + required reviewers
- **Consumer verification**: repo-wide CI `npm audit signatures` on every PR. 서명/provenance 없는 의존성 fail

### 3. JSR publish pipeline

JSR Sigstore-native. OIDC publish GitHub Actions → provenance 자동. `@opencheckout/*` Deno/browser-safe 패키지 미러. npm/JSR digest 릴리스 노트 기록.

### 4. SBOM

```bash
pnpm dlx @cyclonedx/cyclonedx-npm --output-format JSON \
  --output-file sbom.cdx.json --omit dev
```

- GitHub Release에 `sbom.cdx.json` + cosign 서명 첨부
- 패키지 tarball `./sbom/`에 포함 → `npx @opencheckout/verify-install` 설치 vs 선언 diff
- Dependency-Track 내부 인스턴스 인덱싱 (post-release CVE 재스캔)

### 5. Dependency verification — 3 Layer

| Layer | Tool | Detects |
|---|---|---|
| Known CVE | GitHub Dependabot | Published vulnerabilities |
| Malicious behavior | **Socket.dev** | Install scripts, network access, obfuscation, new-maintainer risk |
| License + deep CVE | Snyk CLI (`snyk test`) | License drift, Snyk 큐레이션 |

3개 모두 main pass. Socket.dev는 **행동 기반** 탐지 — 추이 의존성이 `postinstall`에서 `~/.npmrc` 쓰기 추가 시 CVE 신고 전 포착.

### 6. Lockfile policy

- `pnpm-lock.yaml` 커밋, pre-commit hook이 `package.json` 변경 + 락파일 매칭 없으면 reject
- CI `pnpm install --frozen-lockfile` 전용
- 주간 `pnpm update --latest=false` grouped Renovate PR
- Dependabot security alerts는 당일 PR

### 7. Maintainer key management

- Publish-capable maintainer는 **hardware token (YubiKey 5 / Solo v2)** + WebAuthn 2FA. TOTP 금지
- 60일 로테이션. T-14 rotation issue 자동 open
- **Multi-maintainer publish**: `main` → `release/*` 2 approvers. publish workflow 추가로 second maintainer의 `publish-approved` environment review. 1인 릴리스 불가
- Recovery codes는 offline org-owned 1Password vault

### 8. Namespace squatting 방어

- 캐노니컬: `@opencheckout/*`
- **Defensive pre-register**: `open-checkout`, `opencheckout`, `@open-checkout/*`, `opencheckoutjs`, `@opencheckoutjs/*` — npm/JSR 양쪽, stub README 캐노니컬 링크
- 월간 모니터링 (`npq` + edit-distance ≤ 2 registry search) → 신규 look-alike issue open → npm Trust & Safety 테이크다운

### 9. CI/CD 공급망

- GitHub Actions **commit SHA 핀 필수**, `@v3` 금지. Renovate (`pinDigests: true`)
- 빌드/publish 로직 단일 **reusable workflow** `.github/workflows/release.yml` → `uses: opencheckout/.github/.github/workflows/release.yml@<sha>`. 하위 레포 provenance 단계 override 불가
- 로컬 검증 `gh act`
- Deploy key/PAT 90일 로테이션, SSH deploy key는 repo-per, read-only 기본

### 10. Dependency classification & license

| Bucket | Allowed licenses | Example |
|---|---|---|
| Runtime (머천트 배포) | MIT, Apache-2.0, ISC, BSD-2/3, 0BSD, MPL-2.0 (file-level only) | `zod`, `undici` |
| Dev | Runtime set + Unicode-DFS-2016 | `vitest` |
| Build (소비자 미실행) | Dev set + CC-BY-4.0 | `@cyclonedx/cyclonedx-npm` |

**Blocker**: GPL-\*, LGPL-\*, AGPL, SSPL, BUSL, CC-BY-NC, Commons Clause. 명시 블록: **`pykakasi` (GPL-3.0)** — i18n 필요 시 Apache-2.0 대안(cutlet) 또는 자체 구현.

### 11. Supply-chain incident playbook (ua-parser-js 패턴)

| T | Action | Owner |
|---|---|---|
| T+0 | Socket.dev/Dependabot/customer report IoC 표면화 | On-call |
| T+15m | Incident 채널 open, `@opencheckout/*` publish workflow freeze (env revoke) | Sec lead |
| T+30m | Scope 확인: 버전, 추이, 페이로드 hash | Sec lead |
| T+1h | 우리 패키지 영향 시: 72h 내 `npm unpublish` or SECURITY URL + `npm deprecate`; JSR yank | Release eng |
| T+2h | GHSA advisory file, CVE via GitHub | Sec lead |
| T+4h | 고객 통보 (status page + security@ ML), pin-last-good 완화 명령 포함 | Comms |
| T+24h | Publish credential 전체 rotate (하드웨어 토큰 재등록, npm token revoke), postmortem 일정 | Platform |
| T+7d | 공개 postmortem, SLSA evidence 리뷰 | Sec lead |

### 12. Consumer-side provenance verification

`npx @opencheckout/verify-install` — zero-config CLI:
- 모든 `@opencheckout/*` 패키지 버전 해결
- Rekor에서 Sigstore bundle fetch
- bundle subject digest ↔ disk tarball 검증
- OIDC issuer = `https://token.actions.githubusercontent.com` + repo `opencheckout/*` 검증
- CycloneDX SBOM ↔ `node_modules` diff 출력

머천트 CI/deploy에서 non-zero exit → deploy block.

## Consequences

**긍정**: source commit → installed file 엔드투엔드 암호학적 provenance. 3-layer 독립 탐지 (CVE, behavioral, license) 단일 도구 blind spot 감소. Hardware + multi-maintainer publish가 ua-parser-js 패턴 차단. SBOM + verify-install이 머천트 감사 증거 제공.

**부정**: 릴리스 friction — 2 maintainer + OIDC + 3개 스캐너 → ~8–12min (현 2min). Socket.dev 유료 SaaS, outage 시 릴리스 차단(documented override 필요). Defensive typosquat 메인테이너 주의 + npm storage 쿼터. SLSA L3(v2) migration `slsa-github-generator` 파이프라인 재감사.

## Checklist (pre-v1 GA)

- [ ] `@opencheckout` npm org 2FA enforcement
- [ ] GitHub Actions OIDC → npm publish provenance (test package 검증)
- [ ] `npm audit signatures` PR 필수 체크
- [ ] CycloneDX SBOM 릴리스 첨부
- [ ] Dependabot + Socket.dev + Snyk CLI main green
- [ ] `pnpm-lock.yaml` frozen-install CI
- [ ] GitHub Actions SHA 핀, Renovate 관리
- [ ] YubiKey 발급, TOTP disabled
- [ ] Defensive namespace npm/JSR 등록
- [ ] 라이선스 스캐너 runtime/dev/build bucket + GPL/LGPL blocker
- [ ] `@opencheckout/verify-install` 퍼블리시 + README 문서화
- [ ] Incident playbook 테이블탑 리허설

## Open Questions

1. **JSR parity**: 현 provenance format이 SLSA L2 attestation 충족? 병행 in-toto 필요?
2. **Socket.dev vendor lock-in**: `osv-scanner` no-vendor 폴백 병행?
3. **Unpublish 72h window**: slow propagation 공격에 짧을 수 있음 — `deprecate` + 새 patch 기본?
4. **SLSA L3 timeline**: v2 12개월 후 — v1.minor에 pre-invest `slsa-github-generator` migration?
5. **Merchant key trust**: Sigstore Fulcio root expectation을 `.well-known/opencheckout-trust.json`로 publish?

## Sources

- SLSA v1.0 — slsa.dev/spec/v1.0
- npm provenance — docs.npmjs.com/generating-provenance-statements
- CycloneDX Node — github.com/CycloneDX/cyclonedx-node-npm
- Sigstore cosign — docs.sigstore.dev
