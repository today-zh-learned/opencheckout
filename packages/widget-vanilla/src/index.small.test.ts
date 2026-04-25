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
  formatAddress,
  getCountrySchema,
  isOpenCheckoutMessage,
  isValidPostal,
  load,
  loadCountrySchema,
  searchCountries,
  type AgreementClause,
} from "./index.js";
import { _clearCountrySchemaCache } from "./internal/address-lazy.js";

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
  it("registers 16 countries indexed by ISO code", () => {
    expect(COUNTRIES.length).toBe(16);
    expect(COUNTRY_BY_CODE.get("KR")?.nameKo).toBe("대한민국");
    expect(COUNTRY_BY_CODE.get("US")?.nameEn).toBe("United States");
    expect(COUNTRY_BY_CODE.get("BR")?.nameEn).toBe("Brazil");
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

  it("returns all 16 for empty query", () => {
    expect(searchCountries("", "en").length).toBe(16);
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

/**
 * Helpers for payment-widget tests. The widget shows a brief skeleton (~100ms)
 * before mounting the real tile UI, so tests wait for the radio role to appear.
 */
function paymentHost(id: string): HTMLElement {
  const target = document.getElementById(id);
  if (!target?.firstElementChild) throw new Error(`payment widget host missing: ${id}`);
  return target.firstElementChild as HTMLElement;
}

async function waitForTiles(host: HTMLElement, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tile = host.shadowRoot?.querySelector('[role="radio"][data-method]');
    if (tile) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("payment tiles never rendered");
}

function getTile(host: HTMLElement, code: string): HTMLElement {
  const tile = host.shadowRoot?.querySelector(`[data-method="${code}"]`) as HTMLElement | null;
  if (!tile) throw new Error(`tile not found: ${code}`);
  return tile;
}

function visibleMethodCodes(host: HTMLElement): string[] {
  const tiles = host.shadowRoot?.querySelectorAll("[data-method]");
  return Array.from(tiles ?? []).map((t) => (t as HTMLElement).dataset.method ?? "");
}

describe("payment widget — method visibility & details (PAN-free)", () => {
  it("KR buyer sees card / transfer / virtual-account / easy-pay", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "ko" });
    widgets.setAmount({ value: 49900, currency: "KRW" });
    widgets.setOrder({ id: "o1", name: "Glow Serum", buyerCountry: "KR" });

    makeTarget("p-kr");
    widgets.renderPayment({ selector: "#p-kr" });
    const host = paymentHost("p-kr");
    await waitForTiles(host);

    const codes = visibleMethodCodes(host);
    expect(codes).toContain("card");
    expect(codes).toContain("transfer");
    expect(codes).toContain("virtual-account");
    expect(codes).toContain("easy-pay");
    expect(codes).not.toContain("foreign-card");
  });

  it("intl buyer sees card / foreign-card / easy-pay (no kr-only methods)", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "en" });
    widgets.setAmount({ value: 49.9, currency: "USD" });
    widgets.setOrder({ id: "o2", name: "Glow Serum", buyerCountry: "US" });

    makeTarget("p-us");
    widgets.renderPayment({ selector: "#p-us" });
    const host = paymentHost("p-us");
    await waitForTiles(host);

    const codes = visibleMethodCodes(host);
    expect(codes).toContain("card");
    expect(codes).toContain("foreign-card");
    expect(codes).toContain("easy-pay");
    expect(codes).not.toContain("transfer");
    expect(codes).not.toContain("virtual-account");
  });

  it("emits installmentChange when KR card is selected and a month tile is clicked", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "ko" });
    widgets.setAmount({ value: 100000, currency: "KRW" });
    widgets.setOrder({ id: "o3", name: "Test", buyerCountry: "KR" });

    makeTarget("p-inst");
    const pay = widgets.renderPayment({ selector: "#p-inst" });
    const host = paymentHost("p-inst");
    await waitForTiles(host);

    let installmentReceived: number | null = null;
    pay.on("installmentChange", (m) => {
      installmentReceived = m;
    });

    // Select card tile (already default), then click a 3-month installment cell.
    getTile(host, "card").click();
    const cells = host.shadowRoot?.querySelectorAll(".oc-installment-cell");
    expect(cells?.length).toBeGreaterThan(2);
    const threeMonth = Array.from(cells ?? []).find((c) => (c.textContent ?? "").includes("3"));
    expect(threeMonth).toBeTruthy();
    (threeMonth as HTMLButtonElement).click();

    expect(installmentReceived).toBe(3);
  });

  it("emits bankSelect when virtual-account is chosen and bank changes", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "ko" });
    widgets.setAmount({ value: 100000, currency: "KRW" });
    widgets.setOrder({ id: "o4", name: "Test", buyerCountry: "KR" });

    makeTarget("p-bank");
    const pay = widgets.renderPayment({ selector: "#p-bank" });
    const host = paymentHost("p-bank");
    await waitForTiles(host);

    let bankReceived: string | null = null;
    pay.on("bankSelect", (b) => {
      bankReceived = b;
    });

    getTile(host, "virtual-account").click();
    const select = host.shadowRoot?.querySelector("select.oc-bank-select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.options.length).toBeGreaterThan(1);
    select.value = "shinhan";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(bankReceived).toBe("shinhan");
  });

  it("emits easyPaySelect when easy-pay brand chip is clicked", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "en" });
    widgets.setAmount({ value: 49.9, currency: "USD" });
    widgets.setOrder({ id: "o5", name: "Test", buyerCountry: "US" });

    makeTarget("p-easy");
    const pay = widgets.renderPayment({
      selector: "#p-easy",
      easyPayBrands: ["paypal", "other"],
    });
    const host = paymentHost("p-easy");
    await waitForTiles(host);

    let brandReceived: string | null = null;
    pay.on("easyPaySelect", (b) => {
      brandReceived = b;
    });

    getTile(host, "easy-pay").click();
    const chips = host.shadowRoot?.querySelectorAll(".oc-easy-pay-chip");
    expect(chips?.length).toBe(2);
    const other = Array.from(chips ?? []).find(
      (c) => (c.getAttribute("data-selected") ?? "") === "false",
    );
    expect(other).toBeTruthy();
    (other as HTMLButtonElement).click();

    // The default brand (paypal) is auto-selected on tile click; the second chip is "other".
    expect(brandReceived).toBe("other");
  });

  it("methods option restricts the visible tile set", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "ko" });
    widgets.setAmount({ value: 49900, currency: "KRW" });
    widgets.setOrder({ id: "o6", name: "Test", buyerCountry: "KR" });

    makeTarget("p-only");
    widgets.renderPayment({ selector: "#p-only", methods: ["easy-pay"] });
    const host = paymentHost("p-only");
    await waitForTiles(host);

    const codes = visibleMethodCodes(host);
    expect(codes).toEqual(["easy-pay"]);
  });

  it("renders no card-number / cvc / expiry input fields (PAN boundary)", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "ko" });
    widgets.setAmount({ value: 49900, currency: "KRW" });
    widgets.setOrder({ id: "o7", name: "Test", buyerCountry: "KR" });

    makeTarget("p-pan");
    widgets.renderPayment({ selector: "#p-pan" });
    const host = paymentHost("p-pan");
    await waitForTiles(host);

    // Click each method and assert no PAN-collecting field appears.
    for (const code of ["card", "transfer", "virtual-account", "easy-pay"]) {
      const tile = host.shadowRoot?.querySelector(`[data-method="${code}"]`) as HTMLElement;
      tile.click();
      const inputs = Array.from(host.shadowRoot?.querySelectorAll("input") ?? []);
      for (const inp of inputs) {
        const name = (inp.getAttribute("name") ?? "").toLowerCase();
        const auto = (inp.getAttribute("autocomplete") ?? "").toLowerCase();
        const ph = (inp.getAttribute("placeholder") ?? "").toLowerCase();
        const type = (inp.getAttribute("type") ?? "").toLowerCase();
        // Hidden tile-radios are allowed (name = "oc-payment", value = method code, no PAN)
        // No card-number / cvc / expiry inputs.
        expect(name).not.toContain("card");
        expect(name).not.toContain("cvc");
        expect(name).not.toContain("cvv");
        expect(name).not.toContain("expir");
        expect(auto).not.toContain("cc-");
        expect(ph).not.toContain("4111");
        expect(ph).not.toContain("cvc");
        expect(type).not.toBe("password");
      }
    }
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

