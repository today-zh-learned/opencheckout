import { h, render } from "preact";

export const WIDGET_VERSION = "0.0.1";
export const WIDGET_TAG_NAME = "opencheckout-widget";
export const CHECKOUT_EVENT_NAME = "opencheckout:event";
export const OPEN_CHECKOUT_MESSAGE_SOURCE = "opencheckout.widget";
export const OPEN_CHECKOUT_MESSAGE_VERSION = "2026-04-24";

export type CheckoutLocale = "ko" | "en";
export type CheckoutTheme = "light" | "dark";

export type CheckoutWidgetConfig = {
  readonly tenantId: string;
  readonly orderId: string;
  readonly gatewayUrl: string;
  readonly locale?: CheckoutLocale;
  readonly theme?: CheckoutTheme;
  readonly allowedOrigins?: readonly string[];
  readonly nonce?: string;
};

export type NormalizedCheckoutWidgetConfig = {
  readonly tenantId: string;
  readonly orderId: string;
  readonly gatewayUrl: string;
  readonly locale: CheckoutLocale;
  readonly theme: CheckoutTheme;
  readonly allowedOrigins: readonly string[];
  readonly nonce: string;
};

export type CheckoutWidgetEvent =
  | { type: "widget.ready"; version: string }
  | { type: "checkout.started"; orderId: string }
  | { type: "payment.success"; paymentId: string }
  | { type: "payment.failed"; reason: string }
  | { type: "payment.cancelled" };

export type OpenCheckoutWidgetMessage<TPayload = unknown> = {
  readonly source: typeof OPEN_CHECKOUT_MESSAGE_SOURCE;
  readonly version: typeof OPEN_CHECKOUT_MESSAGE_VERSION;
  readonly type: string;
  readonly nonce: string;
  readonly payload: TPayload;
};

type CheckoutElement = HTMLElement & {
  checkoutConfig?: CheckoutWidgetConfig;
  onOpenCheckoutEvent?: (event: CheckoutWidgetEvent) => void;
};

const WIDGET_CSS = `
  :host {
    color-scheme: light;
    display: block;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .oc-shell {
    border: 1px solid #d6d3c7;
    border-radius: 18px;
    background: linear-gradient(135deg, #fffaf0 0%, #f6f1e4 52%, #e8f0eb 100%);
    box-shadow: 0 20px 50px rgba(45, 40, 25, 0.14);
    color: #262319;
    max-width: 460px;
    overflow: hidden;
  }

  .oc-shell[data-theme="dark"] {
    background: linear-gradient(135deg, #151813 0%, #1f2a24 55%, #30291d 100%);
    border-color: #3c433a;
    color: #f8f2df;
  }

  .oc-header,
  .oc-body {
    padding: 20px;
  }

  .oc-header {
    border-bottom: 1px solid rgba(87, 79, 52, 0.16);
  }

  .oc-eyebrow {
    color: #7b4e10;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    margin: 0 0 8px;
    text-transform: uppercase;
  }

  .oc-title {
    font-size: 24px;
    line-height: 1.1;
    margin: 0;
  }

  .oc-steps {
    display: grid;
    gap: 10px;
    list-style: none;
    margin: 0 0 18px;
    padding: 0;
  }

  .oc-step {
    align-items: center;
    background: rgba(255, 255, 255, 0.56);
    border: 1px solid rgba(87, 79, 52, 0.14);
    border-radius: 14px;
    display: flex;
    gap: 10px;
    padding: 12px;
  }

  .oc-index {
    align-items: center;
    background: #1f4d3a;
    border-radius: 999px;
    color: #fffaf0;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 700;
    height: 24px;
    justify-content: center;
    width: 24px;
  }

  .oc-copy {
    color: currentColor;
    font-size: 14px;
    margin: 0 0 18px;
    opacity: 0.78;
  }

  .oc-button {
    background: #1f4d3a;
    border: 0;
    border-radius: 999px;
    color: #fffaf0;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    padding: 12px 18px;
    width: 100%;
  }

  .oc-button:focus-visible {
    outline: 3px solid #d38b27;
    outline-offset: 2px;
  }

  .oc-footnote {
    font-size: 12px;
    margin: 12px 0 0;
    opacity: 0.68;
  }

  .oc-error {
    border: 1px solid #b42318;
    border-radius: 14px;
    color: #b42318;
    padding: 14px;
  }
`;

const LABELS: Record<
  CheckoutLocale,
  { title: string; subtitle: string; steps: readonly string[]; cta: string; footnote: string }
