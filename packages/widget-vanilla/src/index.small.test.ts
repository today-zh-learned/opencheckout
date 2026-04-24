import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_EVENT_NAME,
  CUSTOMER_KEY_ANONYMOUS,
  OpenCheckout,
  OpenCheckoutSecurityError,
  OpenCheckoutValidationError,
  WIDGET_VERSION,
  assertPanFree,
  containsPan,
  createWidgetMessage,
  isOpenCheckoutMessage,
  load,
} from "./index.js";

function makeTarget(id: string): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  document.body.append(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("PAN boundary invariants (preserved from v0 widget)", () => {
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

describe("public surface", () => {
  it("exposes OpenCheckout.load and constants", () => {
    expect(WIDGET_VERSION).toBe("0.0.1");
    expect(CHECKOUT_EVENT_NAME).toBe("opencheckout:event");
    expect(CUSTOMER_KEY_ANONYMOUS).toBe("ANONYMOUS");
    expect(OpenCheckout.load).toBeTypeOf("function");
    expect(load).toBeTypeOf("function");
  });
});

describe("publishableKey validation", () => {
  it.each([
    ["pk_test_kr01_abc123", true],
    ["pk_live_jp02_XYZabc", true],
    ["pk_test_sandbox_demo001", true],
  ])("accepts %s", async (key, _) => {
    await expect(load({ publishableKey: key })).resolves.toMatchObject({
      publishableKey: key,
    });
  });

  it.each([[""], ["sk_test_x_y"], ["pk_stage_x_y"], ["pk_test_ab_cd"], ["pk_test_kr01_ab"]])(
    "rejects %s",
    async (key) => {
      await expect(load({ publishableKey: key })).rejects.toBeInstanceOf(
        OpenCheckoutValidationError,
      );
    },
  );
});

describe("gatewayUrl validation", () => {
  it("accepts http and https gateway URLs", async () => {
    await expect(
      load({ publishableKey: "pk_test_kr01_abc123", gatewayUrl: "https://self.host/" }),
    ).resolves.toBeDefined();
  });

  it("rejects non-http gateway URLs", async () => {
    await expect(
      load({
        publishableKey: "pk_test_kr01_abc123",
        gatewayUrl: "javascript:alert(1)",
      }),
    ).rejects.toBeInstanceOf(OpenCheckoutValidationError);
  });
});

describe("customerKey validation", () => {
  const baseKey = "pk_test_kr01_abc123";

  it("accepts ANONYMOUS", async () => {
    const oc = await load({ publishableKey: baseKey });
    expect(() => oc.widgets({ customerKey: "ANONYMOUS" })).not.toThrow();
  });

  it("accepts 36-char UUID", async () => {
    const oc = await load({ publishableKey: baseKey });
    expect(() => oc.widgets({ customerKey: "12345678-1234-1234-1234-1234567890ab" })).not.toThrow();
  });

  it("rejects too-short keys", async () => {
    const oc = await load({ publishableKey: baseKey });
    expect(() => oc.widgets({ customerKey: "a" })).toThrow(OpenCheckoutValidationError);
  });

  it("rejects alnum-only keys (no allowed special char)", async () => {
    const oc = await load({ publishableKey: baseKey });
    expect(() => oc.widgets({ customerKey: "abcdef" })).toThrow(OpenCheckoutValidationError);
  });

  it("rejects 51-char keys", async () => {
    const oc = await load({ publishableKey: baseKey });
    const long = `${"a".repeat(50)}-`; // 51 chars, includes special
    expect(() => oc.widgets({ customerKey: long })).toThrow(OpenCheckoutValidationError);
  });
});

describe("two-step init order", () => {
  it("throws when renderAddress called before setAmount", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    makeTarget("address");
    expect(() => widgets.renderAddress({ selector: "#address" })).toThrow(
      OpenCheckoutValidationError,
    );
  });
});

describe("setAmount propagation via EventBus", () => {
  it("broadcasts amount:change to all mounted widgets", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    widgets.setOrder({ id: "order_1", name: "Test" });

    makeTarget("a");
    makeTarget("s");
    makeTarget("p");
    makeTarget("g");

    widgets.renderAddress({ selector: "#a" });
    widgets.renderShipping({ selector: "#s" });
    widgets.renderPayment({ selector: "#p" });
    widgets.renderAgreement({ selector: "#g" });

    // Each widget subscribes to amount:change; we observe re-renders succeed without throwing
    // by setting a new amount and checking shadow roots stay populated.
    expect(() => widgets.setAmount({ value: 2000, currency: "KRW" })).not.toThrow();

    const hosts = ["a", "s", "p", "g"].map(
      (id) => document.getElementById(id)?.firstElementChild as HTMLElement | null,
    );
    for (const host of hosts) {
      expect(host).not.toBeNull();
      expect(host?.shadowRoot).toBeTruthy();
    }
  });
});

describe("sub-widget lifecycle", () => {
  it("renderAddress().destroy() removes the element from DOM and rejects subsequent on()", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });

    const target = makeTarget("addr");
    const addr = widgets.renderAddress({ selector: "#addr" });
    expect(target.firstElementChild).toBeTruthy();

    addr.destroy();
    expect(target.firstElementChild).toBeNull();
    expect(() => addr.on("addressSelect", () => {})).toThrow();
  });
});

describe("PAN guard in requestPayment", () => {
  it("throws OpenCheckoutSecurityError when customerEmail contains a PAN", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    widgets.setOrder({ id: "order_1", name: "Test" });

    await expect(
      widgets.requestPayment({
        successUrl: "https://m.example/ok",
        failUrl: "https://m.example/fail",
        customerEmail: "card 4111 1111 1111 1111",
      }),
    ).rejects.toBeInstanceOf(OpenCheckoutSecurityError);
  });
});

describe("agreement gate in requestPayment", () => {
  it("throws when agreement is not accepted", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    widgets.setOrder({ id: "order_1", name: "Test" });

    await expect(
      widgets.requestPayment({
        successUrl: "https://m.example/ok",
        failUrl: "https://m.example/fail",
      }),
    ).rejects.toBeInstanceOf(OpenCheckoutValidationError);
  });

  it("redirects to successUrl when agreement is accepted", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    widgets.setOrder({ id: "order_1", name: "Test" });

    makeTarget("ag");
    const ag = widgets.renderAgreement({ selector: "#ag" });
    // Flip agreement via listener path
    const off = ag.on("agreementStatusChange", () => {});
    // Toggle the checkbox programmatically
    const host = document.getElementById("ag")?.firstElementChild as HTMLElement;
    const input = host?.shadowRoot?.querySelector("input[type=checkbox]") as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    off();

    const assignSpy = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    await widgets.requestPayment({
      successUrl: "https://m.example/ok",
      failUrl: "https://m.example/fail",
    });
    expect(assignSpy).toHaveBeenCalledOnce();
    const call = assignSpy.mock.calls[0]?.[0];
    expect(typeof call).toBe("string");
    expect(String(call)).toContain("https://m.example/ok");
    expect(String(call)).toContain("paymentKey=");
    expect(String(call)).toContain("orderId=order_1");
    assignSpy.mockRestore();
  });
});

describe("setOrder / setAmount PAN scan", () => {
  it("throws when setOrder receives a PAN-bearing field", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    expect(() => widgets.setOrder({ id: "order_1", name: "4111 1111 1111 1111" })).toThrow(
      OpenCheckoutSecurityError,
    );
  });
});
