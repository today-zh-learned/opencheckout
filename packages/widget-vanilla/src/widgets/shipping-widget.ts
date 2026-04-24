import { assertPanFree } from "../internal/pan-guard.js";
import { h } from "../internal/preact-runtime.js";
import { OpenCheckoutShadowElement, defineOnce, resolveTarget } from "../internal/shadow-base.js";
import type { SessionState, ShippingSelection } from "../internal/state.js";

export type ShippingWidgetEvents = {
  methodSelect: ShippingSelection;
};

export type ShippingWidget = {
  on<K extends keyof ShippingWidgetEvents>(
    event: K,
    cb: (payload: ShippingWidgetEvents[K]) => void,
  ): () => void;
  destroy(): void;
};

const TAG = "oc-shipping";

type ShippingOption = ShippingSelection & {
  readonly code: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly internationalOnly: boolean;
};

const OPTIONS: readonly ShippingOption[] = [
  {
    code: "standard",
    labelKo: "스탠다드",
    labelEn: "Standard",
    hintKo: "₩3,500 · 2-3일",
    hintEn: "₩3,500 · 2-3 days",
    carrier: "standard",
    rate: 3500,
    currency: "KRW",
    internationalOnly: false,
  },
  {
    code: "express",
    labelKo: "익스프레스",
    labelEn: "Express",
    hintKo: "₩9,000 · 익일 배송",
    hintEn: "₩9,000 · next day",
    carrier: "express",
    rate: 9000,
    currency: "KRW",
    internationalOnly: false,
  },
  {
    code: "ems",
    labelKo: "해외 EMS",
    labelEn: "International EMS",
    hintKo: "₩18,000 · 5-7일",
    hintEn: "₩18,000 · 5-7 days",
    carrier: "ems",
    rate: 18000,
    currency: "KRW",
    internationalOnly: true,
  },
];

export class OcShippingElement extends OpenCheckoutShadowElement {}

export function mountShippingWidget(target: Element | string, state: SessionState): ShippingWidget {
  defineOnce(TAG, OcShippingElement);
  const host = resolveTarget(target);
  const el = document.createElement(TAG) as OcShippingElement;
  const listeners: Array<(payload: ShippingSelection) => void> = [];
  let destroyed = false;
  let selectedCode = state.shippingSelected?.carrier ?? "standard";

  const labels =
    state.locale === "en"
      ? { eyebrow: "SHIPPING", title: "Shipping method" }
      : { eyebrow: "배송", title: "배송 방법" };

  const select = (opt: ShippingOption): void => {
    selectedCode = opt.code;
    const sel: ShippingSelection = {
      carrier: opt.carrier,
      rate: opt.rate,
      currency: opt.currency,
    };
    state.shippingSelected = sel;
    state.bus.emit("shipping:change", sel);
    for (const cb of listeners) cb(sel);
    el.rerender();
  };

  const renderNode = () => {
    const country = state.addressSelected?.country ?? state.order?.buyerCountry ?? "KR";
    const isInternational = country !== "KR";
    const visible = OPTIONS.filter((o) => (o.internationalOnly ? isInternational : true));
    assertPanFree({ selectedCode, country });
    return h(
      "section",
      { class: "oc-shell", part: "shell", "aria-label": "OpenCheckout shipping widget" },
      h("p", { class: "oc-eyebrow" }, labels.eyebrow),
      h("h3", { class: "oc-title" }, labels.title),
      h(
        "div",
        { class: "oc-radios", role: "radiogroup" },
        visible.map((opt) =>
          h(
            "label",
            {
              class: "oc-radio",
              "data-selected": selectedCode === opt.code ? "true" : "false",
              key: opt.code,
            },
            h("input", {
              type: "radio",
              name: "oc-shipping",
              checked: selectedCode === opt.code,
              onInput: () => select(opt),
            }),
            h(
              "span",
              { class: "oc-radio-label" },
              state.locale === "en" ? opt.labelEn : opt.labelKo,
            ),
            h("span", { class: "oc-radio-hint" }, state.locale === "en" ? opt.hintEn : opt.hintKo),
          ),
        ),
      ),
    );
  };

  el.setRenderFn(renderNode, { selectedCode });
  host.append(el);

  const unsubAmount = state.bus.on("amount:change", () => el.rerender());
  const unsubOrder = state.bus.on("order:change", () => el.rerender());
  const unsubAddress = state.bus.on("address:change", () => el.rerender());

  return {
    on<K extends keyof ShippingWidgetEvents>(
      event: K,
      cb: (payload: ShippingWidgetEvents[K]) => void,
    ): () => void {
      if (destroyed) throw new Error("ShippingWidget has been destroyed");
      if (event !== "methodSelect") {
        throw new Error(`Unknown ShippingWidget event: ${String(event)}`);
      }
      listeners.push(cb as (payload: ShippingSelection) => void);
      return () => {
        const idx = listeners.indexOf(cb as (payload: ShippingSelection) => void);
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
