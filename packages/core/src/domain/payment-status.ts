/**
 * Canonical PaymentStatus enum — ADR-019 §3.1
 * 7 states, non-extensible without ADR amendment.
 */
export const PaymentStatus = {
  authorized: "authorized",
  captured: "captured",
  settled: "settled",
  voided: "voided",
  refunded: "refunded",
  partially_refunded: "partially_refunded",
  failed: "failed",
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/**
 * Allowed state transitions per ADR-012 §3.
 * From → Set<To>
 */
export const PAYMENT_TRANSITIONS: ReadonlyMap<PaymentStatus, ReadonlySet<PaymentStatus>> = new Map([
  [PaymentStatus.authorized, new Set([PaymentStatus.captured, PaymentStatus.voided])],
  [
    PaymentStatus.captured,
    new Set([PaymentStatus.settled, PaymentStatus.refunded, PaymentStatus.partially_refunded]),
  ],
  [PaymentStatus.settled, new Set([PaymentStatus.refunded, PaymentStatus.partially_refunded])],
  [PaymentStatus.voided, new Set()],
  [PaymentStatus.refunded, new Set()],
  [PaymentStatus.partially_refunded, new Set([PaymentStatus.refunded])],
  [PaymentStatus.failed, new Set()],
]);

export function isPaymentTransitionAllowed(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS.get(from)?.has(to) ?? false;
}

export function parsePaymentStatus(raw: string): PaymentStatus | undefined {
  return Object.values(PaymentStatus).find((v) => v === raw) as PaymentStatus | undefined;
}
