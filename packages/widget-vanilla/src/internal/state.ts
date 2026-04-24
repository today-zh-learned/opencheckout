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
  readonly zip: string;
  readonly line1: string;
};

export type ShippingSelection = {
  readonly carrier: string;
  readonly rate: number;
  readonly currency: string;
};

export type PaymentMethodCode = "card" | "transfer" | "virtual-account" | "foreign-card";

export type WidgetBusMap = {
  "amount:change": Money;
  "order:change": OrderInfo;
  "address:change": AddressSelection;
  "shipping:change": ShippingSelection;
  "payment:change": PaymentMethodCode | string;
  "agreement:change": boolean;
};

export type SessionState = {
  amount: Money | undefined;
  order: OrderInfo | undefined;
  addressSelected: AddressSelection | undefined;
  shippingSelected: ShippingSelection | undefined;
  paymentSelected: string | undefined;
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
    agreementChecked: false,
    locale: init.locale,
    customerKey: init.customerKey,
    publishableKey: init.publishableKey,
    gatewayUrl: init.gatewayUrl,
    bus: new EventBus<WidgetBusMap>(),
  };
}
