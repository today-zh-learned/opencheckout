import { assertPanFree } from "../internal/pan-guard.js";
import {
  DEFAULT_EASY_PAY_BRANDS,
  PAYMENT_METHOD_CATALOG,
  type PaymentMethodDescriptor,
  listKrBanks,
  selectVisibleMethods,
} from "../internal/payment-methods.js";
import { h } from "../internal/preact-runtime.js";
import { OpenCheckoutShadowElement, defineOnce, resolveTarget } from "../internal/shadow-base.js";
import type { SessionState } from "../internal/state.js";
import { renderBankDetail } from "./internal/payment-detail-bank.js";
import { renderEasyPayDetail } from "./internal/payment-detail-easypay.js";
import { renderInstallmentDetail } from "./internal/payment-detail-installment.js";
import { buildPaymentLabels, formatMoney } from "./internal/payment-labels.js";
import { renderPaymentTile } from "./internal/payment-method-tile.js";

export type PaymentWidgetEvents = {
  paymentMethodSelect: string;
  installmentChange: number;
  bankSelect: string;
  easyPaySelect: string;
};

export type PaymentWidget = {
  on<K extends keyof PaymentWidgetEvents>(
    event: K,
    cb: (payload: PaymentWidgetEvents[K]) => void,
  ): () => void;
  destroy(): void;
};

export type PaymentWidgetMountOptions = {
  variantKey?: string;
  methods?: readonly string[];
  easyPayBrands?: readonly string[];
  installmentMaxMonths?: number;
};

const TAG = "oc-payment";
const SKELETON_MS = 100;

const ALLOWED_EVENTS: ReadonlySet<keyof PaymentWidgetEvents> = new Set<keyof PaymentWidgetEvents>([
  "paymentMethodSelect",
  "installmentChange",
  "bankSelect",
  "easyPaySelect",
]);

export class OcPaymentElement extends OpenCheckoutShadowElement {}

type Listeners = {
  paymentMethodSelect: Array<(p: string) => void>;
  installmentChange: Array<(p: number) => void>;
  bankSelect: Array<(p: string) => void>;
  easyPaySelect: Array<(p: string) => void>;
};

function buildInstallmentMonths(max: number): readonly number[] {
  const cap = Math.max(2, Math.min(24, Math.floor(max)));
  const out: number[] = [0]; // 0 = 일시불
  for (let i = 2; i <= cap; i += 1) out.push(i);
  return out;
}

