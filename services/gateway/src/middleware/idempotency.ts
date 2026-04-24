import { type IdempotencyKey, asIdempotencyKey } from "@opencheckout/core";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

declare module "hono" {
  interface ContextVariableMap {
    idempotencyKey: IdempotencyKey | undefined;
  }
}

const IDEMPOTENCY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Reads Idempotency-Key header for mutating requests.
 * Required on POST /payments/intents, /orders, /refunds (ADR-002).
 */
export const idempotencyMiddleware: MiddlewareHandler = createMiddleware(async (c, next) => {
  const method = c.req.method;
  if (!IDEMPOTENCY_METHODS.has(method)) {
    c.set("idempotencyKey", undefined);
    await next();
    return;
  }
  const key = c.req.header("Idempotency-Key");
  c.set("idempotencyKey", key ? asIdempotencyKey(key) : undefined);
  await next();
});
