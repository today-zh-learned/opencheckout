export class OpenCheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCheckoutValidationError";
  }
}

const PUBLISHABLE_KEY_PATTERN = /^pk_(test|live)_[a-z0-9]{4,}_[a-zA-Z0-9]{6,}$/;

export function validatePublishableKey(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new OpenCheckoutValidationError("publishableKey is required");
  }
  if (!PUBLISHABLE_KEY_PATTERN.test(value)) {
    throw new OpenCheckoutValidationError(
      `publishableKey must match pk_(test|live)_<shard>_<random>, got "${value}"`,
    );
  }
  return value;
}

const CUSTOMER_KEY_CHARS = /^[A-Za-z0-9\-_=.@]+$/;
const CUSTOMER_KEY_SPECIAL = /[\-_=.@]/;
export const CUSTOMER_KEY_ANONYMOUS = "ANONYMOUS";

export function validateCustomerKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new OpenCheckoutValidationError("customerKey must be a string");
  }
  if (value === CUSTOMER_KEY_ANONYMOUS) return value;
  if (value.length < 2 || value.length > 50) {
    throw new OpenCheckoutValidationError(
      `customerKey must be 2-50 characters, got length ${value.length}`,
    );
  }
  if (!CUSTOMER_KEY_CHARS.test(value)) {
    throw new OpenCheckoutValidationError("customerKey must only contain [A-Za-z0-9-_=.@]");
  }
  if (!CUSTOMER_KEY_SPECIAL.test(value)) {
    throw new OpenCheckoutValidationError("customerKey must contain at least one of -_=.@");
  }
  return value;
}

const ALLOWED_LOCALES = ["ko", "en", "ja", "zh-CN"] as const;
export type Locale = (typeof ALLOWED_LOCALES)[number];

export function validateLocale(value: unknown): Locale {
  if (typeof value !== "string") {
    throw new OpenCheckoutValidationError("locale must be a string");
  }
  if (!ALLOWED_LOCALES.includes(value as Locale)) {
    throw new OpenCheckoutValidationError(
      `locale must be one of ${ALLOWED_LOCALES.join(", ")}, got "${value}"`,
    );
  }
  return value as Locale;
}

const ALLOWED_CURRENCIES = ["KRW", "USD", "JPY"] as const;
export type Currency = (typeof ALLOWED_CURRENCIES)[number];

export type Money = {
  readonly value: number;
  readonly currency: Currency;
};

export function validateMoney(value: unknown): Money {
  if (value === null || typeof value !== "object") {
    throw new OpenCheckoutValidationError("amount must be { value, currency }");
  }
  const record = value as Record<string, unknown>;
  const amount = record.value;
  const currency = record.currency;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new OpenCheckoutValidationError("amount.value must be a non-negative finite number");
  }
  if (typeof currency !== "string" || !ALLOWED_CURRENCIES.includes(currency as Currency)) {
    throw new OpenCheckoutValidationError(
      `amount.currency must be one of ${ALLOWED_CURRENCIES.join(", ")}`,
    );
  }
  return { value: amount, currency: currency as Currency };
}

export function validateGatewayUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new OpenCheckoutValidationError("gatewayUrl must be a non-empty string");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new OpenCheckoutValidationError(`gatewayUrl is not a valid URL: "${value}"`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new OpenCheckoutValidationError("gatewayUrl must use http or https");
  }
  return parsed.toString();
}
