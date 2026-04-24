import { assertPanFree } from "../internal/pan-guard.js";
import { h } from "../internal/preact-runtime.js";
import { OpenCheckoutShadowElement, defineOnce, resolveTarget } from "../internal/shadow-base.js";
import type { PaymentMethodCode, SessionState } from "../internal/state.js";

export type PaymentWidgetEvents = {
  paymentMethodSelect: string;
};

export type PaymentWidget = {
  on<K extends keyof PaymentWidgetEvents>(
    event: K,
    cb: (payload: PaymentWidgetEvents[K]) => void,
  ): () => void;
  destroy(): void;
};

const TAG = "oc-payment";

type Tile = {
  readonly code: PaymentMethodCode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly internationalOnly: boolean;
};

const TILES: readonly Tile[] = [
  { code: "card", labelKo: "카드", labelEn: "Card", internationalOnly: false },
  { code: "transfer", labelKo: "계좌이체", labelEn: "Bank transfer", internationalOnly: false },
  {
    code: "virtual-account",
    labelKo: "가상계좌",
    labelEn: "Virtual account",
    internationalOnly: false,
  },
  {
    code: "foreign-card",
    labelKo: "해외카드",
    labelEn: "Foreign card",
    internationalOnly: true,
  },
];

export class OcPaymentElement extends OpenCheckoutShadowElement {}

export function mountPaymentWidget(
  target: Element | string,
  state: SessionState,
  options: { variantKey?: string } = {},
): PaymentWidget {
  defineOnce(TAG, OcPaymentElement);
  const host = resolveTarget(target);
  const el = document.createElement(TAG) as OcPaymentElement;
  const listeners: Array<(payload: string) => void> = [];
  let destroyed = false;
  let selected: string = state.paymentSelected ?? "card";

  const labels =
    state.locale === "en"
      ? { eyebrow: "PAYMENT", title: "Payment method" }
      : { eyebrow: "결제", title: "결제 수단" };

  const select = (code: string): void => {
    selected = code;
    state.paymentSelected = code;
    state.bus.emit("payment:change", code);
    for (const cb of listeners) cb(code);
    el.rerender();
  };

  const renderNode = () => {
    const country = state.addressSelected?.country ?? state.order?.buyerCountry ?? "KR";
    const isInternational = country !== "KR";
    const visible = TILES.filter((t) => (t.internationalOnly ? isInternational : true));
    const snapshot = { selected, variantKey: options.variantKey, country };
    assertPanFree(snapshot);
    return h(
      "section",
      { class: "oc-shell", part: "shell", "aria-label": "OpenCheckout payment widget" },
      h("p", { class: "oc-eyebrow" }, labels.eyebrow),
      h("h3", { class: "oc-title" }, labels.title),
      h(
        "div",
        { class: "oc-radios", role: "radiogroup" },
        visible.map((tile) =>
          h(
            "label",
            {
              class: "oc-radio",
              "data-selected": selected === tile.code ? "true" : "false",
              key: tile.code,
            },
            h("input", {
              type: "radio",
              name: "oc-payment",
              checked: selected === tile.code,
              onInput: () => select(tile.code),
            }),
            h(
              "span",
              { class: "oc-radio-label" },
              state.locale === "en" ? tile.labelEn : tile.labelKo,
            ),
          ),
        ),
      ),
    );
  };

  el.setRenderFn(renderNode, { selected });
  host.append(el);

  const unsubAmount = state.bus.on("amount:change", () => el.rerender());
  const unsubOrder = state.bus.on("order:change", () => el.rerender());
  const unsubAddress = state.bus.on("address:change", () => el.rerender());

  return {
    on<K extends keyof PaymentWidgetEvents>(
      event: K,
      cb: (payload: PaymentWidgetEvents[K]) => void,
    ): () => void {
      if (destroyed) throw new Error("PaymentWidget has been destroyed");
      if (event !== "paymentMethodSelect") {
        throw new Error(`Unknown PaymentWidget event: ${String(event)}`);
      }
      listeners.push(cb as (payload: string) => void);
      return () => {
        const idx = listeners.indexOf(cb as (payload: string) => void);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubAmount();
      unsubOrder();
      unsubAddress();
      listeners.length = 0;
      el.remove();
    },
  };
}
