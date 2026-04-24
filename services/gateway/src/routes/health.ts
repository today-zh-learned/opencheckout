import { Hono } from "hono";

const health = new Hono();

health.get("/health", (c) =>
  c.json({
    status: "ok",
    version: process.env.npm_package_version ?? "0.0.1",
    timestamp: new Date().toISOString(),
  }),
);

health.get("/ready", (c) => c.json({ status: "ready" }));

export { health };
