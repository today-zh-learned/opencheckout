import type { TenantId } from "@opencheckout/core";
import { asIdempotencyKey, asOrderId, isOk } from "@opencheckout/core";
import type { PaymentOrchestrator } from "@opencheckout/payments";
import { Hono } from "hono";
import { z } from "zod";

const InitiatePaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.object({
    value: z.string().regex(/^\d+$/, "amount.value must be integer minor units"),
    currency: z.string().length(3),
  }),
  returnUrl: z.string().url(),
  customerEmail: z.string().email(),
});

export function paymentsRoutes(orchestrator: PaymentOrchestrator): Hono {
  const app = new Hono();

  app.post("/v1/payments/intents", async (c) => {
    const tenantId = c.get("tenantId") as TenantId;
    const idempotencyKey = c.get("idempotencyKey");
    if (!idempotencyKey) {
      return c.json(
        {
          type: "https://opencheckout.dev/errors/missing-idempotency-key",
          title: "Idempotency-Key header required",
          status: 400,
        },
        400,
      );
    }

    const body = await c.req.json().catch(() => null);
    const parsed = InitiatePaymentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          type: "https://opencheckout.dev/errors/validation",
          title: "Invalid request body",
          status: 400,
          errors: parsed.error.issues,
        },
        400,
      );
    }

    const { orderId, amount, returnUrl, customerEmail } = parsed.data;
    const result = await orchestrator.initiatePayment({
      tenantId,
      orderId: asOrderId(orderId),
      amount: { amount: BigInt(amount.value), currency: amount.currency },
      idempotencyKey: asIdempotencyKey(idempotencyKey),
      returnUrl,
      customerEmail,
    });

    if (!isOk(result)) {
      return c.json(
        {
          type: "https://opencheckout.dev/errors/payment-initiation",
          title: "Payment initiation failed",
          status: 502,
          detail: result.error.message,
        },
        502,
      );
    }

    return c.json(
      {
        paymentId: result.value.paymentId,
        checkoutUrl: result.value.checkoutUrl,
        expiresAt: result.value.expiresAt.toISOString(),
      },
      201,
    );
  });

  return app;
}