> = {
  en: {
    title: "Checkout",
    subtitle: "Address, shipping, duties, and payment are isolated before Toss card fields load.",
    steps: ["Address", "Shipping", "Duties", "Payment"],
    cta: "Continue",
    footnote: "Card data must stay inside the Toss-hosted iframe.",
  },
  ko: {
    title: "Checkout",
    subtitle: "Address, shipping, duties, and payment are isolated before Toss card fields load.",
    steps: ["Address", "Shipping", "Duties", "Payment"],
    cta: "Continue",
    footnote: "Card data must stay inside the Toss-hosted iframe.",
  },
};

export class OpenCheckoutSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCheckoutSecurityError";
  }
}

export function normalizeCheckoutWidgetConfig(
  config: CheckoutWidgetConfig,
): NormalizedCheckoutWidgetConfig {
  const tenantId = config.tenantId.trim();
  const orderId = config.orderId.trim();
  const gatewayUrl = new URL(config.gatewayUrl);
  if (!tenantId) throw new TypeError("tenantId is required");
  if (!orderId) throw new TypeError("orderId is required");
  if (!["http:", "https:"].includes(gatewayUrl.protocol)) {
    throw new TypeError("gatewayUrl must use http or https");
  }
  return {
    tenantId,
    orderId,
    gatewayUrl: gatewayUrl.toString(),
    locale: config.locale ?? "en",
    theme: config.theme ?? "light",
    allowedOrigins: normalizeOrigins(config.allowedOrigins ?? []),
    nonce: config.nonce ?? createNonce(),
  };
}

export function containsPan(value: unknown): boolean {
  return scanForPan(value, new WeakSet<object>());
}

export function assertPanFree(value: unknown): void {
  if (containsPan(value)) {
    throw new OpenCheckoutSecurityError("PAN-like card data cannot cross widget boundaries");
  }
}

export function createWidgetMessage<TPayload>(
  type: string,
  payload: TPayload,
  nonce: string,
): OpenCheckoutWidgetMessage<TPayload> {
  assertPanFree(payload);
  return {
    source: OPEN_CHECKOUT_MESSAGE_SOURCE,
    version: OPEN_CHECKOUT_MESSAGE_VERSION,
    type,
    nonce,
    payload,
  };
}

export function isOpenCheckoutMessage(value: unknown): value is OpenCheckoutWidgetMessage {
  if (!isRecord(value)) return false;
  return (
    value.source === OPEN_CHECKOUT_MESSAGE_SOURCE &&
    value.version === OPEN_CHECKOUT_MESSAGE_VERSION &&
    typeof value.type === "string" &&
    typeof value.nonce === "string" &&
    "payload" in value
  );
}

export function registerOpenCheckoutElement(tagName = WIDGET_TAG_NAME): void {
  if (typeof customElements === "undefined" || typeof HTMLElement === "undefined") {
    throw new TypeError("customElements and HTMLElement are required to register the widget");
  }
  if (customElements.get(tagName)) return;

  class OpenCheckoutWidgetElement extends HTMLElement {
    checkoutConfig?: CheckoutWidgetConfig;
    onOpenCheckoutEvent?: (event: CheckoutWidgetEvent) => void;

    connectedCallback(): void {
      this.renderWidget();
    }

    disconnectedCallback(): void {
      const root = this.shadowRoot;
      if (root) render(null, root);
    }

    attributeChangedCallback(): void {
      if (this.isConnected) this.renderWidget();
    }

    static get observedAttributes(): string[] {
      return [
        "tenant-id",
        "order-id",
        "gateway-url",
        "locale",
        "theme",
        "allowed-origins",
        "nonce",
      ];
    }

    private renderWidget(): void {
      const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
      try {
        const config = normalizeCheckoutWidgetConfig(
          this.checkoutConfig ?? readConfigFromAttributes(this),
        );
        const dispatch = (event: CheckoutWidgetEvent) => emitWidgetEvent(this, config, event);
        render(h(WidgetShell, { config, onEvent: dispatch }), root);
        dispatch({ type: "widget.ready", version: WIDGET_VERSION });
      } catch (error) {
        render(h(ErrorShell, { error }), root);
      }
    }
  }

  customElements.define(tagName, OpenCheckoutWidgetElement);
}

export function mountCheckoutWidget(
  container: Element | string,
  config: CheckoutWidgetConfig,
  onEvent?: (event: CheckoutWidgetEvent) => void,
): () => void {
  if (typeof document === "undefined") {
    throw new TypeError("document is required to mount the widget");
  }
  const target = typeof container === "string" ? document.querySelector(container) : container;
  if (!target) {
    throw new TypeError("OpenCheckout mount target was not found");
  }

  registerOpenCheckoutElement();
  const widget = document.createElement(WIDGET_TAG_NAME) as CheckoutElement;
  widget.checkoutConfig = config;
  if (onEvent) widget.onOpenCheckoutEvent = onEvent;
  target.append(widget);

  return () => {
    widget.remove();
  };
}

