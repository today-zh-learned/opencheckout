import { asTenantId } from "@opencheckout/core";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { tenantMiddleware } from "../middleware/tenant.js";
import { type WidgetRouteDependencies, widgetRoutes } from "./widget.js";

function buildTestApp(deps: WidgetRouteDependencies): Hono {
  const app = new Hono();
  app.use("/v1/widget/*", tenantMiddleware);
  app.route("/", widgetRoutes(deps));
  return app;
}

describe("widgetRoutes", () => {
  it("issues no-store widget tokens for tenant-scoped widget bootstrap", async () => {
    const app = buildTestApp({
      tokenIssuer: {
        async issueWidgetToken(input) {
          return {
            token: `wgt_${input.tenantId}_${input.orderId}`,
            tokenType: "Bearer",
            tenantId: input.tenantId,
            orderId: input.orderId,
            allowedOrigins: input.origin ? [input.origin] : [],
            expiresAt: "2026-04-24T12:05:00.000Z",
          };
        },
      },
      publicOrders: {
        async getPublicOrder() {
          return undefined;
        },
      },
    });

    const response = await app.request("/v1/widget/tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": "tenant_1",
      },
      body: JSON.stringify({
        orderId: "order_1",
        origin: "https://merchant.example/checkout",
      }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      token: "wgt_tenant_1_order_1",
      tokenType: "Bearer",
      tenantId: "tenant_1",
      orderId: "order_1",
      allowedOrigins: ["https://merchant.example"],
      expiresAt: "2026-04-24T12:05:00.000Z",
    });
  });

  it("rejects widget token requests with unsafe origins", async () => {
    const app = buildTestApp({
      tokenIssuer: {
        async issueWidgetToken() {
          throw new Error("should not issue token");
        },
      },
      publicOrders: {
        async getPublicOrder() {
          return undefined;
        },
      },
    });

    const response = await app.request("/v1/widget/tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": "tenant_1",
      },
      body: JSON.stringify({ orderId: "order_1", origin: "javascript:alert(1)" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      title: "Invalid widget origin",
      status: 400,
    });
  });

  it("returns cacheable public order read models without requiring tenant context", async () => {
    const app = buildTestApp({
      tokenIssuer: {
        async issueWidgetToken() {
          throw new Error("should not issue token");
        },
      },
      publicOrders: {
        async getPublicOrder(publicId) {
          return {
            publicId,
            status: "paid",
            amount: { amount: 89000, currency: "KRW" },
            updatedAt: "2026-04-24T12:00:00.000Z",
            version: "v1",
          };
        },
      },
    });

    const response = await app.request("/v1/public/orders/pub_123");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=30, s-maxage=60");
    expect(response.headers.get("ETag")).toBe('W/"v1"');
    await expect(response.json()).resolves.toEqual({
      publicId: "pub_123",
      status: "paid",
      amount: { amount: 89000, currency: "KRW" },
      updatedAt: "2026-04-24T12:00:00.000Z",
      version: "v1",
    });
  });

  it("returns 404 for unknown public orders", async () => {
    const app = buildTestApp({
      tokenIssuer: {
        async issueWidgetToken() {
          throw new Error("should not issue token");
        },
      },
      publicOrders: {
        async getPublicOrder() {
          return undefined;
        },
      },
    });

    const response = await app.request("/v1/public/orders/missing");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      title: "Public order not found",
      status: 404,
    });
  });

  it("keeps tenant middleware on token issuance", async () => {
    const app = buildTestApp({
      tokenIssuer: {
        async issueWidgetToken(input) {
          expect(input.tenantId).toBe(asTenantId("tenant_1"));
          throw new Error("tenant assertion complete");
        },
      },
      publicOrders: {
        async getPublicOrder() {
          return undefined;
        },
      },
    });

    const response = await app.request("/v1/widget/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "order_1" }),
    });

    expect(response.status).toBe(401);
  });
});
