import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | undefined;

export function getSql(): ReturnType<typeof postgres> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL env var not set");
  _sql = postgres(url, {
    max: Number(process.env.PG_POOL_MAX ?? 20),
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false, // PgBouncer transaction mode requires this (ADR-013 §9)
    types: { bigint: postgres.BigInt },
    connection: {
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 15_000,
    },
  });
  return _sql;
}

export async function closeSql(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = undefined;
  }
}
