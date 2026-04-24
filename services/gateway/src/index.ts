import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import { idempotencyMiddleware } from "./middleware/idempotency.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { tenantMiddleware } from "./middleware/tenant.js";
import { health } from "./routes/health.js";
import { type PublicOrderReader, widgetRoutes } from "./routes/widget.js";
import { createWidgetTokenIssuer, resolveAllowedOrigins } from "./runtime.js";

export function createApp(): Hono {
  const app = new Hono();

  // ── Security headers (ADR-003) ──────────────────────────────────────
  app.use("*", secureHeaders());

  // ── CORS — restrict in prod via ALLOWED_ORIGINS env ─────────────────
  const allowedOrigins = resolveAllowedOrigins();
  app.use(
    "*",
    cors({
      origin: allowedOrigins,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-Tenant-Id",
        "Idempotency-Key",
        "X-Request-Id",
        "If-Match",
      ],
      exposeHeaders: ["X-Request-Id", "ETag", "Retry-After"],
      maxAge: 86400,
    }),
  );

  // ── Request ID propagation ───────────────────────────────────────────
  app.use("*", requestIdMiddleware);

  // ── Structured access log ────────────────────────────────────────────
  app.use("*", logger());

  // ── Global timeout (TDD-01 §4) ───────────────────────────────────────
  app.use("*", timeout(10_000));

  // ── Idempotency-Key reader (ADR-002) ─────────────────────────────────
  app.use("/v1/*", idempotencyMiddleware);

  // ── Tenant resolution (ADR-004) ──────────────────────────────────────
  // Public read models intentionally remain tenant-header-free.
  app.use("/v1/widget/*", tenantMiddleware);
  app.use("/v1/payments/*", tenantMiddleware);
  app.use("/v1/addresses/*", tenantMiddleware);
  app.use("/v1/orders/*", tenantMiddleware);

  const notFoundPublicOrders: PublicOrderReader = {
    async getPublicOrder() {
      return undefined;
    },
  };

  // ── Routes ───────────────────────────────────────────────────────────
  app.route("/", health);
  app.route(
    "/",
    widgetRoutes({
      tokenIssuer: createWidgetTokenIssuer(),
      publicOrders: notFoundPublicOrders,
    }),
  );

  // ── Global 404 / error fallback ──────────────────────────────────────
  app.notFound((c) =>
    c.json(
      {
        type: "https://opencheckout.dev/errors/not-found",
        title: "Not Found",
        status: 404,
        instance: c.req.path,
      },
      404,
    ),
  );

  app.onError((err, c) => {
    console.error({ requestId: c.get("requestId"), error: err.message, stack: err.stack });
    return c.json(
      {
        type: "https://opencheckout.dev/errors/internal",
        title: "Internal Server Error",
        status: 500,
        instance: c.req.path,
      },
      500,
    );
  });

  return app;
}

export const app = createApp();

export function startServer(): void {
  const port = Number(process.env.PORT ?? 3000);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`OpenCheckout Gateway listening on http://localhost:${info.port}`);
  });
}

if (isDirectRun()) {
  startServer();
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint ? import.meta.url === pathToFileURL(entrypoint).href : false;
}
