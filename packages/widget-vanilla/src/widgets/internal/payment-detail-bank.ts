import { listKrBanks } from "../../internal/payment-methods.js";
import { h } from "../../internal/preact-runtime.js";
import type { SessionState } from "../../internal/state.js";

export type BankDetailProps = {
  state: SessionState;
  label: string;
  onSelect: (code: string) => void;
};

export function renderBankDetail(props: BankDetailProps) {
  const { state, label, onSelect } = props;
  const banks = listKrBanks();
  const current = state.paymentBankCode ?? banks[0]?.code ?? "";
  return h(
    "div",
    { class: "oc-pm-detail-inner" },
    h("p", { class: "oc-pm-detail-title" }, label),
    h(
      "select",
      {
        class: "oc-bank-select",
        "aria-label": label,
        value: current,
        onChange: (ev: Event) => onSelect((ev.target as HTMLSelectElement).value),
      },
      banks.map((b) =>
        h("option", { value: b.code, key: b.code }, state.locale === "en" ? b.nameEn : b.nameKo),
      ),
    ),
  );
}
