import { describe, expect, it } from "vitest";
import {
  CHECKOUT_EVENT_NAME,
  OpenCheckout,
  OpenCheckoutSecurityError,
  WIDGET_TAG_NAME,
  assertPanFree,
  containsPan,
  createWidgetMessage,
  isOpenCheckoutMessage,
  normalizeCheckoutWidgetConfig,
} from "./index.js";

describe("widget PAN boundary guard", () => {
  it("detects PAN-like card data nested in postMessage payloads", () => {
    expect(containsPan({ payload: { cardNumber: "4111 1111 1111 1111" } })).toBe(true);
    expect(containsPan(["5555-5555-5555-4444"])).toBe(true);
  });

  it("does not flag non-card checkout identifiers or amounts", () => {
    expect(containsPan({ orderId: "order_202604240000000", amount: "89000" })).toBe(false);
    expect(containsPan({ masked: "**** **** **** 1111" })).toBe(false);
  });

  it("throws before creating an outbound widget message with card data", () => {
    expect(() =>
      createWidgetMessage("opencheckout.widget.event", { value: "4111111111111111" }, "nonce"),
    ).toThrow(OpenCheckoutSecurityError);
  });

  it("creates typed OpenCheckout messages for PAN-free payloads", () => {
    const message = createWidgetMessage(
      "opencheckout.widget.event",
      { type: "checkout.started", orderId: "order_123" },
      "nonce_123",
    );

    expect(isOpenCheckoutMessage(message)).toBe(true);
    expect(message.source).toBe("opencheckout.widget");
    expect(message.version).toBe("2026-04-24");
    expect(message.nonce).toBe("nonce_123");
  });

  it("accepts explicitly PAN-free event payloads", () => {
    expect(() => assertPanFree({ type: "payment.success", paymentId: "pay_123" })).not.toThrow();
  });
});

describe("widget configuration contract", () => {
  it("normalizes defaults and gateway URLs", () => {
    const config = normalizeCheckoutWidgetConfig({
      tenantId: " tenant_1 ",
      orderId: " order_1 ",
      gatewayUrl: "https://api.sandbox.opencheckout.dev",
      allowedOrigins: ["https://merchant.example/path", "https://merchant.example/checkout"],
      nonce: "fixed",
    });

    expect(config.tenantId).toBe("tenant_1");
    expect(config.orderId).toBe("order_1");
    expect(config.gatewayUrl).toBe("https://api.sandbox.opencheckout.dev/");
    expect(config.locale).toBe("en");
    expect(config.theme).toBe("light");
    expect(config.allowedOrigins).toEqual(["https://merchant.example"]);
    expect(config.nonce).toBe("fixed");
  });

  it("rejects non-http gateway URLs", () => {
    expect(() =>
      normalizeCheckoutWidgetConfig({
        tenantId: "tenant_1",
        orderId: "order_1",
        gatewayUrl: "javascript:alert(1)",
      }),
    ).toThrow(/gatewayUrl/);
  });

  it("exports the one-line integration surface", () => {
    expect(WIDGET_TAG_NAME).toBe("opencheckout-widget");
    expect(CHECKOUT_EVENT_NAME).toBe("opencheckout:event");
    expect(OpenCheckout.mount).toBeTypeOf("function");
    expect(OpenCheckout.registerElement).toBeTypeOf("function");
  });
});
