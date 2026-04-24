import { generateUlid } from "@opencheckout/core";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

export const requestIdMiddleware: MiddlewareHandler = createMiddleware(async (c, next) => {
  const id = c.req.header("X-Request-Id") ?? generateUlid();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
});
