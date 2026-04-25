import { h } from "../../internal/preact-runtime.js";
import type { SessionState } from "../../internal/state.js";

export type InstallmentDetailProps = {
  state: SessionState;
  installments: readonly number[];
  label: string;
  onSelect: (months: number) => void;
};

function installmentLabel(value: number, locale: string): string {
  if (value === 0) return locale === "en" ? "Pay in full" : "일시불";
  return locale === "en" ? `${value} mo` : `${value}개월`;
}

export function renderInstallmentDetail(props: InstallmentDetailProps) {
  const { state, installments, label, onSelect } = props;
  const current = state.paymentInstallment ?? 0;
  return h(
    "div",
    { class: "oc-pm-detail-inner" },
    h("p", { class: "oc-pm-detail-title" }, label),
    h(
      "div",
      { class: "oc-installment-grid", role: "radiogroup", "aria-label": label },
      installments.map((m) =>
        h(
          "button",
          {
            type: "button",
            class: "oc-installment-cell",
            role: "radio",
            "aria-checked": m === current ? "true" : "false",
            "data-selected": m === current ? "true" : "false",
            key: `inst-${m}`,
            onClick: () => onSelect(m),
          },
          installmentLabel(m, state.locale),
        ),
      ),
    ),
  );
}
