export type {
  PaymentGatewayPort,
  InitiatePaymentCommand,
  PaymentIntent,
  PaymentRecord,
  CapturePaymentCommand,
  RefundPaymentCommand,
} from "@opencheckout/core";
export {
  PaymentStatus,
  isPaymentTransitionAllowed,
  parsePaymentStatus,
  PAYMENT_TRANSITIONS,
} from "@opencheckout/core";

export type PaymentIntentRequest = {
  readonly tenantId: string;
  readonly orderId: string;
  readonly amountMinorUnit: bigint;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly returnUrl: string;
  readonly customerEmail: string;
};

export { PaymentOrchestrator } from "./payment-orchestrator.js";
export type { IdempotencyStore } from "./payment-orchestrator.js";
