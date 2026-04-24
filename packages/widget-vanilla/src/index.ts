/**
 * @opencheckout/widget — public entrypoint.
 *
 * Widget-first SDK modelled on Toss Payments 결제위젯:
 *   const oc = await OpenCheckout.load({ publishableKey });
 *   const widgets = oc.widgets({ customerKey, locale });
 *   widgets.setAmount({ value, currency });
 *   widgets.setOrder({ id, name, buyerCountry });
 *   widgets.renderAddress({ selector });
 *   widgets.renderShipping({ selector });
 *   widgets.renderPayment({ selector });
 *   widgets.renderAgreement({ selector });
 *   await widgets.requestPayment({ successUrl, failUrl });
 */

export const WIDGET_VERSION = "0.0.1";
export const CHECKOUT_EVENT_NAME = "opencheckout:event";

export { load, type LoadOptions, type OpenCheckoutInstance } from "./load.js";

export {
  createWidgets,
  type CheckoutWidgets,
  type WidgetsOptions,
  type RenderAddressOptions,
  type RenderShippingOptions,
  type RenderPaymentOptions,
  type RenderAgreementOptions,
  type RequestPaymentOptions,
} from "./widgets.js";

export type { AddressWidget } from "./widgets/address-widget.js";
export type { ShippingWidget } from "./widgets/shipping-widget.js";
export type { PaymentWidget } from "./widgets/payment-widget.js";
export type { AgreementWidget } from "./widgets/agreement-widget.js";

export type {
  OrderInfo,
  AddressSelection,
  ShippingSelection,
  PaymentMethodCode,
  BuyerCountry,
} from "./internal/state.js";

export {
  CUSTOMER_KEY_ANONYMOUS,
  OpenCheckoutValidationError,
  type Locale,
  type Currency,
  type Money,
} from "./internal/validate.js";

// PAN boundary utilities — exported for invariant preservation per ADR-003.
export {
  OpenCheckoutSecurityError,
  OPEN_CHECKOUT_MESSAGE_SOURCE,
  OPEN_CHECKOUT_MESSAGE_VERSION,
  containsPan,
  assertPanFree,
  createWidgetMessage,
  isOpenCheckoutMessage,
  type OpenCheckoutWidgetMessage,
} from "./internal/pan-guard.js";

import { load } from "./load.js";

/**
 * OpenCheckout namespace — mirrors the public Toss-like API surface.
 * Merchants integrate via `OpenCheckout.load(...)`.
 */
export const OpenCheckout = {
  load,
} as const;

export default OpenCheckout;
