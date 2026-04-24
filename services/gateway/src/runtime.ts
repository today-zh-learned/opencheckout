import { createHmac } from "node:crypto";
import type { WidgetTokenIssuer } from "./routes/widget.js";

const WIDGET_TOKEN_TTL_MS = 5 * 60 * 1000;

type GatewayRuntimeEnv = {
  readonly ALLOWED_ORIGINS?: string;
  readonly NODE_ENV?: string;
  readonly WIDGET_TOKEN_SECRET?: string;
};

export function resolveAllowedOrigins(env: GatewayRuntimeEnv = process.env): string[] | "*" {
  const origins = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (env.NODE_ENV === "production" && (origins.length === 0 || origins.includes("*"))) {
    throw new Error("ALLOWED_ORIGINS must be set to explicit origins in production");
  }

  if (origins.length === 0 || (origins.length === 1 && origins[0] === "*")) {
    return "*";
  }

  return origins.map((origin) => normalizeOrigin(origin));
}

export function createWidgetTokenIssuer(env: GatewayRuntimeEnv = process.env): WidgetTokenIssuer {
  const secret = env.WIDGET_TOKEN_SECRET;
  if (env.NODE_ENV === "production" && !secret) {
    throw new Error("WIDGET_TOKEN_SECRET must be set in production");
  }

  return {
    async issueWidgetToken(input) {
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + WIDGET_TOKEN_TTL_MS);
      const payload = {
        tenantId: input.tenantId,
        orderId: input.orderId,
        ...(input.origin ? { origin: input.origin } : {}),
        iat: Math.floor(issuedAt.getTime() / 1000),
        exp: Math.floor(expiresAt.getTime() / 1000),
      };
      const token = secret
        ? createSignedWidgetToken(payload, secret)
        : createDevWidgetToken(payload);

      return {
        token,
        tokenType: "Bearer",
        tenantId: input.tenantId,
        orderId: input.orderId,
        allowedOrigins: input.origin ? [input.origin] : [],
        expiresAt: expiresAt.toISOString(),
      };
    },
  };
}

function normalizeOrigin(raw: string): string {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("ALLOWED_ORIGINS entries must use http or https");
  }
  return url.origin;
}

function createSignedWidgetToken(payload: object, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlJson(header);
  const encodedPayload = base64UrlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `wgt_${signingInput}.${signature}`;
}

function createDevWidgetToken(payload: object): string {
  return `wgt_${base64UrlJson(payload)}`;
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
