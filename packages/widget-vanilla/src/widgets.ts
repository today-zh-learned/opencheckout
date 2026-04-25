import { assertPanFree } from "./internal/pan-guard.js";
import { type OrderInfo, type SessionState, createSessionState } from "./internal/state.js";
import {
  type Locale,
  type Money,
  OpenCheckoutValidationError,
  validateCustomerKey,
  validateLocale,
  validateMoney,
  validateRedirectUrl,
} from "./internal/validate.js";
import { type AddressWidget, mountAddressWidget } from "./widgets/address-widget.js";
import { type AgreementWidget, mountAgreementWidget } from "./widgets/agreement-widget.js";
import { type PaymentWidget, mountPaymentWidget } from "./widgets/payment-widget.js";
import { type ShippingWidget, mountShippingWidget } from "./widgets/shipping-widget.js";

export type WidgetsOptions = {
  readonly customerKey: string;
  readonly locale?: Locale;
};

export type RenderAddressOptions = {
  readonly selector: string;
  readonly variantKey?: string;
};

export type RenderShippingOptions = {
  readonly selector: string;
};

export type RenderPaymentOptions = {
  readonly selector: string;
  readonly variantKey?: string;
  readonly methods?: readonly string[];
  readonly easyPayBrands?: readonly string[];
  readonly installmentMaxMonths?: number;
};

export type RenderAgreementOptions = {
  readonly selector: string;
};

export type RequestPaymentOptions = {
  readonly successUrl: string;
  readonly failUrl: string;
  readonly customerEmail?: string;
};

let previewWarningEmitted = false;

export type CheckoutWidgets = {
  setAmount(amount: Money): void;
  setOrder(order: OrderInfo): void;
  renderAddress(p: RenderAddressOptions): AddressWidget;
  renderShipping(p: RenderShippingOptions): ShippingWidget;
  renderPayment(p: RenderPaymentOptions): PaymentWidget;
  renderAgreement(p: RenderAgreementOptions): AgreementWidget;
  requestPayment(p: RequestPaymentOptions): Promise<void>;
  destroy(): void;
};

export function createWidgets(init: {
  publishableKey: string;
  gatewayUrl: string;
  options: WidgetsOptions;
}): CheckoutWidgets {
  const customerKey = validateCustomerKey(init.options.customerKey);
  const locale: Locale = init.options.locale ? validateLocale(init.options.locale) : "en";

  const state: SessionState = createSessionState({
    locale,
    customerKey,
    publishableKey: init.publishableKey,
    gatewayUrl: init.gatewayUrl,
  });

  type MountedWidget = { destroy(): void };
  const mounted: MountedWidget[] = [];

  const requireAmount = (op: string): void => {
    if (!state.amount) {
      throw new OpenCheckoutValidationError(`setAmount must be called before ${op}`);
    }
  };

  const assertInputSafe = (value: unknown): void => {
    assertPanFree(value);
  };

  return {
    setAmount(amount: Money): void {
      const valid = validateMoney(amount);
      assertInputSafe(valid);
      state.amount = valid;
      state.bus.emit("amount:change", valid);
    },
    setOrder(order: OrderInfo): void {
      if (!order || typeof order !== "object") {
        throw new OpenCheckoutValidationError("order must be an object");
      }
      if (typeof order.id !== "string" || order.id.length === 0) {
        throw new OpenCheckoutValidationError("order.id must be a non-empty string");
      }
      if (typeof order.name !== "string" || order.name.length === 0) {
        throw new OpenCheckoutValidationError("order.name must be a non-empty string");
      }
      assertInputSafe(order);
      state.order = order;
      state.bus.emit("order:change", order);
    },
    renderAddress(p: RenderAddressOptions): AddressWidget {
      requireAmount("renderAddress");
      assertInputSafe(p);
      const w = mountAddressWidget(p.selector, state, {
        ...(p.variantKey !== undefined ? { variantKey: p.variantKey } : {}),
      });
      mounted.push(w);
      return w;
    },
    renderShipping(p: RenderShippingOptions): ShippingWidget {
      requireAmount("renderShipping");
      assertInputSafe(p);
      const w = mountShippingWidget(p.selector, state);
      mounted.push(w);
      return w;
    },
    renderPayment(p: RenderPaymentOptions): PaymentWidget {
      requireAmount("renderPayment");
      assertInputSafe(p);
      const w = mountPaymentWidget(p.selector, state, {
        ...(p.variantKey !== undefined ? { variantKey: p.variantKey } : {}),
        ...(p.methods !== undefined ? { methods: p.methods } : {}),
        ...(p.easyPayBrands !== undefined ? { easyPayBrands: p.easyPayBrands } : {}),
        ...(p.installmentMaxMonths !== undefined
          ? { installmentMaxMonths: p.installmentMaxMonths }
          : {}),
      });
      mounted.push(w);
      return w;
    },
    renderAgreement(p: RenderAgreementOptions): AgreementWidget {
      requireAmount("renderAgreement");
      assertInputSafe(p);
      const w = mountAgreementWidget(p.selector, state);
      mounted.push(w);
      return w;
    },
    async requestPayment(p: RequestPaymentOptions): Promise<void> {
      assertInputSafe(p);
      requireAmount("requestPayment");
      if (!state.order) {
        throw new OpenCheckoutValidationError("setOrder must be called before requestPayment");
      }
      if (state.agreementChecked !== true) {
        throw new OpenCheckoutValidationError("agreement not accepted");
      }
      if (!p || typeof p !== "object") {
        throw new OpenCheckoutValidationError("requestPayment options are required");
      }
      if (typeof p.successUrl !== "string" || p.successUrl.length === 0) {
        throw new OpenCheckoutValidationError("successUrl is required");
      }
      if (typeof p.failUrl !== "string" || p.failUrl.length === 0) {
        throw new OpenCheckoutValidationError("failUrl is required");
      }
      if (typeof window === "undefined") {
        throw new OpenCheckoutValidationError(
          "requestPayment requires a window; call from the browser",
        );
      }
      // Scan redirect URLs for embedded PANs before parsing/redirecting.
      assertPanFree(p.successUrl);
      assertPanFree(p.failUrl);
      const successUrl = validateRedirectUrl("successUrl", p.successUrl);
      validateRedirectUrl("failUrl", p.failUrl);
      if (!previewWarningEmitted) {
        previewWarningEmitted = true;
        // eslint-disable-next-line no-console
        console.warn(
          "[OpenCheckout] requestPayment is in PREVIEW — no real PG call. paymentKey is mock_*.",
        );
      }
      const order = state.order;
      const amount = state.amount;
      if (!amount) throw new OpenCheckoutValidationError("amount missing");
      const mockPaymentKey = `mock_preview_${order.id}_${Date.now()}`;
      successUrl.searchParams.set("paymentKey", mockPaymentKey);
      successUrl.searchParams.set("orderId", order.id);
      successUrl.searchParams.set("amount", String(amount.value));
      window.location.assign(successUrl.toString());
    },
    destroy(): void {
      for (const w of mounted) {
        try {
          w.destroy();
        } catch {
          // swallow widget destroy errors to allow cleanup to continue
        }
      }
      mounted.length = 0;
      state.bus.clear();
    },
  };
}
