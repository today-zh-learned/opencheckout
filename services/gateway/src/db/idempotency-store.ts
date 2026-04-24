import type { IdempotencyStore } from "@opencheckout/payments";
import { getSql } from "./pool.js";

type JsonValue = Parameters<ReturnType<typeof getSql>["json"]>[0];

/**
 * Postgres-backed idempotency store (ADR-002 §4, ADR-013 §10).
 * Uses INSERT ... ON CONFLICT DO NOTHING for race-free reservation.
 */
export class PostgresIdempotencyStore implements IdempotencyStore {
  async get(
    key: string,
    tenantId: string,
  ): Promise<{ status: "pending" | "completed"; response?: unknown } | undefined> {
    const sql = getSql();
    const rows = await sql<{ status: string; response: unknown }[]>`
      SELECT status, response FROM idempotency_keys
       WHERE key = ${key} AND tenant_id = ${tenantId}
         AND expires_at > now()
       LIMIT 1
    `;
    const row = rows[0];
    if (!row) return undefined;
    return {
      status: row.status as "pending" | "completed",
      ...(row.response !== null && row.response !== undefined ? { response: row.response } : {}),
    };
  }

  async reserve(key: string, tenantId: string): Promise<boolean> {
    const sql = getSql();
    const rows = await sql<{ key: string }[]>`
      INSERT INTO idempotency_keys (key, tenant_id, status)
      VALUES (${key}, ${tenantId}, 'pending')
      ON CONFLICT (key, tenant_id) DO NOTHING
      RETURNING key
    `;
    return rows.length === 1;
  }

  async complete(key: string, tenantId: string, response: unknown): Promise<void> {
    const sql = getSql();
    await sql`
      UPDATE idempotency_keys
         SET status = 'completed', response = ${sql.json(response as JsonValue)}
       WHERE key = ${key} AND tenant_id = ${tenantId}
    `;
  }
}
