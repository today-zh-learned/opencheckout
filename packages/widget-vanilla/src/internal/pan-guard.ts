export const OPEN_CHECKOUT_MESSAGE_SOURCE = "opencheckout.widget";
export const OPEN_CHECKOUT_MESSAGE_VERSION = "2026-04-24";

const PAN_MIN_LENGTH = 13;
const PAN_MAX_LENGTH = 19;

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
  if (value === undefined || value === null) return;
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
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return stringContainsPan(value);
  if (typeof value === "number" || typeof value === "bigint") {
    return stringContainsPan(String(value));
  }
  if (typeof value === "boolean") return false;
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (value instanceof Map) {
    for (const [k, v] of value.entries()) {
      if (scanForPan(k, seen) || scanForPan(v, seen)) return true;
    }
    return false;
  }
  if (value instanceof Set) {
    for (const v of value.values()) {
      if (scanForPan(v, seen)) return true;
    }
    return false;
  }
  if (value instanceof ArrayBuffer) {
    return stringContainsPan(decodeBytes(new Uint8Array(value)));
  }
  if (value instanceof Uint8Array) {
    return stringContainsPan(decodeBytes(value));
  }
  if (ArrayBuffer.isView(value)) {
    // Other typed arrays (Int16Array, Float32Array, etc.) are not safe to decode as
    // text — refuse them rather than silently passing data we cannot scan.
    throw new OpenCheckoutSecurityError(
      `unsupported input type for PAN scan: ${value.constructor.name}`,
    );
  }
  if (Array.isArray(value)) return value.some((item) => scanForPan(item, seen));
  return Object.values(value as Record<string, unknown>).some((item) => scanForPan(item, seen));
}

function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function stringContainsPan(value: string): boolean {
  // NFKC folds full-width digits (e.g. "４１１１") and other compat forms into ASCII so
  // the digit-only window matches them.
  const normalized = value.normalize("NFKC");
  const digits = normalized.replace(/\D+/gu, "");
  if (digits.length < PAN_MIN_LENGTH) return false;
  for (let start = 0; start + PAN_MIN_LENGTH <= digits.length; start += 1) {
    const maxLen = Math.min(PAN_MAX_LENGTH, digits.length - start);
    for (let len = PAN_MIN_LENGTH; len <= maxLen; len += 1) {
      const window = digits.slice(start, start + len);
      if (isRepeatedDigit(window)) continue;
      if (passesLuhn(window)) return true;
    }
  }
  return false;
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