describe("address widget — google.type.PostalAddress alias view", () => {
  it("populates regionCode/locality/administrativeArea/addressLines on emit", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "ko" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    widgets.setOrder({ id: "order_1", name: "Test", buyerCountry: "KR" });

    makeTarget("addr-proto");
    const addr = widgets.renderAddress({ selector: "#addr-proto" });

    let captured: Record<string, unknown> | null = null;
    addr.on("addressSelect", (sel) => {
      captured = sel as unknown as Record<string, unknown>;
    });

    const host = document.getElementById("addr-proto")?.firstElementChild as HTMLElement;
    const postalInput = host?.shadowRoot?.querySelector(
      'input[inputmode="numeric"]',
    ) as HTMLInputElement;
    postalInput.value = "06236";
    postalInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(captured).not.toBeNull();
    const c = captured as unknown as {
      regionCode: string;
      languageCode: string;
      postalCode: string;
      addressLines: readonly string[];
      recipients: readonly string[];
    };
    expect(c.regionCode).toBe("KR");
    expect(c.languageCode).toBe("ko");
    expect(c.postalCode).toBe("06236");
    expect(Array.isArray(c.addressLines)).toBe(true);
    expect(Array.isArray(c.recipients)).toBe(true);
    expect(c.recipients.length).toBe(0);
  });
});

