# SDK 아키텍처 & OSS 모노레포 리서치

source: researcher agent, 2026-04-23

## 1. 레퍼런스 비교 (Stripe/Twilio/Hydrogen/Medusa)

| 벤더 | 레포 전략 | 서버 유무 | 핵심 경계 |
|---|---|---|---|
| Stripe | 언어별 레포 분리 + stripe-js | 자체 API 서버 | SDK = 얇은 HTTP 클라이언트, 로직은 API 서버 |
| Twilio | 언어별 레포 + OpenAPI 자동생성 | 자체 API 서버 | OAS 주도 → 모든 언어 SDK 균질 |
| Hydrogen | 모노레포(pnpm+turbo) | Storefront API 경유 | React/Remix 프레임워크 레이어 |
| Medusa | 모노레포(yarn+turbo), 서버+SDK+admin | 자체 Node 서버 번들 | 서버+SDK+플러그인 일체형 |

**결론**: Medusa 하이브리드 모델 채택. 모노레포 안에 (a) 선택형 self-host 서버, (b) 언어별 SDK, (c) 프론트 위젯.

## 2. 멀티언어 SDK 순서

1. **TypeScript** — Node+브라우저 듀얼 빌드, ESM/CJS. 위젯+서버 SDK 동시.
2. **Python** — 백오피스/LLM 에이전트 수요. OAS 자동생성 + 수작업 래퍼.
3. **Go** — 트래픽 레이어.
4. **Java/Kotlin** — 금융권 엔터프라이즈 파트너 요구 시.
5. PHP/Ruby — 커뮤니티 PR 대응.

**Method**: OAS 3.1을 단일 진실원으로 두고 `openapi-generator` + 언어별 수작업 래퍼.

## 3. BYO-Key 설계 패턴

```ts
type KeyScope = "server-only" | "client-safe";
interface KeyRegistry {
  toss: { secret: ServerOnly; client: ClientSafe };
  exim:  { apiKey: ServerOnly };
  kakao: { rest: ServerOnly; js: ClientSafe };
  google: { places: ClientSafe };
}
```

- 3계층 주입: 명시 인자 → 환경변수 → `.rc` 암호화 파일
- 클라우드 KMS 어댑터(AWS KMS/GCP/Vault)
- 환경 분리: `MYSDK_ENV=dev|staging|prod` → 네임스페이스 접두사 강제
- 로테이션: `KeyProvider.refresh()` 훅, grace window
- 유출 방지: 타입 시스템 + 번들러 스캐너 + 로거 마스킹 + gitleaks + CI 시크릿 스캔

## 4. 프로토콜 결정

**REST + OpenAPI** 채택 (Stripe/Twilio 동일).
- tRPC: TS 모노컬처 한계
- GraphQL: 결제 도메인 과잉
- 위젯은 단기 Session Token(JWT 5분) 보유. PII 무보유.
- 결제 플로우: 서버 사이드 상태기계 `draft → pending → captured → settled`
- Idempotency-Key(UUIDv4) 필수, 24h 캐시, 동일키+다른페이로드 = 409

## 5. 테스트 전략

1. **Unit**(Vitest) — 순수 로직, 키 스코프 타입 가드
2. **Integration**(msw/nock) — 외부 API 응답 픽스처 커밋
3. **Contract**(Pact/Schemathesis) — OAS 드리프트 검출
4. **E2E**(Playwright) — 위젯+로컬서버+Toss 샌드박스

**CI 시크릿 없이**:
- Toss 공개 테스트 키만 사용
- 수출입은행 = 전량 모킹, 실키 E2E는 nightly 유지 브랜치만

## 6. 버저닝

- SemVer + 날짜 기반 API 버전 헤더(`OpenCheckout-Version: 2026-04-23`)
- 최소 12개월 두 버전 병행
- Deprecation 경고 1 마이너 전
- `@opencheckout/codemod` 자동 마이그레이션

## 7. PCI DSS 스코프 최소화

- 카드 PAN은 서버 절대 미경유 (SAQ-A)
- Toss iframe 위젯만 래핑, postMessage 화이트리스트
- 서버는 `paymentKey/orderId/amount`만 수신
- 로그 PAN 리다액터, DB 스키마 마이그레이션 린터

## 8. 모노레포 툴링

**pnpm workspaces + Turborepo + Changesets** 채택.
- pnpm: 엄격 호이스팅, 기여자 환경 편차 최소
- Turborepo: 원격 캐시 Vercel 무료, 학습 쉬움
- Changesets: PR 단위 버전 제안 자동화

## MVP 디렉토리 트리

```
opencheckout/
├── README.md
├── CONTRIBUTING.md
├── CODEOWNERS
├── .changeset/
├── .github/workflows/
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
│
├── spec/
│   └── openapi.yaml                     # 단일 진실원
│
├── packages/                            # Phase 1 (TS)
│   ├── core/                            # 공통 타입·에러·idempotency·키스코프
│   ├── sdk-node/                        # 서버 SDK (BYO server-only keys)
│   ├── sdk-browser/                     # 브라우저 SDK (client-safe만)
│   ├── widget-react/
│   ├── widget-vanilla/                  # <script> 한 줄 임베드 (GH Pages)
│   ├── adapters-toss/
│   ├── adapters-kakao/
│   ├── adapters-google-places/
│   ├── adapters-exim/                   # 수출입은행 환율
│   ├── key-provider/                    # env/KMS/Vault
│   ├── testing/                         # msw 핸들러·픽스처
│   └── codemod/
│
├── services/
│   └── gateway/                         # 선택형 self-host 서버
│
├── sdks/                                # Phase 2+ 멀티언어
│   ├── python/
│   ├── go/
│   └── java/
│
├── examples/
│   ├── nextjs-checkout/
│   ├── github-pages-embed/
│   └── python-backoffice/
│
├── docs/                                # Docusaurus (gh-pages)
└── tools/
    ├── eslint-config/
    ├── tsup-config/
    └── scripts/
```

## Gaps / 미결

- Toss 외 KG이니시스·NICE 편입 순서는 파트너십 협의 필요
- PCI SAQ 레벨 확정은 법무 검토 후
- 수출입은행 레이트리밋 공개치 없음 → Phase 1 캐시 전략은 실측

## 권장 Phase 1 스코프

`core + sdk-node + sdk-browser + widget-vanilla + adapters-toss + gateway` 6개 패키지로 3개월 내 0.1 릴리스 → Toss 샌드박스 E2E 통과 후 Python SDK 착수.
