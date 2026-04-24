# ADR-003: Threat Model (STRIDE)

- **Status**: Proposed
- **Date**: 2026-04-23
- **Last normalized**: 2026-04-24 (ADR-019)
- **aggregates_touched**: [Payment, Order, Address, Shipment]
- **Deciders**: Security Lead, Gateway Team, SDK Team
- **Related**: PRD-v0 §4 D7 (PCI DSS SAQ A-EP), §6-5, research/08-technical-review.md 차원 2
- **Sibling ADRs**: ADR-004 (Authn/Authz), ADR-005 (Multi-tenancy), ADR-008 (Supply-chain), ADR-009 (PII), ADR-014 (Data Integrity — HMAC canonical), ADR-019 (Cross-ADR Normalization)

## 1. Context

OpenCheckout SDK는 한국 셀러가 국내+해외로 결제·배송을 태우는 framework-agnostic 체크아웃 SDK다. PRD-v0 리뷰에서 **차원 2 STRIDE 위협 모델이 🔴 critical gap**. 결제 SDK 공개 전 필수 보완 항목 #1.

PCI DSS v4.0 6.4.3/11.6.1 (2025-03 발효)은 머천트에게 **결제 페이지 상 악성 스크립트 방어 입증 경로**를 요구. OpenCheckout은 **SAQ A-EP** 경계(Widget이 Toss iframe을 orchestrate — postMessage, SRI, CSP 관리)를 채택. iframe hosted fields + postMessage allowlist 위에 6.4.3/11.6.1 공동 책임(OpenCheckout + 머천트), 런타임 PAN non-crossing enforcement(postMessage 값 regex check) + CI test를 추가. 이 ADR은 그 경계 위에 STRIDE 프레임으로 공격면을 체계화.

> **ADR-019 정규화 적용 (2026-04-24)**: PCI 스코프 SAQ A → **SAQ A-EP**로 재분류 (Widget이 Toss iframe orchestrator 역할 수행, ADR-019 §3.12).

## 2. Decision

5개 **신뢰 경계(Trust Boundary)** 별로 STRIDE 6축 표와 구체 완화책(+ 코드 예시)을 정의. OWASP ASVS v4.0 L2 기준선 채택. 모든 완화책은 CI 보안 테스트 자동화(ZAP/Semgrep/CodeQL)로 회귀 방지.

## 3. Trust Boundaries (DFD)

```
[Buyer Browser]
   │  TB1: Browser ↔ Widget (postMessage, iframe sandbox)
   ▼
[OpenCheckout Widget (WC + Preact iframe)]
   │  TB2: Widget ↔ Gateway (HTTPS, session JWT 5min)
   ▼
[Gateway (Hono on Node/Edge)] ─────────┐
   │                                    │
   │  TB3: Gateway ↔ PG (Toss)          │  TB5: Merchant Backend ↔ Gateway
   │  (mTLS, API secret, webhook HMAC)  │  (API key + HMAC signature)
   ▼                                    ▼
[Toss Payments]                     [Merchant Server]
   │
   │  TB4: Gateway ↔ External (Juso/Kakao/Google/Exim)
   ▼
[3rd-party APIs]

                                    [Ops Console] ─ TB6 ─▶ [Gateway internal admin API]
                                                            (SSO + OIDC + step-up MFA)
```

## 4. STRIDE per Trust Boundary

### TB1: Browser ↔ Widget

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S**poofing | 악성 페이지가 opener 가장, postMessage 위조 | `event.origin` allowlist + `MessageChannel` 2-way handshake + widget nonce (1회용) |
| **T**ampering | iframe 바깥 DOM에서 `input` 스니핑 | Stripe 패턴: 카드/OTP 필드 **iframe 내부만**, 바깥은 WC shadow DOM 격리; CSP `script-src 'self' https://js.tosspayments.com` |
| **R**epudiation | 구매자 "내가 누른 것 아님" 주장 | `correlation-id` + UA/device fingerprint + 서버 감사 로그 상관 (ADR-006) |
| **I**nfo disclosure | XSS로 PAN/OTP 탈취 | CSP `default-src 'self'`; free-text sanitize (DOMPurify); SRI 외부 스크립트 |
| **D**oS | 위젯 재진입 루프 | 메시지 rate-limit (client-side 100msg/s), 위젯 lifecycle 단일 인스턴스 |
| **E**oP | Clickjacking overlay | `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors` 머천트 등록 도메인만 |

