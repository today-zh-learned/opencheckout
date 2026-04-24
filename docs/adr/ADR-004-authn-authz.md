# ADR-004: Authn/Authz — API Keys, Session JWT, mTLS, Scopes, Webhooks

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-04-23 |
| **Last normalized** | 2026-04-24 (ADR-019) |
| **aggregates_touched** | [Identity, Payment] |
| **Deciders** | opencheckout core |
| **Related** | ADR-002, ADR-003, ADR-005, ADR-014 (HMAC canonical), ADR-019 (Cross-ADR Normalization), PRD §4 D5/D6/D8, §8-4, §9-3 |
| **References** | RFC 6648 (X- prefix deprecation), RFC 7518, RFC 7519, RFC 8725, RFC 9449, Stripe API Keys & Webhook Signing, Twilio API keys |

## Context

PRD-v0 기술 리뷰(차원 3, 🔴)에서 인증/인가 설계 공백 확인. 세 클라이언트 클래스(머천트 서버, 브라우저 Widget, 엔터 백엔드)가 동일 Gateway 호출. §9-3은 7개 RBAC 역할과 감사 로그 의무 요구. Stripe/Twilio 수준의 분리된 인증 계층과 scope 모델 필요.

## Decision

인증 **3계층** 분리 + 인가는 **OAuth2 scope 모델 + tenant scoping**.

### 1. 인증 계층 3종

| Layer | Who | Credential | TTL |
|---|---|---|---|
| L1 API Key | 머천트 서버 → Gateway | `oc_{env}_{scope}_{random}` | 무기한, 90d 로테이션 권장 |
| L2 Session JWT | Widget/Browser → Gateway | ES256 JWT, `kid` 회전 | 5분 |
| L3 mTLS (옵션) | 엔터 백엔드 → Gateway | X.509 client cert | 365d |

L1은 `Authorization: Bearer oc_live_sk_...`. L2는 `Authorization: Bearer <jwt>` + DPoP proof. L3는 TLS 레이어.

### 2. API Key 설계

**Prefix** (`oc_{env}_{scope}_{body}`):
- `oc_live_pk_` — production publishable (client-safe, 체크아웃 생성만)
- `oc_live_sk_` — production secret (server only, 전체 scope)
- `oc_live_rk_` — restricted (scope 제한)
- `oc_test_*` — sandbox
- `oc_live_ops_` — ops console PAT (impersonation)

**본문**: 32 bytes CSPRNG → base58(Flickr alphabet) ≈ 44 chars. 엔트로피 256-bit.

**저장**:
- 전체 키 `argon2id(m=64MB,t=3,p=1)` 또는 `bcrypt cost=12`로 해시 저장
- 부가로 `HMAC-SHA256(pepper, key)` 저장 — 로그/감사 lookup용 결정적 토큰
- 평문 키는 생성 직후 1회만 반환
- row: `id, tenantId, prefix, last4, hash, hmac, scopes[], createdBy, createdAt, lastUsedAt, expiresAt, revokedAt, revocationReason`

**로테이션**:
- 기본 365일, 권장 90일 사전 알림
- Grace window 7일 (두 키 동시 유효)
- `lastUsedAt` 60일 미사용 → 경보 (dormant)
- **GitHub Secret Scanning Partner** 등록 → 공개 레포 유출 시 자동 revoke

**Restricted keys**: scope 배열 지정. 예: `checkout:create,payment:confirm`만 가진 키는 orders 조회 불가.

### 3. Session JWT

**알고리즘**: ES256 (secp256r1) 기본, EdDSA(Ed25519) 옵션. HS256/none 금지 (RFC 8725 §3.1–3.2).

**구조**:
```
Header:  { alg: "ES256", typ: "JWT", kid: "2026-04-23-01" }
Payload: {
  iss: "https://api.opencheckout.dev",
  aud: "widget.opencheckout.dev",
  sub: "checkout_01HXYZ...",
  tenantId: "mer_01HABC...",
  scope: "checkout:create payment:confirm address:read",
  devicePrint: "sha256(ua+ip/24+screen)",
  iat, nbf, exp (+300s), jti,
  cnf: { jkt: "<thumbprint>" }         // DPoP binding
}
```

**JWKS**:
- endpoint: `GET /v1/.well-known/jwks.json`
- 응답: `{ keys: [{ kty, crv, x, y, kid, use:"sig", alg:"ES256" }] }`
- 캐시: `Cache-Control: public, max-age=86400, stale-while-revalidate=3600`
- 최소 2개 키 동시 서빙. 회전: 새 kid publish → 24h → 서명 전환 → 24h → 구키 제거
- Private key는 KMS에 저장, sign 연산만 위임

**Device binding — DPoP (RFC 9449)**:
- 클라이언트 ephemeral EC 키쌍 → public JWK thumbprint를 Session JWT `cnf.jkt` 귀속
- 모든 후속 요청 `DPoP: <proof JWT>` 헤더, proof는 `{ htm, htu, iat, jti }` 서명
- 서버 검증: thumbprint 일치, `iat` ±30s, `jti` 재사용 차단 (5분 TTL Redis)

