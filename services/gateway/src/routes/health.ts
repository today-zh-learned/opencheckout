import { Hono } from "hono";
import type { Context } from "hono";

const health = new Hono();

const healthHandler = (c: Context) =>
  c.json({
    status: "ok",
    version: process.env.npm_package_version ?? "0.0.1",
    timestamp: new Date().toISOString(),
  });

const readinessHandler = (c: Context) => c.json({ status: "ready" });

health.get("/health", healthHandler);
health.get("/healthz", healthHandler);
health.get("/ready", readinessHandler);
health.get("/readyz", readinessHandler);

export { health };
