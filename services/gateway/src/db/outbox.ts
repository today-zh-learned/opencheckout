import type { OutboxEvent, OutboxPort } from "@opencheckout/core";
import { getSql } from "./pool.js";

type JsonValue = Parameters<ReturnType<typeof getSql>["json"]>[0];

/**
 * Postgres outbox publisher (TDD-02).
 * Writes to outbox table; dispatcher cron polls with FOR UPDATE SKIP LOCKED (ADR-013 §11).
 */
export class PostgresOutbox implements OutboxPort {
  async publish(event: Omit<OutboxEvent, "id" | "createdAt">): Promise<void> {
    const sql = getSql();
    await sql`
      INSERT INTO outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
      VALUES (
        ${event.tenantId},
        ${event.aggregateType},
        ${event.aggregateId},
        ${event.eventType},
        ${sql.json(event.payload as JsonValue)}
      )
    `;
  }
}