### TB2: Widget ↔ Gateway

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S** | JWT 탈취 후 타 브라우저 사용 | JWT 5min + **device fingerprint binding** (ADR-004) + refresh rotation (one-time use) |
| **T** | body 변조 (amount, orderId) | `/confirm`에서 **서버 DB 원본 재검증**, 서명된 `(orderId, currency, amount)` 3튜플 |
| **R** | 사용자 행동 부인 | append-only event store, tamper-evident hash chain (ADR-014) |
| **I** | TLS downgrade, HTTP 접근 | HSTS `max-age=63072000; includeSubDomains; preload`, TLS 1.3 minimum |
| **D** | 세션 토큰 대량 발급 | IP+fingerprint rate limit (10/min/IP), 413/429 차등 |
| **E** | CSRF로 타 사용자 세션 결제 삽입 | **SameSite=Strict** + **Origin/Referer 검증** + **CSRF double-submit token** (§5-1) |

### TB3: Gateway ↔ PG (Toss)

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S** | 가짜 PG 엔드포인트 (DNS spoof) | **mTLS**(Toss 클라이언트 인증서 핀닝), outbound host allowlist |
| **T** | MITM amount 변조 | TLS 1.3 + Toss 응답 `paymentKey+orderId+amount` 서명 검증 |
| **R** | 결제 요청 부인 | outbound 호출 `x-correlation-id` 주입 + 원본 (마스킹 후) 감사 로그 |
| **I** | Toss 시크릿 로그 노출 | 로거 리다액터, gitleaks pre-commit |
| **D** | Toss 장애 cascading failure | Circuit breaker (5 failures / 30s), retry budget 10%, timeout 5s/10s |
| **E** | 미권한 scope 키로 confirm | API key scope 분리 (`payments:write` vs `payments:read`), 키 로테이션 90d |

### TB4: Gateway ↔ Carrier/Juso/Google/Exim

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S** | 악성 URL 주입 (redirect/webhook) | **SSRF 방어**: outbound URL allowlist + DNS rebinding 방지 (§5-2) |
| **T** | MITM 주소 검증 응답 변조 | TLS pinning (Juso 공공 CA 예외는 핀 회전 문서화) |
| **R** | "환율 조회 안 함" 주장 | Exim 응답 원본 + snapshot timestamp 보관 (PRD §5-10-7 5년) |
| **I** | Google Places 키 referrer leak | Places 키 **client-safe + referrer lock**, 서버 키는 `server-only` 타입 강제 |
| **D** | Exim 빈 배열 → null 환율 | Fail-closed: 환율 null/0 → 결제 비활성 + 24h 경보 |
| **E** | 외부 응답에 svg/html 내장 | JSON 파서 엄격 모드, Zod schema validation 후 downstream |

### TB5: Merchant ↔ Gateway

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S** | API key 탈취 → 타 머천트 가장 | API key prefix + **HMAC request signature** 필수, 키 로테이션 90d |
| **T** | 웹훅 payload 변조 | `OC-Signature: t=<ts>,v1=<hmac>,nonce=<b64u>,kid=<kid>` + 300s window — **@see ADR-014 §3** (canonical HMAC; `X-` prefix 제거 per RFC 6648, ADR-019 §3.6) |
| **R** | 웹훅 수신 부인 | 머천트 2xx 응답 영수증 보관 + retry ledger (at-least-once + 멱등) |
| **I** | 타 테넌트 데이터 조회 | Postgres **RLS** + API key tenant scope (ADR-005) |
| **D** | 머천트 의도적 DDoS | Per-tenant quota + Cloudflare WAF + `Retry-After` |
| **E** | 저권한 키로 환불 API 호출 | RFC 9421 또는 자체 scope token (`payments:refund`, `admin:*` 분리) |

### TB6: Ops Console ↔ Gateway

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S** | 직원 피싱 | SSO (OIDC) + **hardware MFA (WebAuthn)** 필수, IP allowlist (VPN) |
| **T** | 관리자 페이지 결제 취소 변조 | mutating action 2인 승인 (dual control) + 서명된 감사 로그 |
| **R** | 관리자 액션 부인 | tamper-evident audit log (hash chain, WORM) |
| **I** | 고객 PII 무분별 열람 | Field-level access + just-in-time access (요청→승인→TTL) |
| **D** | 내부자 대량 export | Export rate limit + DLP scan + 알림 |
| **E** | 지원팀 → 결제 취소 권한 | RBAC 세분화, step-up MFA |

## 5. 구체 공격 벡터 + 방어

### 5-1. CSRF (TB2)

