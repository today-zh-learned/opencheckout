import { assertPanFree } from "../internal/pan-guard.js";
import { h } from "../internal/preact-runtime.js";
import { OpenCheckoutShadowElement, defineOnce, resolveTarget } from "../internal/shadow-base.js";
import type { AddressSelection, SessionState } from "../internal/state.js";

export type AddressWidgetEvents = {
  addressSelect: AddressSelection;
};

export type AddressWidget = {
  on<K extends keyof AddressWidgetEvents>(
    event: K,
    cb: (payload: AddressWidgetEvents[K]) => void,
  ): () => void;
  destroy(): void;
};

const TAG = "oc-address";

export class OcAddressElement extends OpenCheckoutShadowElement {}

export function mountAddressWidget(
  target: Element | string,
  state: SessionState,
  options: { variantKey?: string } = {},
): AddressWidget {
  defineOnce(TAG, OcAddressElement);
  const host = resolveTarget(target);
  const el = document.createElement(TAG) as OcAddressElement;
  const listeners: Array<(payload: AddressSelection) => void> = [];

  let country = state.order?.buyerCountry ?? "KR";
  let zip = state.addressSelected?.zip ?? "";
  let line1 = state.addressSelected?.line1 ?? "";
  let destroyed = false;

  const labels =
    state.locale === "en"
      ? {
          eyebrow: "ADDRESS",
          title: "Shipping address",
          toggleKr: "Domestic",
          toggleOther: "International",
          countryLabel: "Country",
          zipLabel: "Postal code",
          line1Label: "Street address",
        }
      : {
          eyebrow: "주소",
          title: "배송 주소",
          toggleKr: "국내",
          toggleOther: "해외",
          countryLabel: "국가 코드",
          zipLabel: "우편번호",
          line1Label: "상세 주소",
        };

  const emit = (): void => {
    const next: AddressSelection = { country, zip, line1 };
    state.addressSelected = next;
    state.bus.emit("address:change", next);
    for (const cb of listeners) cb(next);
  };

  const renderNode = () => {
    const snapshot = { country, zip, line1, variantKey: options.variantKey };
    assertPanFree(snapshot);
    const isKr = country === "KR";
    return h(
      "section",
      { class: "oc-shell", part: "shell", "aria-label": "OpenCheckout address widget" },
      h("p", { class: "oc-eyebrow" }, labels.eyebrow),
      h("h3", { class: "oc-title" }, labels.title),
      h(
        "div",
        { class: "oc-toggle" },
        h(
          "label",
          { class: "oc-check" },
          h("input", {
            type: "radio",
            name: "oc-address-scope",
            checked: isKr,
            onInput: () => {
              country = "KR";
              emit();
              el.rerender();
            },
          }),
          labels.toggleKr,
        ),
        h(
          "label",
          { class: "oc-check" },
          h("input", {
            type: "radio",
            name: "oc-address-scope",
            checked: !isKr,
            onInput: () => {
              country = country === "KR" ? "US" : country;
              if (country === "KR") country = "US";
              emit();
              el.rerender();
            },
          }),
          labels.toggleOther,
        ),
      ),
      h(
        "div",
        { class: "oc-field" },
        h("label", { class: "oc-label" }, labels.countryLabel),
        h("input", {
          class: "oc-input",
          type: "text",
          value: country,
          maxlength: 3,
          onInput: (ev: Event) => {
            country = ((ev.target as HTMLInputElement).value || "").toUpperCase().slice(0, 3);
            emit();
          },
        }),
      ),
      h(
        "div",
        { class: "oc-field" },
        h("label", { class: "oc-label" }, labels.zipLabel),
        h("input", {
          class: "oc-input",
          type: "text",
          value: zip,
          onInput: (ev: Event) => {
            zip = (ev.target as HTMLInputElement).value;
            emit();
          },
        }),
      ),
      h(
        "div",
        { class: "oc-field" },
        h("label", { class: "oc-label" }, labels.line1Label),
        h("input", {
          class: "oc-input",
          type: "text",
          value: line1,
          onInput: (ev: Event) => {
            line1 = (ev.target as HTMLInputElement).value;
            emit();
          },
        }),
      ),
    );
  };

  const configSnapshot = () => ({
    country,
    zip,
    line1,
    locale: state.locale,
    variantKey: options.variantKey,
  });

  el.setRenderFn(renderNode, configSnapshot());
  host.append(el);

  const unsubAmount = state.bus.on("amount:change", () => el.rerender());
  const unsubOrder = state.bus.on("order:change", (order) => {
    if (order.buyerCountry && order.buyerCountry !== country) {
      country = order.buyerCountry;
      el.rerender();
    }
  });

  return {
    on<K extends keyof AddressWidgetEvents>(
      event: K,
      cb: (payload: AddressWidgetEvents[K]) => void,
    ): () => void {
      if (destroyed) {
        throw new Error("AddressWidget has been destroyed");
      }
      if (event !== "addressSelect") {
        throw new Error(`Unknown AddressWidget event: ${String(event)}`);
      }
      listeners.push(cb as (payload: AddressSelection) => void);
      return () => {
        const idx = listeners.indexOf(cb as (payload: AddressSelection) => void);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubAmount();
      unsubOrder();
      listeners.length = 0;
      el.remove();
    },
  };
}
