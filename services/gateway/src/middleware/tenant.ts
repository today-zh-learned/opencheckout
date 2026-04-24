import { type TenantId, asTenantId } from "@opencheckout/core";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

declare module "hono" {
  interface ContextVariableMap {
    tenantId: TenantId;
  }
}

/**
 * Resolves X-Tenant-Id header → TenantId context variable.
 * Actual API-key-to-tenant lookup deferred to ADR-004 implementation.
 */
export const tenantMiddleware: MiddlewareHandler = createMiddleware(async (c, next) => {
  const raw = c.req.header("X-Tenant-Id") ?? c.req.header("x-tenant-id");
  if (!raw) {
    return c.json(
      {
        type: "https://opencheckout.dev/errors/missing-tenant",
        title: "Missing X-Tenant-Id",
        status: 401,
      },
      401,
    );
  }
  c.set("tenantId", asTenantId(raw));
  return next();
});