describe("formatAddress — country-aware printable label", () => {
  it("KR ko produces 우편번호-prefixed first line", () => {
    const out = formatAddress(
      {
        country: "KR",
        admin1: "서울특별시",
        admin2: "강남구",
        city: "",
        line1: "테헤란로 521",
        postal: "06236",
        zip: "06236",
      },
      { locale: "ko" },
    );
    expect(out.split("\n")[0]).toBe("우편번호 06236");
    expect(out).toContain("테헤란로 521");
  });

  it("US default places city, state, postal on cityLine and country last", () => {
    const out = formatAddress({
      country: "US",
      admin1: "CA",
      city: "San Francisco",
      line1: "1455 Market St",
      line2: "Floor 6",
      postal: "94103",
      zip: "94103",
    });
    const lines = out.split("\n");
    expect(lines[0]).toBe("1455 Market St");
    expect(lines[1]).toBe("Floor 6");
    expect(lines[2]).toBe("San Francisco, CA 94103");
    expect(lines[3]).toBe("United States");
  });

  it("JP starts with 〒postal and packs region tightly", () => {
    const out = formatAddress({
      country: "JP",
      admin1: "東京都",
      city: "渋谷区",
      line1: "1-2-3",
      postal: "150-0001",
      zip: "150-0001",
    });
    expect(out).toMatch(/^〒150-0001/);
    expect(out).toContain("東京都渋谷区");
  });

  it("multiline=false joins with comma", () => {
    const out = formatAddress(
      {
        country: "SG",
        line1: "1 Marina Bay",
        postal: "018989",
        zip: "018989",
      },
      { multiline: false },
    );
    expect(out).toBe("1 Marina Bay, Singapore 018989");
  });
});

describe("loadCountrySchema — lazy libaddressinput fetch", () => {
  beforeEach(() => {
    _clearCountrySchemaCache();
  });

  it("converts a libaddressinput response into our CountrySchema and caches it", async () => {
    const fakeResponse = {
      key: "MX",
      name: "MEXICO",
      fmt: "%N%n%O%n%A%n%D%n%Z %C, %S",
      require: "ACZS",
      zip: "\\d{5}",
      zipex: "02860,01000",
    };
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toContain("/data/MX");
      return {
        ok: true,
        json: async () => fakeResponse,
      } as unknown as Response;
    });

    const schema = await loadCountrySchema("mx", { fetcher: fetcher as unknown as typeof fetch });
    expect(schema).toBeDefined();
    expect(schema?.code).toBe("MX");
    expect(schema?.postalRegex).toBe("^\\d{5}$");
    expect(schema?.postalPlaceholder).toBe("02860");
    expect(schema?.fields).toContain("line1");
    expect(schema?.required).toContain("postal");

    // Second call hits cache (fetcher not invoked again).
    await loadCountrySchema("mx", { fetcher: fetcher as unknown as typeof fetch });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when the upstream response is not ok", async () => {
    const fetcher = vi.fn(async () => ({ ok: false }) as unknown as Response);
    const schema = await loadCountrySchema("ZZ", {
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(schema).toBeUndefined();
  });
});

describe("PAN guard — bypass vectors hardened in v0.0.1", () => {
  it("catches dot-separated PAN", () => {
    expect(() => assertPanFree("4111.1111.1111.1111")).toThrow(OpenCheckoutSecurityError);
  });

  it("catches slash-separated PAN", () => {
    expect(() => assertPanFree("4111/1111/1111/1111")).toThrow(OpenCheckoutSecurityError);
  });

  it("catches NBSP-separated PAN", () => {
    expect(() => assertPanFree("4111 1111 1111 1111")).toThrow(
      OpenCheckoutSecurityError,
    );
  });

  it("catches newline-separated PAN", () => {
    expect(() => assertPanFree("4111\n1111\n1111\n1111")).toThrow(OpenCheckoutSecurityError);
  });

  it("catches full-width digits via NFKC normalize", () => {
    expect(() => assertPanFree("４１１１１１１１１１１１１１１１")).toThrow(OpenCheckoutSecurityError);
  });

  it("catches PAN nested inside a Map value", () => {
    const m = new Map<string, string>([["k", "4111111111111111"]]);
    expect(() => assertPanFree(m)).toThrow(OpenCheckoutSecurityError);
  });

  it("catches PAN encoded as ASCII bytes in a Uint8Array", () => {
    const bytes = new TextEncoder().encode("4111111111111111");
    expect(() => assertPanFree(bytes)).toThrow(OpenCheckoutSecurityError);
  });

  it("catches PAN nested inside a Set", () => {
    const s = new Set<string>(["4111111111111111"]);
    expect(() => assertPanFree(s)).toThrow(OpenCheckoutSecurityError);
  });

  it("rejects unsupported typed arrays (Int16Array)", () => {
    expect(() => assertPanFree(new Int16Array([1, 2, 3]))).toThrow(OpenCheckoutSecurityError);
  });

  it("treats undefined/null as a no-op", () => {
    expect(() => assertPanFree(undefined)).not.toThrow();
    expect(() => assertPanFree(null)).not.toThrow();
  });
});