export function mountPaymentWidget(
  target: Element | string,
  state: SessionState,
  options: PaymentWidgetMountOptions = {},
): PaymentWidget {
  defineOnce(TAG, OcPaymentElement);
  const host = resolveTarget(target);
  const el = document.createElement(TAG) as OcPaymentElement;

  const listeners: Listeners = {
    paymentMethodSelect: [],
    installmentChange: [],
    bankSelect: [],
    easyPaySelect: [],
  };

  let destroyed = false;
  let selected: string = state.paymentSelected ?? "card";
  let skeletonVisible = true;
  const installments = buildInstallmentMonths(options.installmentMaxMonths ?? 12);
  const easyPayBrands =
    options.easyPayBrands && options.easyPayBrands.length > 0
      ? options.easyPayBrands
      : DEFAULT_EASY_PAY_BRANDS;

  const labels = buildPaymentLabels(state.locale);

  // Initialize state defaults if missing
  if (!state.paymentSelected) state.paymentSelected = selected;

  const ensureBankDefault = (): void => {
    if (selected === "virtual-account" && !state.paymentBankCode) {
      const first = listKrBanks()[0];
      if (first) state.paymentBankCode = first.code;
    }
  };

  const ensureEasyPayDefault = (): void => {
    if (selected === "easy-pay" && !state.paymentEasyPayBrand) {
      state.paymentEasyPayBrand = easyPayBrands[0];
    }
  };

  const select = (code: string): void => {
    selected = code;
    state.paymentSelected = code;
    // Reset detail-only fields when switching methods, except when re-selecting same.
    if (code !== "card") state.paymentInstallment = 0;
    if (code !== "virtual-account") state.paymentBankCode = undefined;
    if (code !== "easy-pay") state.paymentEasyPayBrand = undefined;
    ensureBankDefault();
    ensureEasyPayDefault();
    state.bus.emit("payment:change", code);
    for (const cb of listeners.paymentMethodSelect) cb(code);
    el.rerender();
  };

  const setInstallment = (months: number): void => {
    state.paymentInstallment = months;
    state.bus.emit("payment:installment", months);
    for (const cb of listeners.installmentChange) cb(months);
    el.rerender();
  };

  const setBank = (code: string): void => {
    state.paymentBankCode = code;
    state.bus.emit("payment:bank", code);
    for (const cb of listeners.bankSelect) cb(code);
    el.rerender();
  };

  const setEasyPay = (brand: string): void => {
    state.paymentEasyPayBrand = brand;
    state.bus.emit("payment:easyPay", brand);
    for (const cb of listeners.easyPaySelect) cb(brand);
    el.rerender();
  };

  const renderForeignCardDetail = () => {
    const country = state.addressSelected?.country;
    const text = country ? country : labels.countryUnknown;
    return h(
      "div",
      { class: "oc-pm-detail-inner" },
      h("p", { class: "oc-pm-detail-title" }, labels.country),
      h("p", { class: "oc-pm-note" }, text),
    );
  };

  const renderTransferDetail = () =>
    h("div", { class: "oc-pm-detail-inner" }, h("p", { class: "oc-pm-note" }, labels.transferNote));

  const renderDetailFor = (code: string) => {
    if (code === "card") {
      const country = state.addressSelected?.country ?? state.order?.buyerCountry ?? "KR";
      if (country === "KR")
        return renderInstallmentDetail({ state, installments, label: labels.installment, onSelect: setInstallment });
      return renderForeignCardDetail();
    }
    if (code === "transfer") return renderTransferDetail();
    if (code === "virtual-account")
      return renderBankDetail({ state, label: labels.bank, onSelect: setBank });
    if (code === "foreign-card") return renderForeignCardDetail();
    if (code === "easy-pay")
      return renderEasyPayDetail({ state, easyPayBrands, label: labels.easyPay, onSelect: setEasyPay });
    return null;
  };

  const renderTile = (descriptor: PaymentMethodDescriptor, visibleList: readonly PaymentMethodDescriptor[]) =>
    renderPaymentTile({
      descriptor,
      visibleList,
      isSelected: selected === descriptor.code,
      locale: state.locale,
      detail: selected === descriptor.code ? renderDetailFor(descriptor.code) : null,
      onSelect: select,
    });

  const renderSkeleton = () =>
    h(
      "section",
      {
        class: "oc-shell",
        part: "shell",
        "aria-busy": "true",
        "aria-label": "OpenCheckout payment widget",
      },
      h("p", { class: "oc-eyebrow" }, labels.eyebrow),
      h("h3", { class: "oc-title" }, labels.title),
      h("div", { class: "oc-pm-skeleton" }),
      h("div", { class: "oc-pm-skeleton" }),
      h("div", { class: "oc-pm-skeleton" }),
    );

  const renderNode = () => {
    const country = state.addressSelected?.country ?? state.order?.buyerCountry ?? "KR";
    const isKorea = country === "KR";
    const visible = selectVisibleMethods(PAYMENT_METHOD_CATALOG, isKorea, options.methods);
    const snapshot = {
      selected,
      variantKey: options.variantKey,
      country,
      installment: state.paymentInstallment,
      bank: state.paymentBankCode,
      easyPay: state.paymentEasyPayBrand,
    };
    assertPanFree(snapshot);

    if (skeletonVisible) return renderSkeleton();

    return h(
      "section",
      {
        class: "oc-shell oc-pm-fade",
        part: "shell",
        "aria-label": "OpenCheckout payment widget",
      },
      h(
        "div",
        { class: "oc-pm-header" },
        h(
          "div",
          null,
          h("p", { class: "oc-eyebrow" }, labels.eyebrow),
          h("h3", { class: "oc-title" }, labels.title),
        ),
        state.amount
          ? h(
              "span",
              { class: "oc-pm-amount-chip", "aria-label": "amount" },
              formatMoney(state.amount, state.locale),
            )
          : null,
      ),
      h(
        "div",
        { class: "oc-pm-tiles", role: "radiogroup", "aria-label": labels.title },
        visible.map((d) => renderTile(d, visible)),
      ),
    );
  };

  el.setRenderFn(renderNode, { selected });
  host.append(el);

  // Brief skeleton shimmer for perceived load weight.
  let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
  if (typeof window !== "undefined") {
    skeletonTimer = setTimeout(() => {
      skeletonVisible = false;
      skeletonTimer = null;
      if (!destroyed) el.rerender();
    }, SKELETON_MS);
  } else {
    skeletonVisible = false;
  }

  const unsubAmount = state.bus.on("amount:change", () => el.rerender());
  const unsubOrder = state.bus.on("order:change", () => el.rerender());
  const unsubAddress = state.bus.on("address:change", () => el.rerender());

  return {
    on<K extends keyof PaymentWidgetEvents>(
      event: K,
      cb: (payload: PaymentWidgetEvents[K]) => void,
    ): () => void {
      if (destroyed) throw new Error("PaymentWidget has been destroyed");
      if (!ALLOWED_EVENTS.has(event)) {
        throw new Error(`Unknown PaymentWidget event: ${String(event)}`);
      }
      const arr = listeners[event] as Array<(p: PaymentWidgetEvents[K]) => void>;
      arr.push(cb);
      return () => {
        const idx = arr.indexOf(cb);
        if (idx >= 0) arr.splice(idx, 1);
      };
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (skeletonTimer) clearTimeout(skeletonTimer);
      unsubAmount();
      unsubOrder();
      unsubAddress();
      listeners.paymentMethodSelect.length = 0;
      listeners.installmentChange.length = 0;
      listeners.bankSelect.length = 0;
      listeners.easyPaySelect.length = 0;
      el.remove();
    },
  };
}