**세션 철회**:
- `POST /v1/sessions/{jti}/revoke` — tenant admin만
- Revocation list: Redis set `revoked:jti` TTL = 남은 exp
- Tenant-wide kill switch: `revoked:tenant:{id}:since=<ts>`

### 4. mTLS

**발급**:
1. 머천트 CSR 업로드 또는 Gateway 키쌍 생성 (1회)
2. Internal CA(step-ca/AWS Private CA) 서명, 유효기간 365d
3. CN=`mer_01HABC.enterprise.opencheckout.dev`, SAN에 tenantId 바인딩
4. 전용 엔드포인트 `mtls.api.opencheckout.dev:443`
5. 만료 30/14/7/1일 전 webhook + email 알림

**검증**: TLS terminator(envoy/nginx)가 `X-Client-Cert-SHA256`·`X-Client-Cert-CN` 주입 → 미들웨어가 pinned fingerprint 비교.

### 5. Scope 설계 (OAuth2)

```
checkout:create
checkout:read
payment:confirm
payment:refund
payment:refund:limited       # refund amount <= env.REFUND_LIMIT
address:read                 # AddressDisplayDTO 만
address:internal:read        # AddressCanonicalRecord 전체 (ops 전용)
address:write
orders:read / orders:write
webhooks:manage / webhooks:receive
ops:agent / ops:lead
logistics:pick / logistics:lead
finance:read
compliance:read
admin:keys / admin:members
```

**해석 순서**:
1. 인증 (L1/L2/L3 중 하나, 실패 401)
2. tenantId 해석 (PathParam tenantId와 불일치 시 403)
3. Required scope 집합 계산 (라우트 메타데이터)
4. Token scope ⊇ Required ? yes pass, no 403 `scope_insufficient`
5. Role-based augment (§9-3): `ops_agent`는 refund limit 초과 시 추가 403
6. Rate limit · idempotency · 핸들러

**Publishable key (`oc_live_pk_`)**: `checkout:create`만 자동 부여.

### 6. 웹훅 아웃바운드 (Gateway → Merchant)

> **ADR-019 정규화 적용 (2026-04-24)**: HMAC 포맷·알고리즘·nonce/kid·clock skew는 **@see ADR-014 §3** (canonical Single Source of Truth, ADR-019 §3.8). 헤더 이름은 `OC-Signature` (no `X-` prefix per RFC 6648).

**서명** (요약 — 전체 규격은 ADR-014 §3):
```
OC-Signature: t=<unix>,v1=<hex-hmac-sha256>,nonce=<b64u-32>,kid=<key-id>
```
- `v1` = `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))`
- 서명 payload는 **원문 바이트** (JSON re-serialize 금지)
- Timestamp skew ±300s, nonce Redis 10min sliding window

**머천트 검증**:
```ts
const [ts, v1] = parseOcSig(req.header("OC-Signature"));
if (Math.abs(Date.now()/1000 - ts) > 300) reject("stale");
const expected = hmacSha256(secret, `${ts}.${rawBody}`);
if (!timingSafeEqual(expected, v1)) reject("bad sig");
if (nonceStore.has(req.header("OC-Event-Id"))) reject("replay");
```

**Secret 로테이션**:
- Endpoint당 최대 2개 활성 secret
- 회전 중 두 secret 동시 서명(`v1=... v1=...` 다중) 또는 shadow 발급 후 교체

### 7. 웹훅 인바운드

- Toss: `TossPayments-Signature` 규격 그대로 검증
- 캐리어: 각 벤더 HMAC 규약을 adapter가 캡슐화
- 머천트 → Gateway 콜백: `OC-Signature` 공통 포맷
- Raw body preservation, JSON.parse 전 서명 검증
- Replay 방지: `(sourceId, eventId)` unique index 2주 TTL

### 8. Impersonation (Ops 대행)

- 시작: `POST /v1/ops/impersonations` { tenantId, reason, ticketId } → Ops JWT (exp 1h, scope = 대상 ∩ ops role)
- Claims: `act: { sub: "ops_user_...", role: "ops_lead" }` (RFC 8693)
- 모든 감사 로그에 `impersonatedBy: { userId, role, reason, ticketId, sessionId }` **필수**
- 감사 로그 tamper-evident (ADR-014)
- 머천트 대시보드에 "최근 7일 내 운영팀 접근" 표시
- 세션 write 액션 상한(50), 고위험 액션(환불 >$1000) **2-man rule**

### 9. Clock Skew

- JWT `iat`/`exp`: ±30s leeway
- DPoP proof `iat`: ±30s
- Webhook `t`: ±300s
- mTLS notBefore: ±30s
- 모든 노드 NTP chrony, drift > 1s 알림

### 10. OpenAPI `securitySchemes`

```yaml
components:
  securitySchemes:
    ApiKeyAuth:
      type: http
      scheme: bearer
      bearerFormat: "oc_{env}_{scope}_{body}"
    SessionJWT:
      type: http
      scheme: bearer
      bearerFormat: JWT
    DPoP:
      type: apiKey
      in: header
      name: DPoP
    MTLS:
      type: mutualTLS
    OcWebhookSig:
      type: apiKey
      in: header
      name: OC-Signature
security:
  - ApiKeyAuth: []
  - SessionJWT: []
    DPoP: []
  - MTLS: []
```