describe("requestPayment — successUrl/failUrl validation", () => {
  async function readyWidgets() {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    widgets.setOrder({ id: "order_1", name: "Test" });
    makeTarget("ag-url");
    const ag = widgets.renderAgreement({ selector: "#ag-url" });
    const off = ag.on("agreementStatusChange", () => {});
    const host = document.getElementById("ag-url")?.firstElementChild as HTMLElement;
    const input = host?.shadowRoot?.querySelector("input[type=checkbox]") as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    off();
    return widgets;
  }

  it("rejects javascript: URL in successUrl", async () => {
    const widgets = await readyWidgets();
    await expect(
      widgets.requestPayment({
        successUrl: "javascript:alert(1)",
        failUrl: "https://m.example/fail",
      }),
    ).rejects.toBeInstanceOf(OpenCheckoutValidationError);
  });

  it("rejects http://attacker.com (non-localhost http)", async () => {
    const widgets = await readyWidgets();
    await expect(
      widgets.requestPayment({
        successUrl: "http://attacker.com/return",
        failUrl: "https://m.example/fail",
      }),
    ).rejects.toBeInstanceOf(OpenCheckoutValidationError);
  });

  it("rejects successUrl containing a PAN in the query string", async () => {
    const widgets = await readyWidgets();
    await expect(
      widgets.requestPayment({
        successUrl: "https://example.com/return?paymentKey=4111111111111111",
        failUrl: "https://m.example/fail",
      }),
    ).rejects.toBeInstanceOf(OpenCheckoutSecurityError);
  });

  it("accepts http://localhost:3000 as a dev carve-out", async () => {
    const widgets = await readyWidgets();
    const assignSpy = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    await widgets.requestPayment({
      successUrl: "http://localhost:3000/ok",
      failUrl: "http://localhost:3000/fail",
    });
    expect(assignSpy).toHaveBeenCalledOnce();
    const call = String(assignSpy.mock.calls[0]?.[0]);
    expect(call).toContain("http://localhost:3000/ok");
    expect(call).toContain("paymentKey=mock_preview_");
    assignSpy.mockRestore();
  });
});

describe("publishableKey — entropy & length hardening", () => {
  it("rejects low-entropy random segment (all same character)", async () => {
    await expect(load({ publishableKey: "pk_live_aaaa_aaaaaa" })).rejects.toBeInstanceOf(
      OpenCheckoutValidationError,
    );
  });

  it("rejects random segment longer than 64 chars", async () => {
    const random = "a".repeat(65);
    await expect(load({ publishableKey: `pk_test_kr01_${random}` })).rejects.toBeInstanceOf(
      OpenCheckoutValidationError,
    );
  });

  it("rejects shard segment longer than 32 chars", async () => {
    const shard = "a".repeat(33);
    await expect(load({ publishableKey: `pk_test_${shard}_abcdef` })).rejects.toBeInstanceOf(
      OpenCheckoutValidationError,
    );
  });
});

describe("gatewayUrl — scheme hardening", () => {
  it("rejects http://prod.example.com (non-localhost http)", async () => {
    await expect(
      load({ publishableKey: "pk_test_kr01_abc123", gatewayUrl: "http://prod.example.com" }),
    ).rejects.toBeInstanceOf(OpenCheckoutValidationError);
  });

  it("accepts https://prod.example.com", async () => {
    await expect(
      load({ publishableKey: "pk_test_kr01_abc123", gatewayUrl: "https://prod.example.com" }),
    ).resolves.toBeDefined();
  });

  it("accepts http://localhost:4000 as a dev carve-out", async () => {
    await expect(
      load({ publishableKey: "pk_test_kr01_abc123", gatewayUrl: "http://localhost:4000" }),
    ).resolves.toBeDefined();
  });
});

