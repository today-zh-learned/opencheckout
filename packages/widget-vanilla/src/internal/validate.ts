export class OpenCheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCheckoutValidationError";
  }
}

const PUBLISHABLE_KEY_PATTERN = /^pk_(test|live)_([a-z0-9]{4,32})_([a-zA-Z0-9]{6,64})$/;

export function validatePublishableKey(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new OpenCheckoutValidationError("publishableKey is required");
  }
  const match = PUBLISHABLE_KEY_PATTERN.exec(value);
  if (!match) {
    throw new OpenCheckoutValidationError(
      `publishableKey must match pk_(test|live)_<shard:4-32>_<random:6-64>, got "${value}"`,
    );
  }
  const shard = match[2] ?? "";
  const random = match[3] ?? "";
  if (isLowEntropySegment(shard) || isLowEntropySegment(random)) {
    throw new OpenCheckoutValidationError(
      `publishableKey segments must not be a single repeated character, got "${value}"`,
    );
  }
  return value;
}

function isLowEntropySegment(segment: string): boolean {
  if (segment.length === 0) return false;
  const first = segment[0];
  for (let i = 1; i < segment.length; i += 1) {
    if (segment[i] !== first) return false;
  }
  return true;
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

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

function isProductionEnv(): boolean {
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
  return env === "production";
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
  if (parsed.protocol === "https:") return parsed.toString();
  if (parsed.protocol === "http:" && !isProductionEnv() && isLocalHost(parsed.hostname)) {
    return parsed.toString();
  }
  throw new OpenCheckoutValidationError(
    `gatewayUrl must use https (http allowed only on localhost in non-production), got "${value}"`,
  );
}

export function validateRedirectUrl(name: string, value: string): URL {
  let parsed: URL;
  const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
  try {
    parsed = new URL(value, base);
  } catch {
    throw new OpenCheckoutValidationError(`${name} is not a valid URL: "${value}"`);
  }
  if (parsed.protocol === "https:") return parsed;
  if (parsed.protocol === "http:" && isLocalHost(parsed.hostname)) return parsed;
  throw new OpenCheckoutValidationError(
    `${name} must use https (http allowed only on localhost), got "${value}"`,
  );
}
