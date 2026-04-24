import { assertPanFree } from "../internal/pan-guard.js";
import { h } from "../internal/preact-runtime.js";
import { OpenCheckoutShadowElement, defineOnce, resolveTarget } from "../internal/shadow-base.js";
import type { SessionState } from "../internal/state.js";

export type AgreementWidgetEvents = {
  agreementStatusChange: boolean;
};

export type AgreementWidget = {
  on<K extends keyof AgreementWidgetEvents>(
    event: K,
    cb: (payload: AgreementWidgetEvents[K]) => void,
  ): () => void;
  destroy(): void;
};

const TAG = "oc-agreement";

export class OcAgreementElement extends OpenCheckoutShadowElement {}

export function mountAgreementWidget(
  target: Element | string,
  state: SessionState,
): AgreementWidget {
  defineOnce(TAG, OcAgreementElement);
  const host = resolveTarget(target);
  const el = document.createElement(TAG) as OcAgreementElement;
  const listeners: Array<(payload: boolean) => void> = [];
  let destroyed = false;
  let checked = state.agreementChecked;

  const labels =
    state.locale === "en"
      ? {
          eyebrow: "AGREEMENT",
          title: "Terms",
          check: "I agree to the payment terms",
          hint: "Required before submitting payment.",
        }
      : {
          eyebrow: "약관",
          title: "이용 약관",
          check: "결제 약관에 동의합니다",
          hint: "결제를 위해 동의가 필요합니다.",
        };

  const toggle = (next: boolean): void => {
    checked = next;
    state.agreementChecked = next;
    state.bus.emit("agreement:change", next);
    for (const cb of listeners) cb(next);
    el.rerender();
  };

  const renderNode = () => {
    assertPanFree({ checked, locale: state.locale });
    return h(
      "section",
      { class: "oc-shell", part: "shell", "aria-label": "OpenCheckout agreement widget" },
      h("p", { class: "oc-eyebrow" }, labels.eyebrow),
      h("h3", { class: "oc-title" }, labels.title),
      h(
        "label",
        { class: "oc-check" },
        h("input", {
          type: "checkbox",
          checked,
          onChange: (ev: Event) => toggle((ev.target as HTMLInputElement).checked),
        }),
        labels.check,
      ),
      h("p", { class: "oc-footnote" }, labels.hint),
    );
  };

  el.setRenderFn(renderNode, { checked });
  host.append(el);

  return {
    on<K extends keyof AgreementWidgetEvents>(
      event: K,
      cb: (payload: AgreementWidgetEvents[K]) => void,
    ): () => void {
      if (destroyed) throw new Error("AgreementWidget has been destroyed");
      if (event !== "agreementStatusChange") {
        throw new Error(`Unknown AgreementWidget event: ${String(event)}`);
      }
      listeners.push(cb as (payload: boolean) => void);
      return () => {
        const idx = listeners.indexOf(cb as (payload: boolean) => void);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      listeners.length = 0;
      el.remove();
    },
  };
}
