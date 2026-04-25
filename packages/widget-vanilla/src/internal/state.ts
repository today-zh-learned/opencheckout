import { EventBus } from "./event-bus.js";
import type { Locale, Money } from "./validate.js";

export type OrderInfo = {
  readonly id: string;
  readonly name: string;
  readonly buyerCountry?: string;
};

export type BuyerCountry = string;

export type AddressSelection = {
  readonly country: string;
  readonly admin1?: string;
  readonly admin1Code?: string;
  readonly admin2?: string;
  readonly admin2Code?: string;
  readonly city?: string;
  readonly line1: string;
  readonly line2?: string;
  readonly postal: string;
  /** @deprecated Use `postal`. Kept as a mirror of `postal` for backward compatibility. */
  readonly zip: string;
  /**
   * google.type.PostalAddress proto-compatible aliases.
   * Populated additively at emit time so downstream consumers can map
   * directly into Google Maps Platform / GCP services without re-keying.
   */
  readonly regionCode?: string;
  readonly languageCode?: string;
  readonly postalCode?: string;
  readonly sortingCode?: string;
  readonly administrativeArea?: string;
  readonly locality?: string;
  readonly sublocality?: string;
  readonly addressLines?: readonly string[];
  readonly recipients?: readonly string[];
  readonly organization?: string;
};

export type ShippingSelection = {
  readonly carrier: string;
  readonly rate: number;
  readonly currency: string;
};

export type PaymentMethodCode =
  | "card"
  | "transfer"
  | "virtual-account"
  | "foreign-card"
  | "easy-pay";

export type WidgetBusMap = {
  "amount:change": Money;
  "order:change": OrderInfo;
  "address:change": AddressSelection;
  "shipping:change": ShippingSelection;
  "payment:change": PaymentMethodCode | string;
  "payment:installment": number;
  "payment:bank": string;
  "payment:easyPay": string;
  "agreement:change": boolean;
};

export type SessionState = {
  amount: Money | undefined;
  order: OrderInfo | undefined;
  addressSelected: AddressSelection | undefined;
  shippingSelected: ShippingSelection | undefined;
  paymentSelected: string | undefined;
  paymentInstallment: number;
  paymentBankCode: string | undefined;
  paymentEasyPayBrand: string | undefined;
  agreementChecked: boolean;
  locale: Locale;
  customerKey: string;
  publishableKey: string;
  gatewayUrl: string;
  bus: EventBus<WidgetBusMap>;
};

export function createSessionState(init: {
  locale: Locale;
  customerKey: string;
  publishableKey: string;
  gatewayUrl: string;
}): SessionState {
  return {
    amount: undefined,
    order: undefined,
    addressSelected: undefined,
    shippingSelected: undefined,
    paymentSelected: undefined,
    paymentInstallment: 0,
    paymentBankCode: undefined,
    paymentEasyPayBrand: undefined,
    agreementChecked: false,
    locale: init.locale,
    customerKey: init.customerKey,
    publishableKey: init.publishableKey,
    gatewayUrl: init.gatewayUrl,
    bus: new EventBus<WidgetBusMap>(),
  };
}
