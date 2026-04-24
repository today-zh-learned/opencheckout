import { type PaymentStatus, isPaymentTransitionAllowed } from "@opencheckout/core";
import { tossStatusToPaymentStatus } from "./toss-acl.js";

export type TossWebhookPayload = {
  readonly eventType: string;
  readonly data: {
    readonly paymentKey: string;
    readonly orderId: string;
    readonly status: string;
  };
};

export type WebhookTransitionResult =
  | { allowed: true; from: PaymentStatus; to: PaymentStatus }
  | { allowed: false; reason: string };

export class TossWebhookTransitionPolicy {
  evaluate(current: PaymentStatus, webhook: TossWebhookPayload): WebhookTransitionResult {
    const target = tossStatusToPaymentStatus(webhook.data.status);
    if (!target) {
      return { allowed: false, reason: `Unknown Toss status: ${webhook.data.status}` };
    }
    if (current === target) {
      return { allowed: false, reason: "Idempotent — already in target state" };
    }
    if (!isPaymentTransitionAllowed(current, target)) {
      return {
        allowed: false,
        reason: `Transition ${current} → ${target} not in allowed set`,
      };
    }
    return { allowed: true, from: current, to: target };
  }
}
