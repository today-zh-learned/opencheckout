import { PaymentStatus } from "@opencheckout/core";
import { describe, expect, it } from "vitest";
import { tossStatusToPaymentStatus } from "./toss-acl.js";

describe("tossStatusToPaymentStatus (ACL)", () => {
  it("maps DONE → captured", () => {
    expect(tossStatusToPaymentStatus("DONE")).toBe(PaymentStatus.captured);
  });

  it("maps READY → authorized", () => {
    expect(tossStatusToPaymentStatus("READY")).toBe(PaymentStatus.authorized);
  });

  it("maps CANCELED → voided", () => {
    expect(tossStatusToPaymentStatus("CANCELED")).toBe(PaymentStatus.voided);
  });

  it("maps PARTIAL_CANCELED → partially_refunded", () => {
    expect(tossStatusToPaymentStatus("PARTIAL_CANCELED")).toBe(PaymentStatus.partially_refunded);
  });

  it("maps ABORTED → failed", () => {
    expect(tossStatusToPaymentStatus("ABORTED")).toBe(PaymentStatus.failed);
  });

  it("maps EXPIRED → failed", () => {
    expect(tossStatusToPaymentStatus("EXPIRED")).toBe(PaymentStatus.failed);
  });

  it("returns undefined for unknown status", () => {
    expect(tossStatusToPaymentStatus("MYSTERY")).toBeUndefined();
  });
});
