import type {
  CapturePaymentCommand,
  InitiatePaymentCommand,
  OutboxPort,
  PaymentGatewayPort,
  PaymentIntent,
  PaymentRecord,
  RefundPaymentCommand,
} from "@opencheckout/core";
import { type Result, err, isErr, ok } from "@opencheckout/core";

export type IdempotencyStore = {
  get(
    key: string,
    tenantId: string,
  ): Promise<{ status: "pending" | "completed"; response?: unknown } | undefined>;
  reserve(key: string, tenantId: string): Promise<boolean>;
  complete(key: string, tenantId: string, response: unknown): Promise<void>;
};

export class PaymentOrchestrator {
  constructor(
    private readonly gateway: PaymentGatewayPort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyStore,
  ) {}

  async initiatePayment(cmd: InitiatePaymentCommand): Promise<Result<PaymentIntent>> {
    const existing = await this.idempotency.get(cmd.idempotencyKey, cmd.tenantId);
    if (existing?.status === "completed" && existing.response) {
      return ok(existing.response as PaymentIntent);
    }
    if (existing?.status === "pending") {
      return err(new Error("Payment intent already in progress — retry after"));
    }

    const reserved = await this.idempotency.reserve(cmd.idempotencyKey, cmd.tenantId);
    if (!reserved) {
      return err(new Error("Concurrent request for same idempotency key"));
    }

    const result = await this.gateway.initiatePayment(cmd);
    if (isErr(result)) {
      return result;
    }

    await this.idempotency.complete(cmd.idempotencyKey, cmd.tenantId, result.value);
    await this.outbox.publish({
      tenantId: cmd.tenantId,
      aggregateType: "Payment",
      aggregateId: result.value.paymentId,
      eventType: "payment.initiated",
      payload: {
        orderId: cmd.orderId,
        amount: result.value.paymentId,
        checkoutUrl: result.value.checkoutUrl,
      },
    });

    return result;
  }

  async capturePayment(cmd: CapturePaymentCommand): Promise<Result<PaymentRecord>> {
    const existing = await this.idempotency.get(cmd.idempotencyKey, cmd.tenantId);
    if (existing?.status === "completed" && existing.response) {
      return ok(existing.response as PaymentRecord);
    }

    const reserved = await this.idempotency.reserve(cmd.idempotencyKey, cmd.tenantId);
    if (!reserved) {
      return err(new Error("Concurrent capture request for same idempotency key"));
    }

    const result = await this.gateway.capturePayment(cmd);
    if (isErr(result)) {
      return result;
    }

    await this.idempotency.complete(cmd.idempotencyKey, cmd.tenantId, result.value);
    await this.outbox.publish({
      tenantId: cmd.tenantId,
      aggregateType: "Payment",
      aggregateId: result.value.paymentId,
      eventType: "payment.captured",
      payload: { status: result.value.status, amount: String(result.value.amount.amount) },
    });

    return result;
  }

  async refundPayment(cmd: RefundPaymentCommand): Promise<Result<PaymentRecord>> {
    const existing = await this.idempotency.get(cmd.idempotencyKey, cmd.tenantId);
    if (existing?.status === "completed" && existing.response) {
      return ok(existing.response as PaymentRecord);
    }

    const reserved = await this.idempotency.reserve(cmd.idempotencyKey, cmd.tenantId);
    if (!reserved) {
      return err(new Error("Concurrent refund request for same idempotency key"));
    }

    const result = await this.gateway.refundPayment(cmd);
    if (isErr(result)) {
      return result;
    }

    await this.idempotency.complete(cmd.idempotencyKey, cmd.tenantId, result.value);
    await this.outbox.publish({
      tenantId: cmd.tenantId,
      aggregateType: "Payment",
      aggregateId: result.value.paymentId,
      eventType: "payment.refunded",
      payload: { status: result.value.status, amount: String(result.value.amount.amount) },
    });

    return result;
  }
}
