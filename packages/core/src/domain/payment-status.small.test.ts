import { describe, expect, it } from "vitest";
import {
  PAYMENT_TRANSITIONS,
  PaymentStatus,
  isPaymentTransitionAllowed,
  parsePaymentStatus,
} from "./payment-status.js";

describe("PaymentStatus enum", () => {
  it("has exactly 7 canonical values (ADR-019 §3.1)", () => {
    expect(Object.keys(PaymentStatus)).toHaveLength(7);
  });

  it("contains all required values", () => {
    expect(PaymentStatus.authorized).toBe("authorized");
    expect(PaymentStatus.captured).toBe("captured");
    expect(PaymentStatus.settled).toBe("settled");
    expect(PaymentStatus.voided).toBe("voided");
    expect(PaymentStatus.refunded).toBe("refunded");
    expect(PaymentStatus.partially_refunded).toBe("partially_refunded");
    expect(PaymentStatus.failed).toBe("failed");
  });
});

describe("isPaymentTransitionAllowed", () => {
  it("allows authorized → captured", () => {
    expect(isPaymentTransitionAllowed(PaymentStatus.authorized, PaymentStatus.captured)).toBe(true);
  });

  it("allows authorized → voided", () => {
    expect(isPaymentTransitionAllowed(PaymentStatus.authorized, PaymentStatus.voided)).toBe(true);
  });

  it("forbids captured → authorized (reverse)", () => {
    expect(isPaymentTransitionAllowed(PaymentStatus.captured, PaymentStatus.authorized)).toBe(
      false,
    );
  });

  it("forbids voided → captured (terminal state)", () => {
    expect(isPaymentTransitionAllowed(PaymentStatus.voided, PaymentStatus.captured)).toBe(false);
  });

  it("forbids failed → any", () => {
    for (const target of Object.values(PaymentStatus)) {
      expect(isPaymentTransitionAllowed(PaymentStatus.failed, target)).toBe(false);
    }
  });

  it("allows partially_refunded → refunded", () => {
    expect(
      isPaymentTransitionAllowed(PaymentStatus.partially_refunded, PaymentStatus.refunded),
    ).toBe(true);
  });

  it("covers all 7 states in the transition map", () => {
    expect(PAYMENT_TRANSITIONS.size).toBe(7);
  });
});

describe("parsePaymentStatus", () => {
  it("parses valid status strings", () => {
    expect(parsePaymentStatus("authorized")).toBe(PaymentStatus.authorized);
    expect(parsePaymentStatus("failed")).toBe(PaymentStatus.failed);
  });

  it("returns undefined for unknown status", () => {
    expect(parsePaymentStatus("UNKNOWN")).toBeUndefined();
    expect(parsePaymentStatus("")).toBeUndefined();
  });
});
