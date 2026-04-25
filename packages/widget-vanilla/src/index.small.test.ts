import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_EVENT_NAME,
  COUNTRIES,
  COUNTRY_BY_CODE,
  CUSTOMER_KEY_ANONYMOUS,
  FALLBACK_COUNTRY,
  OpenCheckout,
  OpenCheckoutSecurityError,
  OpenCheckoutValidationError,
  WIDGET_VERSION,
  assertPanFree,
  containsPan,
  createWidgetMessage,
  getCountrySchema,
  isOpenCheckoutMessage,
  isValidPostal,
  load,
  searchCountries,
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

describe("address-data global registry", () => {
  it("registers 15 countries indexed by ISO code", () => {
    expect(COUNTRIES.length).toBe(15);
    expect(COUNTRY_BY_CODE.get("KR")?.nameKo).toBe("대한민국");
    expect(COUNTRY_BY_CODE.get("US")?.nameEn).toBe("United States");
  });

  it("KR schema exposes all 17 admin1 entries", () => {
    const kr = COUNTRY_BY_CODE.get("KR");
    expect(kr).toBeDefined();
    expect(kr?.admin1?.length).toBe(17);
    // 서울 has 25 구
    const seoul = kr?.admin1?.find((e) => e.code === "KR-11");
    expect(seoul?.children?.length).toBe(25);
  });

  it("HK has 18 districts and hides postal", () => {
    const hk = COUNTRY_BY_CODE.get("HK");
    expect(hk?.admin1?.length).toBe(18);
    expect(hk?.fields).toEqual(["admin2", "line1", "line2"]);
  });

  it("SG fields are postal/line1/line2 only", () => {
    const sg = COUNTRY_BY_CODE.get("SG");
    expect(sg?.fields).toEqual(["postal", "line1", "line2"]);
  });

  it("KR fields ordering matches design spec", () => {
    const kr = COUNTRY_BY_CODE.get("KR");
    expect(kr?.fields).toEqual(["admin1", "city", "admin2", "line1", "line2", "postal"]);
  });

  it("JP and US admin1 sizes match official subdivisions", () => {
    expect(COUNTRY_BY_CODE.get("JP")?.admin1?.length).toBe(47);
    expect(COUNTRY_BY_CODE.get("US")?.admin1?.length).toBe(51); // 50 states + DC
  });

  it("CN postalAutoFill maps every admin1 entry", () => {
    const cn = COUNTRY_BY_CODE.get("CN");
    expect(cn?.admin1?.length).toBe(31);
    expect(Object.keys(cn?.postalAutoFill ?? {}).length).toBe(31);
  });
});

describe("address-data search", () => {
  it("matches Korean alias 한국 → KR", () => {
    const result = searchCountries("한국", "ko");
    expect(result[0]?.code).toBe("KR");
  });

  it("matches USA alias → US", () => {
    const result = searchCountries("USA", "en");
    expect(result.some((c) => c.code === "US")).toBe(true);
  });

  it("matches Japanese 日本 → JP", () => {
    const result = searchCountries("日本", "en");
    expect(result.some((c) => c.code === "JP")).toBe(true);
  });

  it("returns all 15 for empty query", () => {
    expect(searchCountries("", "en").length).toBe(15);
  });

  it("falls back to ZZ for unknown ISO code", () => {
    expect(getCountrySchema("XX")).toBe(FALLBACK_COUNTRY);
  });

  it("matches Korean chosung ㄷㅎㅁㄱ → 대한민국 (KR)", () => {
    const result = searchCountries("ㄷㅎㅁㄱ", "ko");
    expect(result.some((c) => c.code === "KR")).toBe(true);
  });

  it("matches Korean chosung ㅇㅂ → 일본 (JP)", () => {
    const result = searchCountries("ㅇㅂ", "ko");
    expect(result.some((c) => c.code === "JP")).toBe(true);
  });
});

describe("postal validation", () => {
  it("validates KR 5-digit postal", () => {
    const kr = COUNTRY_BY_CODE.get("KR");
    if (!kr) throw new Error("KR schema missing");
    expect(isValidPostal(kr, "06236")).toBe(true);
    expect(isValidPostal(kr, "1234")).toBe(false);
  });

  it("validates JP 7-digit (with optional dash)", () => {
    const jp = COUNTRY_BY_CODE.get("JP");
    if (!jp) throw new Error("JP schema missing");
    expect(isValidPostal(jp, "1500001")).toBe(true);
    expect(isValidPostal(jp, "150-0001")).toBe(true);
    expect(isValidPostal(jp, "abc")).toBe(false);
  });

  it("validates Canada A1A 1A1 format", () => {
    const ca = COUNTRY_BY_CODE.get("CA");
    if (!ca) throw new Error("CA schema missing");
    expect(isValidPostal(ca, "M5V 3L9")).toBe(true);
    expect(isValidPostal(ca, "12345")).toBe(false);
  });

  it("HK has no regex (always valid)", () => {
    const hk = COUNTRY_BY_CODE.get("HK");
    if (!hk) throw new Error("HK schema missing");
    expect(isValidPostal(hk, "")).toBe(true);
    expect(isValidPostal(hk, "anything")).toBe(true);
  });
});

describe("address widget — global behaviour", () => {
  it("emits AddressSelection with both postal and zip aliased", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });

    makeTarget("addr");
    const addr = widgets.renderAddress({ selector: "#addr" });

    let captured: { postal: string; zip: string } | null = null;
    addr.on("addressSelect", (sel) => {
      captured = { postal: sel.postal, zip: sel.zip };
    });

    const host = document.getElementById("addr")?.firstElementChild as HTMLElement;
    const postalInput = host?.shadowRoot?.querySelector(
      'input[inputmode="numeric"]',
    ) as HTMLInputElement;
    expect(postalInput).toBeTruthy();
    postalInput.value = "06236";
    postalInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(captured).not.toBeNull();
    const c = captured as unknown as { postal: string; zip: string };
    expect(c.postal).toBe("06236");
    expect(c.zip).toBe("06236");
  });

  it("renders the KR admin1 select with 17 options + placeholder", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    widgets.setOrder({ id: "order_1", name: "Test", buyerCountry: "KR" });

    makeTarget("addr2");
    widgets.renderAddress({ selector: "#addr2" });

    const host = document.getElementById("addr2")?.firstElementChild as HTMLElement;
    const select = host?.shadowRoot?.querySelector("select.oc-select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    // 17 admin1 entries + 1 placeholder option
    expect(select.options.length).toBe(18);
  });

  it("hides postal field when country is HK", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    widgets.setOrder({ id: "order_1", name: "Test", buyerCountry: "HK" });

    makeTarget("addr3");
    widgets.renderAddress({ selector: "#addr3" });

    const host = document.getElementById("addr3")?.firstElementChild as HTMLElement;
    const numericInput = host?.shadowRoot?.querySelector('input[inputmode="numeric"]');
    expect(numericInput).toBeNull();
  });
});
