import { asTenantId } from "@opencheckout/core";
import { describe, expect, it } from "vitest";
import { createWidgetTokenIssuer, resolveAllowedOrigins } from "./runtime.js";

describe("resolveAllowedOrigins", () => {
  it("defaults to wildcard outside production", () => {
    expect(resolveAllowedOrigins({ NODE_ENV: "development" })).toBe("*");
  });

  it("normalizes explicit origins", () => {
    expect(
      resolveAllowedOrigins({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://merchant.example/checkout, http://localhost:3000/path",
      }),
    ).toEqual(["https://merchant.example", "http://localhost:3000"]);
  });

  it("rejects wildcard origins in production", () => {
    expect(() => resolveAllowedOrigins({ NODE_ENV: "production", ALLOWED_ORIGINS: "*" })).toThrow(
      /ALLOWED_ORIGINS/,
    );
  });
});

describe("createWidgetTokenIssuer", () => {
  it("requires signed widget tokens in production", () => {
    expect(() => createWidgetTokenIssuer({ NODE_ENV: "production" })).toThrow(
      /WIDGET_TOKEN_SECRET/,
    );
  });

  it("issues signed widget tokens when a secret is configured", async () => {
    const issuer = createWidgetTokenIssuer({
      NODE_ENV: "production",
      WIDGET_TOKEN_SECRET: "test_secret",
    });

    const token = await issuer.issueWidgetToken({
      tenantId: asTenantId("tenant_1"),
      orderId: "order_1",
      origin: "https://merchant.example",
    });

    expect(token.token).toMatch(/^wgt_[^.]+\.[^.]+\.[^.]+$/);
    expect(token.tokenType).toBe("Bearer");
    expect(token.allowedOrigins).toEqual(["https://merchant.example"]);
  });
});
