import type {
  CapturePaymentCommand,
  InitiatePaymentCommand,
  PaymentGatewayPort,
  PaymentIntent,
  PaymentRecord,
  RefundPaymentCommand,
} from "@opencheckout/core";
import { type PaymentId, type TenantId, err, ok } from "@opencheckout/core";
import type { Result } from "@opencheckout/core";
import { tossStatusToPaymentStatus } from "./toss-acl.js";

export type TossPaymentClientConfig = {
  readonly secretKey: string;
  readonly baseUrl?: string;
};

const DEFAULT_BASE_URL = "https://api.tosspayments.com/v1";

export class TossPaymentClient implements PaymentGatewayPort {
  readonly #secretKey: string;
  readonly #baseUrl: string;

  constructor(config: TossPaymentClientConfig) {
    this.#secretKey = config.secretKey;
    this.#baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  #authHeader(): string {
    return `Basic ${Buffer.from(`${this.#secretKey}:`).toString("base64")}`;
  }

  async #post<T>(path: string, body: unknown): Promise<Result<T>> {
    try {
      const res = await fetch(`${this.#baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: this.#authHeader(),
          "Content-Type": "application/json",
          "Idempotency-Key": (body as Record<string, string>).idempotencyKey ?? "",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        return err(new Error(`Toss API ${path} failed: ${res.status} ${JSON.stringify(detail)}`));
      }
      return ok((await res.json()) as T);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async #get<T>(path: string): Promise<Result<T>> {
    try {
      const res = await fetch(`${this.#baseUrl}${path}`, {
        headers: { Authorization: this.#authHeader() },
      });
      if (!res.ok) {
        return err(new Error(`Toss API GET ${path} failed: ${res.status}`));
      }
      return ok((await res.json()) as T);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async initiatePayment(cmd: InitiatePaymentCommand): Promise<Result<PaymentIntent>> {
    const result = await this.#post<{
      paymentKey: string;
      checkoutPage: string;
      expiredAt: string;
    }>("/payments", {
      amount: Number(cmd.amount.amount),
      currency: cmd.amount.currency,
      orderId: cmd.orderId,
      orderName: `Order ${cmd.orderId}`,
      successUrl: cmd.returnUrl,
      failUrl: cmd.returnUrl,
      customerEmail: cmd.customerEmail,
      idempotencyKey: cmd.idempotencyKey,
    });
    if (!result.ok) return result;
    return ok({
      paymentId: cmd.idempotencyKey as unknown as PaymentId,
      providerPaymentKey: result.value.paymentKey,
      checkoutUrl: result.value.checkoutPage,
      expiresAt: new Date(result.value.expiredAt),
    });
  }

  async capturePayment(cmd: CapturePaymentCommand): Promise<Result<PaymentRecord>> {
    const result = await this.#post<{
      paymentKey: string;
      status: string;
      totalAmount: number;
      currency: string;
      approvedAt: string;
    }>(`/payments/${cmd.paymentId}/confirm`, { idempotencyKey: cmd.idempotencyKey });
    if (!result.ok) return result;
    const status = tossStatusToPaymentStatus(result.value.status);
    if (!status) return err(new Error(`Unknown Toss status: ${result.value.status}`));
    return ok({
      paymentId: cmd.paymentId,
      orderId: "" as unknown as ReturnType<typeof cmd.paymentId.toString>,
      tenantId: cmd.tenantId,
      status,
      amount: { amount: BigInt(result.value.totalAmount), currency: result.value.currency },
      providerPaymentKey: result.value.paymentKey,
      createdAt: new Date(result.value.approvedAt),
      updatedAt: new Date(result.value.approvedAt),
    } as unknown as PaymentRecord);
  }

  async refundPayment(cmd: RefundPaymentCommand): Promise<Result<PaymentRecord>> {
    const result = await this.#post<{
      paymentKey: string;
      status: string;
      totalAmount: number;
      currency: string;
      requestedAt: string;
    }>(`/payments/${cmd.paymentId}/cancel`, {
      cancelReason: cmd.reason,
      cancelAmount: Number(cmd.amount.amount),
      idempotencyKey: cmd.idempotencyKey,
    });
    if (!result.ok) return result;
    const status = tossStatusToPaymentStatus(result.value.status);
    if (!status) return err(new Error(`Unknown Toss status: ${result.value.status}`));
    return ok({
      paymentId: cmd.paymentId,
      orderId: "" as unknown as ReturnType<typeof cmd.paymentId.toString>,
      tenantId: cmd.tenantId,
      status,
      amount: { amount: BigInt(result.value.totalAmount), currency: result.value.currency },
      providerPaymentKey: result.value.paymentKey,
      createdAt: new Date(result.value.requestedAt),
      updatedAt: new Date(result.value.requestedAt),
    } as unknown as PaymentRecord);
  }

  async getPayment(tenantId: TenantId, paymentId: PaymentId): Promise<Result<PaymentRecord>> {
    void tenantId;
    const result = await this.#get<{
      paymentKey: string;
      status: string;
      totalAmount: number;
      currency: string;
      requestedAt: string;
      orderId: string;
    }>(`/payments/${paymentId}`);
    if (!result.ok) return result;
    const status = tossStatusToPaymentStatus(result.value.status);
    if (!status) return err(new Error(`Unknown Toss status: ${result.value.status}`));
    return ok({
      paymentId,
      orderId: result.value.orderId,
      tenantId,
      status,
      amount: { amount: BigInt(result.value.totalAmount), currency: result.value.currency },
      providerPaymentKey: result.value.paymentKey,
      createdAt: new Date(result.value.requestedAt),
      updatedAt: new Date(result.value.requestedAt),
    } as unknown as PaymentRecord);
  }
}
