import type { TossWebhookPayload, TossWebhookTransitionPolicy } from "@opencheckout/adapter-toss";
import { type PaymentStatus, asTenantId, parsePaymentStatus } from "@opencheckout/core";
import { Hono } from "hono";
import type { PostgresOutbox } from "../db/outbox.js";
import { getSql } from "../db/pool.js";

export function webhookRoutes(policy: TossWebhookTransitionPolicy, outbox: PostgresOutbox): Hono {
  const app = new Hono();

  app.post("/v1/webhooks/toss", async (c) => {
    const body = (await c.req.json().catch(() => null)) as TossWebhookPayload | null;
    if (!body?.data?.paymentKey) {
      return c.json({ type: "invalid-payload", title: "Invalid Toss webhook", status: 400 }, 400);
    }

    const sql = getSql();
    const rows = await sql<{ id: string; tenant_id: string; status: string }[]>`
      SELECT id, tenant_id, status FROM payments
       WHERE provider_payment_key = ${body.data.paymentKey}
       FOR UPDATE NOWAIT
    `;
    const payment = rows[0];
    if (!payment) {
      return c.json({ type: "payment-not-found", title: "Unknown paymentKey", status: 404 }, 404);
    }

    const currentStatus = parsePaymentStatus(payment.status);
    if (!currentStatus) {
      return c.json({ type: "invalid-status", title: "Corrupt payment state", status: 500 }, 500);
    }

    const decision = policy.evaluate(currentStatus, body);
    if (!decision.allowed) {
      return c.json({ acknowledged: true, applied: false, reason: decision.reason }, 200);
    }

    await sql`
      UPDATE payments SET status = ${decision.to satisfies PaymentStatus}, updated_at = now()
       WHERE id = ${payment.id}
    `;
    await outbox.publish({
      tenantId: asTenantId(payment.tenant_id),
      aggregateType: "Payment",
      aggregateId: payment.id,
      eventType: `payment.${decision.to}`,
      payload: { from: decision.from, to: decision.to, paymentKey: body.data.paymentKey },
    });

    return c.json({ acknowledged: true, applied: true, from: decision.from, to: decision.to }, 200);
  });

  return app;
}
