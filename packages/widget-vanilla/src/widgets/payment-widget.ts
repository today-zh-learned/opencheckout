import { assertPanFree } from "../internal/pan-guard.js";
import {
  DEFAULT_EASY_PAY_BRANDS,
  PAYMENT_METHOD_CATALOG,
  type PaymentMethodDescriptor,
  easyPayBrandLabel,
  listKrBanks,
  selectVisibleMethods,
} from "../internal/payment-methods.js";
import { h } from "../internal/preact-runtime.js";
import { OpenCheckoutShadowElement, defineOnce, resolveTarget } from "../internal/shadow-base.js";
import type { SessionState } from "../internal/state.js";
import type { Money } from "../internal/validate.js";

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

function formatMoney(amount: Money | undefined, locale: string): string {
  if (!amount) return "";
  const intlLocale =
    locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : locale === "zh-CN" ? "zh-CN" : "en-US";
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: amount.currency,
      maximumFractionDigits: amount.currency === "KRW" || amount.currency === "JPY" ? 0 : 2,
    }).format(amount.value);
  } catch {
    return `${amount.value} ${amount.currency}`;
  }
}

function buildInstallmentMonths(max: number): readonly number[] {
  const cap = Math.max(2, Math.min(24, Math.floor(max)));
  const out: number[] = [0]; // 0 = 일시불
  for (let i = 2; i <= cap; i += 1) out.push(i);
  return out;
}

function installmentLabel(value: number, locale: string): string {
  if (value === 0) return locale === "en" ? "Pay in full" : "일시불";
  return locale === "en" ? `${value} mo` : `${value}개월`;
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

  const labels =
    state.locale === "en"
      ? {
          eyebrow: "PAYMENT",
          title: "Payment method",
          installment: "Installments",
          bank: "Bank",
          transferNote: "A virtual bank account will be issued after payment.",
          easyPay: "Easy pay",
          country: "Issuing country",
          countryUnknown: "Select country in the address widget",
        }
      : {
          eyebrow: "결제",
          title: "결제 수단",
          installment: "할부 개월수",
          bank: "은행",
          transferNote: "결제 후 가상 계좌가 발급됩니다.",
          easyPay: "간편결제 브랜드",
          country: "발급 국가",
          countryUnknown: "주소 위젯에서 국가를 선택하세요",
        };

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

  const renderIcon = (descriptor: PaymentMethodDescriptor) =>
    h(
      "span",
      { class: "oc-pm-icon", "aria-hidden": "true" },
      h(
        "svg",
        {
          width: "16",
          height: "16",
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "1.4",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        h("path", { d: descriptor.iconPath }),
      ),
    );

  const renderInstallmentDetail = () => {
    const current = state.paymentInstallment ?? 0;
    return h(
      "div",
      { class: "oc-pm-detail-inner" },
      h("p", { class: "oc-pm-detail-title" }, labels.installment),
      h(
        "div",
        { class: "oc-installment-grid", role: "radiogroup", "aria-label": labels.installment },
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
              onClick: () => setInstallment(m),
            },
            installmentLabel(m, state.locale),
          ),
        ),
      ),
    );
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

  const renderVirtualAccountDetail = () => {
    const banks = listKrBanks();
    const current = state.paymentBankCode ?? banks[0]?.code ?? "";
    return h(
      "div",
      { class: "oc-pm-detail-inner" },
      h("p", { class: "oc-pm-detail-title" }, labels.bank),
      h(
        "select",
        {
          class: "oc-bank-select",
          "aria-label": labels.bank,
          value: current,
          onChange: (ev: Event) => setBank((ev.target as HTMLSelectElement).value),
        },
        banks.map((b) =>
          h("option", { value: b.code, key: b.code }, state.locale === "en" ? b.nameEn : b.nameKo),
        ),
      ),
    );
  };

  const renderEasyPayDetail = () => {
    const current = state.paymentEasyPayBrand ?? easyPayBrands[0];
    return h(
      "div",
      { class: "oc-pm-detail-inner" },
      h("p", { class: "oc-pm-detail-title" }, labels.easyPay),
      h(
        "div",
        { class: "oc-easy-pay-grid", role: "radiogroup", "aria-label": labels.easyPay },
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
              onClick: () => setEasyPay(brand),
            },
            easyPayBrandLabel(brand, state.locale),
          ),
        ),
      ),
    );
  };

  const renderDetailFor = (code: string) => {
    if (code === "card") {
      const country = state.addressSelected?.country ?? state.order?.buyerCountry ?? "KR";
      if (country === "KR") return renderInstallmentDetail();
      return renderForeignCardDetail();
    }
    if (code === "transfer") return renderTransferDetail();
    if (code === "virtual-account") return renderVirtualAccountDetail();
    if (code === "foreign-card") return renderForeignCardDetail();
    if (code === "easy-pay") return renderEasyPayDetail();
    return null;
  };

  const renderTile = (descriptor: PaymentMethodDescriptor) => {
    const isSelected = selected === descriptor.code;
    const labelText = state.locale === "en" ? descriptor.labelEn : descriptor.labelKo;
    const detail = isSelected ? renderDetailFor(descriptor.code) : null;
    return h(
      "div",
      { class: "oc-pm-tile-wrap", key: `wrap-${descriptor.code}` },
      h(
        "div",
        {
          class: "oc-pm-tile",
          role: "radio",
          tabindex: "0",
          "aria-checked": isSelected ? "true" : "false",
          "data-selected": isSelected ? "true" : "false",
          "data-method": descriptor.code,
          key: `tile-${descriptor.code}`,
          onClick: () => select(descriptor.code),
          onKeyDown: (ev: KeyboardEvent) => {
            if (ev.key === " " || ev.key === "Enter") {
              ev.preventDefault();
              select(descriptor.code);
            }
          },
        },
        renderIcon(descriptor),
        h("span", { class: "oc-pm-label" }, labelText),
        h("span", { class: "oc-pm-chevron", "aria-hidden": "true" }, ">"),
        // Hidden native radio kept for form-association tests / a11y fallback (PAN-free).
        h("input", {
          class: "oc-pm-tile-radio",
          type: "radio",
          name: "oc-payment",
          value: descriptor.code,
          checked: isSelected,
          tabindex: "-1",
          "aria-hidden": "true",
          readonly: true,
          onChange: () => select(descriptor.code),
        }),
      ),
      h("div", { class: "oc-pm-detail", "data-open": isSelected ? "true" : "false" }, detail),
    );
  };

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
        visible.map((d) => renderTile(d)),
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