describe("postal regex strengthening", () => {
  it("US accepts ZIP+4 form", () => {
    const us = COUNTRY_BY_CODE.get("US");
    if (!us) throw new Error("US schema missing");
    expect(isValidPostal(us, "94103")).toBe(true);
    expect(isValidPostal(us, "94103-1234")).toBe(true);
    expect(isValidPostal(us, "9410")).toBe(false);
  });

  it("CA rejects forbidden first letters (D/F/I/O/Q/U)", () => {
    const ca = COUNTRY_BY_CODE.get("CA");
    if (!ca) throw new Error("CA schema missing");
    expect(isValidPostal(ca, "M5V 3L9")).toBe(true);
    expect(isValidPostal(ca, "K1A 0B1")).toBe(true);
    expect(isValidPostal(ca, "D1A 0B1")).toBe(false);
    expect(isValidPostal(ca, "F1A 0B1")).toBe(false);
  });

  it("GB accepts the GIR 0AA crown depot postcode and standard formats", () => {
    const gb = COUNTRY_BY_CODE.get("GB");
    if (!gb) throw new Error("GB schema missing");
    expect(isValidPostal(gb, "GIR 0AA")).toBe(true);
    expect(isValidPostal(gb, "SW1A 1AA")).toBe(true);
    expect(isValidPostal(gb, "M1 1AE")).toBe(true);
    expect(isValidPostal(gb, "ZZZZ")).toBe(false);
  });

  it("DE / FR / AU honour their fixed-length numeric postcodes", () => {
    const de = COUNTRY_BY_CODE.get("DE");
    const fr = COUNTRY_BY_CODE.get("FR");
    const au = COUNTRY_BY_CODE.get("AU");
    if (!de || !fr || !au) throw new Error("schema missing");
    expect(isValidPostal(de, "10115")).toBe(true);
    expect(isValidPostal(de, "1011")).toBe(false);
    expect(isValidPostal(fr, "75001")).toBe(true);
    expect(isValidPostal(fr, "750010")).toBe(false);
    expect(isValidPostal(au, "2000")).toBe(true);
    expect(isValidPostal(au, "200")).toBe(false);
  });

  it("BR accepts CEP with or without dash", () => {
    const br = COUNTRY_BY_CODE.get("BR");
    if (!br) throw new Error("BR schema missing");
    expect(isValidPostal(br, "01310-100")).toBe(true);
    expect(isValidPostal(br, "01310100")).toBe(true);
    expect(isValidPostal(br, "01310")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WCAG helpers reused across accessibility tests
// ---------------------------------------------------------------------------
function addressHost(id: string): HTMLElement {
  const target = document.getElementById(id);
  if (!target?.firstElementChild) throw new Error(`address widget host missing: ${id}`);
  return target.firstElementChild as HTMLElement;
}

describe("Payment widget WCAG — roving tabindex (UX P1.3)", () => {
  async function mountKrPayment(id: string) {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "ko" });
    widgets.setAmount({ value: 49900, currency: "KRW" });
    widgets.setOrder({ id: "wcag-pay-1", name: "Test", buyerCountry: "KR" });
    makeTarget(id);
    widgets.renderPayment({ selector: `#${id}` });
    const host = paymentHost(id);
    await waitForTiles(host);
    return host;
  }

  it("exactly one tile has tabindex='0', all others have tabindex='-1'", async () => {
    const host = await mountKrPayment("wcag-p1");
    const tiles = Array.from(host.shadowRoot!.querySelectorAll("[data-method]") as NodeListOf<HTMLElement>);
    expect(tiles.length).toBeGreaterThan(1);
    const focusable = tiles.filter((t) => t.getAttribute("tabindex") === "0");
    const unfocusable = tiles.filter((t) => t.getAttribute("tabindex") === "-1");
    expect(focusable).toHaveLength(1);
    expect(unfocusable).toHaveLength(tiles.length - 1);
  });

  it("container has role='radiogroup'", async () => {
    const host = await mountKrPayment("wcag-p2");
    const group = host.shadowRoot!.querySelector(".oc-pm-tiles");
    expect(group?.getAttribute("role")).toBe("radiogroup");
  });

  it("each tile has role='radio' and aria-checked reflects selection", async () => {
    const host = await mountKrPayment("wcag-p3");
    const tiles = Array.from(host.shadowRoot!.querySelectorAll("[data-method]") as NodeListOf<HTMLElement>);
    for (const tile of tiles) {
      expect(tile.getAttribute("role")).toBe("radio");
      expect(["true", "false"]).toContain(tile.getAttribute("aria-checked"));
    }
    const checked = tiles.filter((t) => t.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
  });

  it("ArrowRight moves selection and focus to the next tile", async () => {
    const host = await mountKrPayment("wcag-p4");
    const tiles = Array.from(host.shadowRoot!.querySelectorAll("[data-method]") as NodeListOf<HTMLElement>);
    // Find currently selected tile (card, index 0).
    const firstTile = tiles.find((t) => t.getAttribute("aria-checked") === "true");
    expect(firstTile).toBeTruthy();
    const firstCode = firstTile!.getAttribute("data-method")!;
    const firstIdx = tiles.findIndex((t) => t.getAttribute("data-method") === firstCode);
    const expectedNextCode = tiles[(firstIdx + 1) % tiles.length]!.getAttribute("data-method")!;

    firstTile!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    // Wait for re-render.
    await new Promise((r) => setTimeout(r, 50));
    const updatedTiles = Array.from(host.shadowRoot!.querySelectorAll("[data-method]") as NodeListOf<HTMLElement>);
    const nextTile = updatedTiles.find((t) => t.getAttribute("data-method") === expectedNextCode);
    expect(nextTile?.getAttribute("aria-checked")).toBe("true");
    expect(nextTile?.getAttribute("tabindex")).toBe("0");
  });

  it("End key selects the last tile", async () => {
    const host = await mountKrPayment("wcag-p5");
    const tiles = Array.from(host.shadowRoot!.querySelectorAll("[data-method]") as NodeListOf<HTMLElement>);
    const firstTile = tiles.find((t) => t.getAttribute("aria-checked") === "true")!;
    firstTile.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));

    await new Promise((r) => setTimeout(r, 50));
    const updatedTiles = Array.from(host.shadowRoot!.querySelectorAll("[data-method]") as NodeListOf<HTMLElement>);
    const lastTile = updatedTiles[updatedTiles.length - 1];
    expect(lastTile?.getAttribute("aria-checked")).toBe("true");
    expect(lastTile?.getAttribute("tabindex")).toBe("0");
  });

  it("Home key selects the first tile", async () => {
    const host = await mountKrPayment("wcag-p6");
    const tiles = Array.from(host.shadowRoot!.querySelectorAll("[data-method]") as NodeListOf<HTMLElement>);
    // First select the last tile, then press Home.
    const lastTile = tiles[tiles.length - 1]!;
    lastTile.click();
    await new Promise((r) => setTimeout(r, 50));

    const updatedTiles = Array.from(host.shadowRoot!.querySelectorAll("[data-method]") as NodeListOf<HTMLElement>);
    const selectedTile = updatedTiles.find((t) => t.getAttribute("aria-checked") === "true")!;
    selectedTile.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));

    await new Promise((r) => setTimeout(r, 50));
    const finalTiles = Array.from(host.shadowRoot!.querySelectorAll("[data-method]") as NodeListOf<HTMLElement>);
    const firstTile = finalTiles[0];
    expect(firstTile?.getAttribute("aria-checked")).toBe("true");
    expect(firstTile?.getAttribute("tabindex")).toBe("0");
  });
});