export const OpenCheckout = {
  mount: mountCheckoutWidget,
  registerElement: registerOpenCheckoutElement,
  createMessage: createWidgetMessage,
  containsPan,
} as const;

export default OpenCheckout;

function WidgetShell(props: {
  readonly config: NormalizedCheckoutWidgetConfig;
  readonly onEvent: (event: CheckoutWidgetEvent) => void;
}) {
  const labels = LABELS[props.config.locale];
  return h(
    "section",
    {
      class: "oc-shell",
      "data-theme": props.config.theme,
      part: "shell",
      "aria-label": "OpenCheckout checkout widget",
    },
    h("style", null, WIDGET_CSS),
    h(
      "header",
      { class: "oc-header" },
      h("p", { class: "oc-eyebrow" }, "OpenCheckout"),
      h("h2", { class: "oc-title" }, labels.title),
    ),
    h(
      "div",
      { class: "oc-body" },
      h("p", { class: "oc-copy" }, labels.subtitle),
      h(
        "ol",
        { class: "oc-steps" },
        labels.steps.map((step, index) =>
          h(
            "li",
            { class: "oc-step" },
            h("span", { class: "oc-index" }, String(index + 1)),
            h("span", null, step),
          ),
        ),
      ),
      h(
        "button",
        {
          class: "oc-button",
          type: "button",
          onClick: () => props.onEvent({ type: "checkout.started", orderId: props.config.orderId }),
        },
        labels.cta,
      ),
      h("p", { class: "oc-footnote" }, labels.footnote),
    ),
  );
}

function ErrorShell(props: { readonly error: unknown }) {
  return h(
    "section",
    { class: "oc-error", role: "alert" },
    h("style", null, WIDGET_CSS),
    props.error instanceof Error ? props.error.message : "OpenCheckout widget failed to mount",
  );
}

function emitWidgetEvent(
  target: CheckoutElement,
  config: NormalizedCheckoutWidgetConfig,
  event: CheckoutWidgetEvent,
): void {
  assertPanFree(event);
  target.onOpenCheckoutEvent?.(event);
  target.dispatchEvent(new CustomEvent(CHECKOUT_EVENT_NAME, { bubbles: true, detail: event }));

  const parentWindow = typeof window === "undefined" ? undefined : window.parent;
  const targetOrigin = config.allowedOrigins[0];
  if (!parentWindow || parentWindow === window || !targetOrigin) return;
  parentWindow.postMessage(
    createWidgetMessage("opencheckout.widget.event", event, config.nonce),
    targetOrigin,
  );
}

function readConfigFromAttributes(element: HTMLElement): CheckoutWidgetConfig {
  const tenantId = readRequiredAttribute(element, "tenant-id");
  const orderId = readRequiredAttribute(element, "order-id");
  const gatewayUrl = readRequiredAttribute(element, "gateway-url");
  const locale = element.getAttribute("locale");
  const theme = element.getAttribute("theme");
  const allowedOrigins = element.getAttribute("allowed-origins");
  const nonce = element.getAttribute("nonce");

  return {
    tenantId,
    orderId,
    gatewayUrl,
    ...(locale === "ko" || locale === "en" ? { locale } : {}),
    ...(theme === "light" || theme === "dark" ? { theme } : {}),
    ...(allowedOrigins ? { allowedOrigins: splitOrigins(allowedOrigins) } : {}),
    ...(nonce ? { nonce } : {}),
  };
}

function readRequiredAttribute(element: HTMLElement, name: string): string {
  const value = element.getAttribute(name);
  if (!value) throw new TypeError(`${name} attribute is required`);
  return value;
}

function normalizeOrigins(origins: readonly string[]): readonly string[] {
  return [...new Set(origins.map((origin) => new URL(origin).origin))];
}

function splitOrigins(value: string): readonly string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function createNonce(): string {
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject) {
    throw new TypeError("crypto.getRandomValues is required to create a widget nonce");
  }
  const bytes = new Uint8Array(16);
  cryptoObject.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function scanForPan(value: unknown, seen: WeakSet<object>): boolean {
  if (typeof value === "string") return stringContainsPan(value);
  if (typeof value === "number" || typeof value === "bigint") {
    return stringContainsPan(String(value));
  }
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => scanForPan(item, seen));
  return Object.values(value as Record<string, unknown>).some((item) => scanForPan(item, seen));
}

function stringContainsPan(value: string): boolean {
  const candidates = value.match(/[0-9][0-9 -]{11,30}[0-9]/g) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return (
      digits.length >= 13 && digits.length <= 19 && !isRepeatedDigit(digits) && passesLuhn(digits)
    );
  });
}

function isRepeatedDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let doubleNext = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const digit = Number(digits[index]);
    if (Number.isNaN(digit)) return false;
    if (doubleNext) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
    doubleNext = !doubleNext;
  }
  return sum % 10 === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
