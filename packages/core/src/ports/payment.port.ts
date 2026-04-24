import type { PaymentStatus } from "../domain/payment-status.js";
import type { IdempotencyKey, OrderId, PaymentId, TenantId } from "../types/branded.js";
import type { Money } from "../types/money.js";
import type { Result } from "../types/result.js";

export type InitiatePaymentCommand = {
  readonly tenantId: TenantId;
  readonly orderId: OrderId;
  readonly amount: Money;
  readonly idempotencyKey: IdempotencyKey;
  readonly returnUrl: string;
  readonly customerEmail: string;
};

export type PaymentIntent = {
  readonly paymentId: PaymentId;
  readonly providerPaymentKey: string;
  readonly checkoutUrl: string;
  readonly expiresAt: Date;
};

export type PaymentRecord = {
  readonly paymentId: PaymentId;
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly status: PaymentStatus;
  readonly amount: Money;
  readonly providerPaymentKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CapturePaymentCommand = {
  readonly tenantId: TenantId;
  readonly paymentId: PaymentId;
  readonly idempotencyKey: IdempotencyKey;
};

export type RefundPaymentCommand = {
  readonly tenantId: TenantId;
  readonly paymentId: PaymentId;
  readonly amount: Money;
  readonly reason: string;
  readonly idempotencyKey: IdempotencyKey;
};

/** Port — implemented by adapter-toss and future adapters */
export interface PaymentGatewayPort {
  initiatePayment(cmd: InitiatePaymentCommand): Promise<Result<PaymentIntent>>;
  capturePayment(cmd: CapturePaymentCommand): Promise<Result<PaymentRecord>>;
  refundPayment(cmd: RefundPaymentCommand): Promise<Result<PaymentRecord>>;
  getPayment(tenantId: TenantId, paymentId: PaymentId): Promise<Result<PaymentRecord>>;
}
