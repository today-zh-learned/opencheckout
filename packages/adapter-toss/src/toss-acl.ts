import { PaymentStatus, type PaymentStatus as PaymentStatusType } from "@opencheckout/core";

/** Map Toss Payments status strings → canonical PaymentStatus (ADR-019 §3.1) */
const TOSS_STATUS_MAP: Readonly<Record<string, PaymentStatusType>> = {
  READY: PaymentStatus.authorized,
  IN_PROGRESS: PaymentStatus.authorized,
  WAITING_FOR_DEPOSIT: PaymentStatus.authorized,
  DONE: PaymentStatus.captured,
  CANCELED: PaymentStatus.voided,
  PARTIAL_CANCELED: PaymentStatus.partially_refunded,
  ABORTED: PaymentStatus.failed,
  EXPIRED: PaymentStatus.failed,
};

export function tossStatusToPaymentStatus(tossStatus: string): PaymentStatusType | undefined {
  return TOSS_STATUS_MAP[tossStatus];
}