describe("Address widget WCAG — combobox aria-activedescendant (UX P1.4)", () => {
  async function mountAddressAndOpenCombo(id: string) {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS", locale: "en" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    widgets.setOrder({ id: "wcag-addr-1", name: "Test", buyerCountry: "KR" });
    makeTarget(id);
    widgets.renderAddress({ selector: `#${id}` });
    const host = addressHost(id);
    const input = host.shadowRoot!.querySelector('[role="combobox"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    // Open the listbox by focusing.
    input.dispatchEvent(new Event("focus", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    return { host, input };
  }

  it("input has aria-activedescendant pointing at first option id when listbox opens", async () => {
    const { host, input } = await mountAddressAndOpenCombo("wcag-a1");
    const firstOption = host.shadowRoot!.querySelector('[role="option"]') as HTMLElement | null;
    expect(firstOption).toBeTruthy();
    expect(firstOption!.id).toBeTruthy();
    expect(input.getAttribute("aria-activedescendant")).toBe(firstOption!.id);
  });

  it("ArrowDown updates aria-activedescendant to the next option id", async () => {
    const { host, input } = await mountAddressAndOpenCombo("wcag-a2");
    const optionsBefore = Array.from(host.shadowRoot!.querySelectorAll('[role="option"]') as NodeListOf<HTMLElement>);
    expect(optionsBefore.length).toBeGreaterThan(1);
    const firstId = optionsBefore[0]!.id;
    expect(input.getAttribute("aria-activedescendant")).toBe(firstId);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));

    const optionsAfter = Array.from(host.shadowRoot!.querySelectorAll('[role="option"]') as NodeListOf<HTMLElement>);
    const secondId = optionsAfter[1]!.id;
    expect(input.getAttribute("aria-activedescendant")).toBe(secondId);
  });

  it("Escape closes listbox and aria-activedescendant becomes empty", async () => {
    const { input } = await mountAddressAndOpenCombo("wcag-a3");
    expect(input.getAttribute("aria-expanded")).toBe("true");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));

    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-activedescendant") ?? "").toBe("");
  });
});

describe("Theme tokens (D3)", () => {
  it("shadow DOM style element contains --oc-color- tokens", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });

    makeTarget("d3-ag");
    widgets.renderAgreement({ selector: "#d3-ag" });

    const host = document.getElementById("d3-ag")?.firstElementChild as HTMLElement;
    expect(host?.shadowRoot).toBeTruthy();

    const styleEl = host.shadowRoot?.querySelector("style");
    expect(styleEl).toBeTruthy();
    expect(styleEl!.textContent).toContain("--oc-color-");
  });

  it("CSS contains var(--oc-color-accent) for focus/accent rules", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });

    makeTarget("d3-ag2");
    widgets.renderAgreement({ selector: "#d3-ag2" });

    const host = document.getElementById("d3-ag2")?.firstElementChild as HTMLElement;
    const styleEl = host?.shadowRoot?.querySelector("style");
    expect(styleEl!.textContent).toContain("var(--oc-color-accent");
  });

  it("smoke: all 4 widgets mount without throwing", async () => {
    const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
    const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
    widgets.setAmount({ value: 1000, currency: "KRW" });
    widgets.setOrder({ id: "d3-order", name: "Smoke Test" });

    makeTarget("d3-addr");
    makeTarget("d3-ship");
    makeTarget("d3-pay");
    makeTarget("d3-agr");

    expect(() => widgets.renderAddress({ selector: "#d3-addr" })).not.toThrow();
    expect(() => widgets.renderShipping({ selector: "#d3-ship" })).not.toThrow();
    expect(() => widgets.renderPayment({ selector: "#d3-pay" })).not.toThrow();
    expect(() => widgets.renderAgreement({ selector: "#d3-agr" })).not.toThrow();

    for (const id of ["d3-addr", "d3-ship", "d3-pay", "d3-agr"]) {
      const host = document.getElementById(id)?.firstElementChild as HTMLElement;
      expect(host?.shadowRoot).toBeTruthy();
    }
  });

  it("bundle sanity: WIDGET_CSS length within 1.5x of original 8642 chars", async () => {
    // Original WIDGET_CSS (pre-token refactor) was 8642 chars.
    // Token layer adds ~1200 chars + var() wrappers; 1.5x ceiling = 12963.
    const { WIDGET_CSS } = await import("./internal/styles.js");
    const originalLen = 8642;
    expect(WIDGET_CSS.length).toBeLessThan(originalLen * 1.5);
    expect(WIDGET_CSS.length).toBeGreaterThan(originalLen * 0.9);
  });
});

// ---------------------------------------------------------------------------
// Agreement widget — multi-clause structural shell (D5)
// ---------------------------------------------------------------------------

