export const OPEN_CHECKOUT_MESSAGE_SOURCE = "opencheckout.widget";
export const OPEN_CHECKOUT_MESSAGE_VERSION = "2026-04-24";

export type OpenCheckoutWidgetMessage<TPayload = unknown> = {
  readonly source: typeof OPEN_CHECKOUT_MESSAGE_SOURCE;
  readonly version: typeof OPEN_CHECKOUT_MESSAGE_VERSION;
  readonly type: string;
  readonly nonce: string;
  readonly payload: TPayload;
};

export class OpenCheckoutSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCheckoutSecurityError";
  }
}

export function containsPan(value: unknown): boolean {
  return scanForPan(value, new WeakSet<object>());
}

export function assertPanFree(value: unknown): void {
  if (containsPan(value)) {
    throw new OpenCheckoutSecurityError("PAN-like card data cannot cross widget boundaries");
  }
}

export function createWidgetMessage<TPayload>(
  type: string,
  payload: TPayload,
  nonce: string,
): OpenCheckoutWidgetMessage<TPayload> {
  assertPanFree(payload);
  return {
    source: OPEN_CHECKOUT_MESSAGE_SOURCE,
    version: OPEN_CHECKOUT_MESSAGE_VERSION,
    type,
    nonce,
    payload,
  };
}

export function isOpenCheckoutMessage(value: unknown): value is OpenCheckoutWidgetMessage {
  if (!isRecord(value)) return false;
  return (
    value.source === OPEN_CHECKOUT_MESSAGE_SOURCE &&
    value.version === OPEN_CHECKOUT_MESSAGE_VERSION &&
    typeof value.type === "string" &&
    typeof value.nonce === "string" &&
    "payload" in value
  );
}

function scanForPan(value: unknown, seen: WeakSet<object>): boolean {
  if (typeof value === "string") return stringContainsPan(value);
  if (typeof value === "number" || typeof value === "bigint") {
    return stringContainsPan(String(value));
  }
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => scanForPan(item, seen));
  return Object.values(value as Record<string, unknown>).some((item) => scanForPan(item, seen));
}

function stringContainsPan(value: string): boolean {
  const candidates = value.match(/[0-9][0-9 -]{11,30}[0-9]/g) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return (
      digits.length >= 13 && digits.length <= 19 && !isRepeatedDigit(digits) && passesLuhn(digits)
    );
  });
}

function isRepeatedDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let doubleNext = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const digit = Number(digits[index]);
    if (Number.isNaN(digit)) return false;
    if (doubleNext) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
    doubleNext = !doubleNext;
  }
  return sum % 10 === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