```ts
// Hono middleware — 3중 방어
app.use('/v1/*', async (c, next) => {
  c.header('Set-Cookie',
    `oc_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=300`);

  if (['POST','PUT','PATCH','DELETE'].includes(c.req.method)) {
    const origin = c.req.header('Origin') ?? c.req.header('Referer');
    if (!origin || !ALLOWED_ORIGINS.has(new URL(origin).origin)) {
      return c.json({ error: 'origin_rejected' }, 403);
    }
  }

  const header = c.req.header('X-CSRF-Token');
  const cookie = getCookie(c, 'oc_csrf');
  if (!header || !cookie ||
      !crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie))) {
    return c.json({ error: 'csrf_failed' }, 403);
  }
  await next();
});
```

### 5-2. SSRF (TB4)

```ts
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

const BLOCK_CIDRS = ['127.0.0.0/8','10.0.0.0/8','172.16.0.0/12',
  '192.168.0.0/16','169.254.0.0/16','::1/128','fc00::/7'];

async function safeFetch(urlStr: string) {
  const u = new URL(urlStr);
  if (u.protocol !== 'https:') throw new Error('https_only');
  if (!WEBHOOK_HOST_ALLOWLIST.test(u.hostname)) throw new Error('host_denied');

  const { address } = await lookup(u.hostname);
  const parsed = ipaddr.parse(address);
  if (BLOCK_CIDRS.some(c => parsed.match(ipaddr.parseCIDR(c))))
    throw new Error('private_ip_blocked');

  return fetch(`https://${address}${u.pathname}${u.search}`, {
    headers: { Host: u.hostname }
  });
}
```

### 5-3. XSS (TB1) — CSP

```ts
c.header('Content-Security-Policy', [
  "default-src 'self'",
  "script-src 'self' https://js.tosspayments.com 'nonce-"+nonce+"'",
  "frame-ancestors 'self' " + merchantAllowlist.join(' '),
  "object-src 'none'",
  "base-uri 'none'",
  "require-trusted-types-for 'script'",
].join('; '));
```

### 5-4. Timing Attack

```ts
import { timingSafeEqual } from 'node:crypto';

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  if (ab.length !== bb.length) { timingSafeEqual(ab, ab); return false; }
  return timingSafeEqual(ab, bb);
}
```

### 5-5. HTTP Request Smuggling (Edge→Node 2-hop)

```ts
export default {
  async fetch(req: Request) {
    const te = req.headers.get('Transfer-Encoding');
    const cl = req.headers.get('Content-Length');
    if (te && cl) return new Response('bad_framing', { status: 400 });
    if (te && te.toLowerCase() !== 'chunked')
      return new Response('bad_te', { status: 400 });
    return fetch(NODE_ORIGIN, { ...req, headers: normalizeHeaders(req.headers) });
  }
};
```

### 5-6. Webhook Replay

```ts
async function verifyWebhook(raw: string, header: string, secret: string, nonceStore: KV) {
  const { t, v1 } = parseHeader(header);
  const age = Date.now()/1000 - Number(t);
  if (age > 300 || age < -30) throw new Error('timestamp_out_of_window');

  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  if (!safeCompare(v1, expected)) throw new Error('sig_invalid');

  const nonce = createHash('sha256').update(raw).digest('hex');
  const seen = await nonceStore.setnx(`wh:${nonce}`, '1', { ex: 300 });
  if (!seen) throw new Error('replay_detected');
}
```

### 5-7. Brute-force OTP

```ts
const key = `otp:${userId}`;
const fails = await redis.incr(key);
if (fails === 1) await redis.expire(key, 1800);
if (fails > 5) throw new Error('otp_locked_30min');
const delay = Math.min(2 ** (fails - 1) * 1000, 8000);
await sleep(delay);
```

## 6. Attack Trees

### (a) 결제 amount 조작

```
목표: 구매자가 100원 결제로 100,000원 상품 획득
├── A1. 클라이언트 amount 변조 후 /confirm
│     └─ 방어: 서버 DB 원가 재검증, 3튜플 서명
├── A2. Toss 응답 변조 (MITM)
│     └─ 방어: mTLS + 응답 서명 검증
├── A3. Idempotency-Key 재사용으로 이전 소액 주문 결과 끌어씀
│     └─ 방어: Idempotency-Key + **payload hash 동시 매칭** (ADR-002)
└── A4. Race condition: 동일 orderId 병렬 confirm
      └─ 방어: advisory lock + state machine 단조 전이