/** Resolve the oc-agreement shadow host for a given container id. */
function agreementHost(id: string): HTMLElement {
  const target = document.getElementById(id);
  if (!target?.firstElementChild) throw new Error(`agreement widget host missing: ${id}`);
  return target.firstElementChild as HTMLElement;
}

async function makeAgreementWidgets() {
  const oc = await load({ publishableKey: "pk_test_kr01_abc123" });
  const widgets = oc.widgets({ customerKey: "ANONYMOUS" });
  widgets.setAmount({ value: 1000, currency: "KRW" });
  widgets.setOrder({ id: "d5-order", name: "Test" });
  return widgets;
}

describe("Agreement widget — multi-clause structural shell (D5)", () => {
  // 1. No clauses passed → single checkbox with default label.
  it("no clauses → renders single checkbox with default label '전체 약관에 동의합니다'", async () => {
    const widgets = await makeAgreementWidgets();
    makeTarget("d5-1");
    widgets.renderAgreement({ selector: "#d5-1" });
    const host = agreementHost("d5-1");
    const checkbox = host.shadowRoot?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    // Single-clause path: no master row, label text contains default copy.
    const labelText = host.shadowRoot?.querySelector("label.oc-check")?.textContent ?? "";
    expect(labelText).toContain("전체 약관에 동의합니다");
    // No per-clause required badge in single mode.
    expect(host.shadowRoot?.querySelector(".oc-clause-required")).toBeNull();
  });

  // 2. Pass 3 clauses (2 required, 1 optional) → renders 3 rows + master row.
  it("3 clauses → renders master row + 3 clause rows", async () => {
    const widgets = await makeAgreementWidgets();
    makeTarget("d5-2");
    const clauses: AgreementClause[] = [
      { id: "tos",     label: "서비스 이용약관",   required: true },
      { id: "privacy", label: "개인정보 처리방침", required: true },
      { id: "promo",   label: "마케팅 정보 수신",  required: false },
    ];
    widgets.renderAgreement({ selector: "#d5-2", clauses });
    const host = agreementHost("d5-2");
    const sr = host.shadowRoot!;
    // Master row + 3 clause rows = 4 label.oc-check elements.
    const checkLabels = sr.querySelectorAll("label.oc-check");
    expect(checkLabels.length).toBe(4);
    // Master row is first.
    expect(checkLabels[0]?.textContent).toContain("전체 동의");
    // Clause rows follow.
    expect(checkLabels[1]?.textContent).toContain("서비스 이용약관");
    expect(checkLabels[2]?.textContent).toContain("개인정보 처리방침");
    expect(checkLabels[3]?.textContent).toContain("마케팅 정보 수신");
  });

  // 3. Master toggles all children when clicked.
  it("master checkbox toggles all child checkboxes", async () => {
    const widgets = await makeAgreementWidgets();
    makeTarget("d5-3");
    const clauses: AgreementClause[] = [
      { id: "c1", label: "Clause 1", required: true },
      { id: "c2", label: "Clause 2", required: false },
    ];
    widgets.renderAgreement({ selector: "#d5-3", clauses });
    const host = agreementHost("d5-3");
    const sr = host.shadowRoot!;

    const inputs = Array.from(sr.querySelectorAll("input[type=checkbox]")) as HTMLInputElement[];
    // inputs[0] = master, inputs[1..] = clauses
    expect(inputs.length).toBe(3);

    // Click master to check all.
    inputs[0]!.checked = true;
    inputs[0]!.dispatchEvent(new Event("change", { bubbles: true }));

    // After toggle, all clause checkboxes should be checked.
    const updatedInputs = Array.from(
      host.shadowRoot!.querySelectorAll("input[type=checkbox]"),
    ) as HTMLInputElement[];
    expect(updatedInputs[1]!.checked).toBe(true);
    expect(updatedInputs[2]!.checked).toBe(true);
  });

  // 4. Master shows aria-checked="mixed" when child states are partial.
  it("master shows aria-checked='mixed' when some but not all clauses are checked", async () => {
    const widgets = await makeAgreementWidgets();
    makeTarget("d5-4");
    const clauses: AgreementClause[] = [
      { id: "c1", label: "Clause 1", required: true },
      { id: "c2", label: "Clause 2", required: true },
    ];
    widgets.renderAgreement({ selector: "#d5-4", clauses });
    const host = agreementHost("d5-4");
    const sr = host.shadowRoot!;

    const inputs = Array.from(sr.querySelectorAll("input[type=checkbox]")) as HTMLInputElement[];
    // Check only the second clause checkbox (index 2, which is clause c2).
    inputs[2]!.checked = true;
    inputs[2]!.dispatchEvent(new Event("change", { bubbles: true }));

    // Re-query after rerender.
    const masterInput = host.shadowRoot!.querySelector(
      "label.oc-check--master input",
    ) as HTMLInputElement;
    expect(masterInput.getAttribute("aria-checked")).toBe("mixed");
  });

  // 5. Overall agreed event fires true only when all required clauses are checked.
  it("overall agreed fires true only when all required clauses are checked", async () => {
    const widgets = await makeAgreementWidgets();
    makeTarget("d5-5");
    const clauses: AgreementClause[] = [
      { id: "r1", label: "Required 1", required: true },
      { id: "r2", label: "Required 2", required: true },
      { id: "opt", label: "Optional",  required: false },
    ];
    const ag = widgets.renderAgreement({ selector: "#d5-5", clauses });
    const host = agreementHost("d5-5");
    const sr = host.shadowRoot!;

    const agreedValues: boolean[] = [];
    ag.on("agreementStatusChange", (v) => agreedValues.push(v));

    const inputs = Array.from(sr.querySelectorAll("input[type=checkbox]")) as HTMLInputElement[];
    // inputs[0]=master, [1]=r1, [2]=r2, [3]=opt

    // Check r1 only → not agreed.
    inputs[1]!.checked = true;
    inputs[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(agreedValues.at(-1)).toBe(false);

    // Check r2 → now agreed (opt still unchecked but optional).
    const inputs2 = Array.from(
      host.shadowRoot!.querySelectorAll("input[type=checkbox]"),
    ) as HTMLInputElement[];
    inputs2[2]!.checked = true;
    inputs2[2]!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(agreedValues.at(-1)).toBe(true);
  });

  // 6. Optional unchecked clause does NOT block overall agreed.
  it("optional unchecked clause does not block overall agreed", async () => {
    const widgets = await makeAgreementWidgets();
    makeTarget("d5-6");
    const clauses: AgreementClause[] = [
      { id: "req", label: "Required", required: true },
      { id: "opt", label: "Optional", required: false },
    ];
    const ag = widgets.renderAgreement({ selector: "#d5-6", clauses });
    const host = agreementHost("d5-6");
    const sr = host.shadowRoot!;

    const agreedValues: boolean[] = [];
    ag.on("agreementStatusChange", (v) => agreedValues.push(v));

    const inputs = Array.from(sr.querySelectorAll("input[type=checkbox]")) as HTMLInputElement[];
    // Check only required clause (inputs[1]).
    inputs[1]!.checked = true;
    inputs[1]!.dispatchEvent(new Event("change", { bubbles: true }));

    // Optional (inputs[2]) is unchecked; agreed should still be true.
    expect(agreedValues.at(-1)).toBe(true);
  });

  // 7. clauseChange event fires per individual clause toggle.
  it("clauseChange event fires with correct id and checked value per toggle", async () => {
    const widgets = await makeAgreementWidgets();
    makeTarget("d5-7");
    const clauses: AgreementClause[] = [
      { id: "alpha", label: "Alpha", required: true },
      { id: "beta",  label: "Beta",  required: false },
    ];
    const ag = widgets.renderAgreement({ selector: "#d5-7", clauses });
    const host = agreementHost("d5-7");
    const sr = host.shadowRoot!;

    const changes: Array<{ id: string; checked: boolean }> = [];
    ag.on("clauseChange", (payload) => changes.push(payload));

    const inputs = Array.from(sr.querySelectorAll("input[type=checkbox]")) as HTMLInputElement[];
    // Toggle alpha (inputs[1]).
    inputs[1]!.checked = true;
    inputs[1]!.dispatchEvent(new Event("change", { bubbles: true }));

    // Toggle beta (inputs[2]).
    const inputs2 = Array.from(
      host.shadowRoot!.querySelectorAll("input[type=checkbox]"),
    ) as HTMLInputElement[];
    inputs2[2]!.checked = true;
    inputs2[2]!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(changes).toHaveLength(2);
    expect(changes[0]).toEqual({ id: "alpha", checked: true });
    expect(changes[1]).toEqual({ id: "beta", checked: true });
  });

  // 8. Clause with href renders anchor with target="_blank" and rel containing "noopener".
  it("clause with href renders anchor with target='_blank' and rel containing 'noopener'", async () => {
    const widgets = await makeAgreementWidgets();
    makeTarget("d5-8");
    const clauses: AgreementClause[] = [
      { id: "tos", label: "Terms", required: true, href: "https://terms.example.com/tos" },
    ];
    widgets.renderAgreement({ selector: "#d5-8", clauses });
    const host = agreementHost("d5-8");
    const anchor = host.shadowRoot?.querySelector("a.oc-clause-link") as HTMLAnchorElement | null;
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toContain("noopener");
    expect(anchor?.getAttribute("href")).toBe("https://terms.example.com/tos");
  });

  // 9. Clause with javascript: href rejects at render with OpenCheckoutValidationError.
  it("clause with javascript: href rejects at render with OpenCheckoutValidationError", async () => {
    const widgets = await makeAgreementWidgets();
    makeTarget("d5-9");
    const clauses: AgreementClause[] = [
      { id: "evil", label: "Evil", required: true, href: "javascript:alert(1)" },
    ];
    expect(() => widgets.renderAgreement({ selector: "#d5-9", clauses })).toThrow(
      OpenCheckoutValidationError,
    );
  });

  // 10. PAN in clause label rejects at render via assertPanFree.
  it("PAN in clause label rejects at render (assertPanFree triggered)", async () => {
    const widgets = await makeAgreementWidgets();
    makeTarget("d5-10");
    const clauses: AgreementClause[] = [
      { id: "pan", label: "4111 1111 1111 1111", required: true },
    ];
    expect(() => widgets.renderAgreement({ selector: "#d5-10", clauses })).toThrow(
      OpenCheckoutSecurityError,
    );
  });
});
