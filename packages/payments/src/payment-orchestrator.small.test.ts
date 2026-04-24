import {
  type CapturePaymentCommand,
  type InitiatePaymentCommand,
  type OutboxEvent,
  type OutboxPort,
  type PaymentGatewayPort,
  type PaymentIntent,
  type PaymentRecord,
  type RefundPaymentCommand,
  type Result,
  asIdempotencyKey,
  asOrderId,
  asPaymentId,
  asTenantId,
  ok,
} from "@opencheckout/core";
import { describe, expect, it, vi } from "vitest";
import { type IdempotencyStore, PaymentOrchestrator } from "./payment-orchestrator.js";

const tenantId = asTenantId("tenant_1");
const orderId = asOrderId("order_1");
const idempotencyKey = asIdempotencyKey("idem_1");
const paymentId = asPaymentId("pay_1");

const intent: PaymentIntent = {
  paymentId,
  providerPaymentKey: "toss_payment_key",
  checkoutUrl: "https://checkout.test/pay",
  expiresAt: new Date("2026-04-24T12:05:00.000Z"),
};

function makeInitiateCommand(): InitiatePaymentCommand {
  return {
    tenantId,
    orderId,
    amount: { amount: 89000n, currency: "KRW" },
    idempotencyKey,
    returnUrl: "https://merchant.example/return",
    customerEmail: "buyer@example.com",
  };
}

function makeGateway(overrides: Partial<PaymentGatewayPort> = {}): PaymentGatewayPort {
  return {
    initiatePayment: vi.fn(async (): Promise<Result<PaymentIntent>> => ok(intent)),
    capturePayment: vi.fn(async (_cmd: CapturePaymentCommand): Promise<Result<PaymentRecord>> => {
      throw new Error("capturePayment not implemented in this test");
    }),
    refundPayment: vi.fn(async (_cmd: RefundPaymentCommand): Promise<Result<PaymentRecord>> => {
      throw new Error("refundPayment not implemented in this test");
    }),
    getPayment: vi.fn(async (): Promise<Result<PaymentRecord>> => {
      throw new Error("getPayment not implemented in this test");
    }),
    ...overrides,
  };
}

function makeOutbox(): OutboxPort & {
  readonly published: Omit<OutboxEvent, "id" | "createdAt">[];
} {
  const published: Omit<OutboxEvent, "id" | "createdAt">[] = [];
  return {
    published,
    async publish(event) {
      published.push(event);
    },
  };
}

function makeIdempotency(
  existing?: { status: "pending" | "completed"; response?: unknown },
  reserveResult = true,
): IdempotencyStore & { readonly completed: unknown[] } {
  const completed: unknown[] = [];
  return {
    completed,
    async get() {
      return existing;
    },
    async reserve() {
      return reserveResult;
    },
    async complete(_key, _tenantId, response) {
      completed.push(response);
    },
  };
}

describe("PaymentOrchestrator", () => {
  it("initiates payments, stores idempotent response, and publishes outbox event", async () => {
    const gateway = makeGateway();
    const outbox = makeOutbox();
    const idempotency = makeIdempotency();
    const orchestrator = new PaymentOrchestrator(gateway, outbox, idempotency);

    const result = await orchestrator.initiatePayment(makeInitiateCommand());

    expect(result).toEqual({ ok: true, value: intent });
    expect(idempotency.completed).toEqual([intent]);
    expect(outbox.published).toEqual([
      {
        tenantId,
        aggregateType: "Payment",
        aggregateId: paymentId,
        eventType: "payment.initiated",
        payload: {
          orderId,
          amount: paymentId,
          checkoutUrl: "https://checkout.test/pay",
        },
      },
    ]);
  });

  it("replays completed idempotency responses without calling the gateway", async () => {
    const gateway = makeGateway();
    const orchestrator = new PaymentOrchestrator(
      gateway,
      makeOutbox(),
      makeIdempotency({
        status: "completed",
        response: intent,
      }),
    );

    const result = await orchestrator.initiatePayment(makeInitiateCommand());

    expect(result).toEqual({ ok: true, value: intent });
    expect(gateway.initiatePayment).not.toHaveBeenCalled();
  });

  it("rejects concurrent reservations for the same idempotency key", async () => {
    const orchestrator = new PaymentOrchestrator(
      makeGateway(),
      makeOutbox(),
      makeIdempotency(undefined, false),
    );

    const result = await orchestrator.initiatePayment(makeInitiateCommand());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Concurrent request/);
  });
});
