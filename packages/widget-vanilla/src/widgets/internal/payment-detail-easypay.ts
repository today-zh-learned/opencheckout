import { easyPayBrandLabel } from "../../internal/payment-methods.js";
import { h } from "../../internal/preact-runtime.js";
import type { SessionState } from "../../internal/state.js";

export type EasyPayDetailProps = {
  state: SessionState;
  easyPayBrands: readonly string[];
  label: string;
  onSelect: (brand: string) => void;
};

export function renderEasyPayDetail(props: EasyPayDetailProps) {
  const { state, easyPayBrands, label, onSelect } = props;
  const current = state.paymentEasyPayBrand ?? easyPayBrands[0];
  return h(
    "div",
    { class: "oc-pm-detail-inner" },
    h("p", { class: "oc-pm-detail-title" }, label),
    h(
      "div",
      { class: "oc-easy-pay-grid", role: "radiogroup", "aria-label": label },
      easyPayBrands.map((brand) =>
        h(
          "button",
          {
            type: "button",
            class: "oc-easy-pay-chip",
            role: "radio",
            "aria-checked": brand === current ? "true" : "false",
            "data-selected": brand === current ? "true" : "false",
            key: `epb-${brand}`,
            onClick: () => onSelect(brand),
          },
          easyPayBrandLabel(brand, state.locale),
        ),
      ),
    ),
  );
}
