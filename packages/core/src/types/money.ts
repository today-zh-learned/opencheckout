import { type Result, err, ok } from "./result.js";

/** ISO 4217 currency code */
export type CurrencyCode = string;

/**
 * Immutable money value object. Amount in smallest currency unit (e.g. KRW won, USD cents).
 * Never use floating-point arithmetic on money — always work in integer minor units.
 */
export type Money = {
  readonly amount: bigint;
  readonly currency: CurrencyCode;
};

export function money(amount: bigint, currency: CurrencyCode): Money {
  return { amount, currency };
}

export function addMoney(a: Money, b: Money): Result<Money> {
  if (a.currency !== b.currency) {
    return err(new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`));
  }
  return ok({ amount: a.amount + b.amount, currency: a.currency });
}

export function subtractMoney(a: Money, b: Money): Result<Money> {
  if (a.currency !== b.currency) {
    return err(new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`));
  }
  if (a.amount < b.amount) {
    return err(new Error("Subtraction would result in negative money"));
  }
  return ok({ amount: a.amount - b.amount, currency: a.currency });
}

export function formatMoney(m: Money): string {
  return `${m.amount} ${m.currency}`;
}