Path-level `x-scopes: [checkout:create]`을 Spectral 룰로 강제.

### 11. Hono 미들웨어

```ts
import { jwtVerify, createRemoteJWKSet } from "jose";
import { argon2Verify } from "@node-rs/argon2";

const JWKS = createRemoteJWKSet(new URL(process.env.JWKS_URL!), {
  cooldownDuration: 30_000, cacheMaxAge: 86_400_000,
});

export const authn = createMiddleware<{ Variables: AuthCtx }>(async (c, next) => {
  const h = c.req.header("authorization") ?? "";
  const bearer = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!bearer) return c.json({ error: "unauthorized" }, 401);

  // L1: API key
  if (bearer.startsWith("oc_")) {
    const hmac = hmacLookup(bearer);
    const row = await db.apiKey.findByHmac(hmac);
    if (!row || row.revokedAt) return c.json({ error: "revoked" }, 401);
    const ok = await argon2Verify(row.hash, bearer);
    if (!ok) return c.json({ error: "unauthorized" }, 401);
    c.set("auth", { kind: "apikey", tenantId: row.tenantId, scopes: row.scopes, keyId: row.id });
    return next();
  }

  // L2: Session JWT + DPoP
  try {
    const { payload } = await jwtVerify(bearer, JWKS, {
      issuer: "https://api.opencheckout.dev",
      audience: "widget.opencheckout.dev",
      algorithms: ["ES256", "EdDSA"],
      clockTolerance: 30,
    });
    if (await revocationStore.has(payload.jti as string))
      return c.json({ error: "revoked" }, 401);
    await verifyDpop(c.req, payload.cnf);
    c.set("auth", {
      kind: "jwt",
      tenantId: payload.tenantId as string,
      scopes: (payload.scope as string).split(" "),
      jti: payload.jti as string,
    });
    return next();
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
});

export const requireScope = (...needed: string[]) =>
  createMiddleware(async (c, next) => {
    const have = c.get("auth").scopes;
    if (!needed.every(s => have.includes(s)))
      return c.json({ error: "scope_insufficient", required: needed }, 403);
    return next();
  });
```

### 12. curl 예시

```bash
# 머천트 → checkout 세션 생성
curl -sS https://api.opencheckout.dev/v1/checkout/sessions \
  -H "Authorization: Bearer oc_live_sk_Xr3m9..." \
  -H "Idempotency-Key: 7c9e6679-7425-40de-944b-e07fc1f90ae7" \
  -d '{"amount":89000,"currency":"KRW","lineItems":[...]}'

# Widget → 결제 확정
curl -sS https://api.opencheckout.dev/v1/payments/pay_.../confirm \
  -H "Authorization: Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6..." \
  -H "DPoP: eyJhbGciOiJFUzI1NiIsInR5cCI6ImRwb3Arand0..." \
  -d '{"paymentKey":"...","orderId":"..."}'

# JWKS
curl -sS https://api.opencheckout.dev/v1/.well-known/jwks.json | jq
```

## Consequences

**긍정**: Stripe 수준 키 위생 + JWT BCP. Scope 1:1 RBAC 매핑. DPoP + JTI 철회로 탈취 window 5분. KMS 분리.
**부정**: argon2id verify ~50–100ms → Edge에선 bcrypt cost=12 또는 TTL 60s 캐시. DPoP Widget 복잡도 +2KB. JWKS 2단계 회전. mTLS Node 전용.

**가정**: TLS 1.2+, HSTS preload, OCSP stapling. Redis 장애 시 JTI fail-open with log+alert — ADR-003 재검토 필요.

## Checklist

- [ ] `oc_live_pk_`가 `checkout:create` 외 scope 요청 시 403
- [ ] `none`/`HS256` JWT 거부 (RFC 8725 §3.1)
- [ ] JWKS 회전 후 24h 내 구키 JWT 유효
- [ ] DPoP jti replay 거부
- [ ] Webhook timestamp skew 301s → 거부
- [ ] Impersonation 액션 전수에 `impersonatedBy` 로그
- [ ] API key HMAC lookup timing-safe
- [ ] Secret scanning: `oc_live_sk_` GitHub publish → 5분 내 revoke
- [ ] mTLS 인증서 만료 30d 전 알림
- [ ] Rate limit: JWT = tenantId, API key = keyId

## Open Questions

1. Publishable key 완전 제거 (매 세션 JWT만) — Stripe Link vs Elements
2. DPoP 전 JWT 필수 vs 고가치 엔드포인트만
3. Impersonation 2-man rule 임계 ($1000) 통화·tenant 구성 가능?
4. JWT `aud` 도메인 vs tenantId
5. Webhook secret 루트 HKDF 파생 vs 별도 발급
6. Edge argon2 → bcrypt/WASM argon2?
7. JTI blacklist Redis 장애: fail-open vs fail-closed