```

### (b) Webhook 위조

```
목표: "결제 성공" 웹훅 머천트에 위조 전송
├── B1. HMAC secret 추측
│     └─ 방어: 32-byte random, 90d 로테이션
├── B2. Replay 이전 성공 payload
│     └─ 방어: timestamp 300s + nonce 5min
├── B3. 머천트 webhook URL DNS hijack
│     └─ 방어: 머천트측 TLS + mTLS 옵션
└── B4. Gateway→머천트 MITM
      └─ 방어: HMAC이 body+timestamp 포함, TLS 1.3
```

### (c) 머천트 계정 탈취

```
목표: 환불/키 재발급 권한 획득
├── C1. API key GitHub leak
│     └─ 방어: gitleaks + GitHub secret scanning + 90d rotation + anomaly detection
├── C2. Ops Console 피싱
│     └─ 방어: WebAuthn hardware key, IP allowlist, dual-control
├── C3. 세션 쿠키 XSS 탈취
│     └─ 방어: HttpOnly + Secure + SameSite=Strict, CSP
└── C4. 권한 상승 (view-only → admin)
      └─ 방어: scope token 분리, step-up MFA, RBAC quarterly review
```

## 7. 보안 테스트 자동화 (`.github/workflows/security.yml`)

```yaml
name: security
on: [pull_request, schedule]
jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/owasp-top-ten p/javascript p/typescript p/nodejs p/secrets

  codeql:
    runs-on: ubuntu-latest
    permissions: { security-events: write }
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with: { languages: javascript-typescript }
      - uses: github/codeql-action/analyze@v3

  zap-baseline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose up -d gateway
      - uses: zaproxy/action-baseline@v0.12.0
        with:
          target: 'http://localhost:8080'
          rules_file_name: '.zap/rules.tsv'

  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
```

DAST 확장 (nightly): ZAP full scan against staging, sqlmap, Burp Suite quarterly.

## 8. References

- **OWASP ASVS v4.0.3** — L2 기준선
- **PCI DSS v4.0**: 6.4.3, 11.6.1, 8.3.6, 10.x
- **OWASP Top 10 2021**, **API Security Top 10 2023**
- **CWE-352** (CSRF), **CWE-918** (SSRF), **CWE-79** (XSS), **CWE-208** (timing), **CWE-444** (smuggling)
- **RFC 9110**, **RFC 7807**

## 9. Implementation Checklist

- [ ] CSP `default-src 'self'` + `frame-ancestors` allowlist
- [ ] `X-Frame-Options: SAMEORIGIN` 전 응답
- [ ] HSTS preload 전 서브도메인
- [ ] SameSite=Strict + Secure + HttpOnly 쿠키
- [ ] Origin/Referer 검증 미들웨어
- [ ] CSRF double-submit 토큰
- [ ] SSRF allowlist + DNS rebinding 가드
- [ ] 메타데이터 IP 블랙리스트 (169.254.169.254 등)
- [ ] Webhook HMAC + 300s window + 5min nonce
- [ ] `timingSafeEqual` 강제 (HMAC, API key, idempotency lookup)
- [ ] Edge `TE+CL` 동시 존재 400
- [ ] OTP 5회 실패 30min lock + exp backoff
- [ ] JWT 5min + device fingerprint + refresh rotation
- [ ] mTLS Toss 아웃바운드 + 핀닝
- [ ] 로거 PAN/키 redactor + gitleaks
- [ ] Postgres RLS per tenant (ADR-005)
- [ ] API key 90d 로테이션
- [ ] `/confirm` amount 3튜플 재검증
- [ ] Idempotency-Key + payload hash 이중 매칭
- [ ] Advisory lock per orderId
- [ ] GitHub Actions security.yml PR blocking
- [ ] ZAP full scan nightly
- [ ] OWASP ASVS L2 체크리스트 quarterly
- [ ] Tamper-evident audit log (ADR-014)

## 10. Open Questions

1. Toss mTLS 가능 여부 — 대체 핀닝 전략?
2. 머천트 webhook URL 사설 IP 필요 케이스 — Relay 모드 제공?
3. Edge 런타임 `timingSafeEqual` 대체 API?
4. PCI DSS v4.0 11.6.1 CSP report-only 충분 vs 별도 SRI 모니터링?
5. Device fingerprint GDPR 취급 — PII 여부, DSAR (ADR-009)
6. Ops Console dual-control SLA vs 결제 취소 긴급성 충돌
7. SSRF allowlist UX — 머천트 webhook host 등록 DNS 재확인
