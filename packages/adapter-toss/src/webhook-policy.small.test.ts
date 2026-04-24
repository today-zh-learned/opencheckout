import { PaymentStatus } from "@opencheckout/core";
import { describe, expect, it } from "vitest";
import { type TossWebhookPayload, TossWebhookTransitionPolicy } from "./webhook-policy.js";

function makeWebhook(status: string): TossWebhookPayload {
  return {
    eventType: "PAYMENT_STATUS_CHANGED",
    data: { paymentKey: "pk_test_123", orderId: "ord_001", status },
  };
}

describe("TossWebhookTransitionPolicy", () => {
  const policy = new TossWebhookTransitionPolicy();

  it("allows authorized → captured (DONE webhook)", () => {
    const result = policy.evaluate(PaymentStatus.authorized, makeWebhook("DONE"));
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.from).toBe(PaymentStatus.authorized);
      expect(result.to).toBe(PaymentStatus.captured);
    }
  });

  it("blocks captured → authorized (invalid transition)", () => {
    const result = policy.evaluate(PaymentStatus.captured, makeWebhook("READY"));
    expect(result.allowed).toBe(false);
  });

  it("blocks idempotent same-state webhook", () => {
    const result = policy.evaluate(PaymentStatus.captured, makeWebhook("DONE"));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/Idempotent/);
  });

  it("blocks unknown Toss status", () => {
    const result = policy.evaluate(PaymentStatus.authorized, makeWebhook("UNKNOWN_STATUS"));
    expect(result.allowed).toBe(false);
  });
});
