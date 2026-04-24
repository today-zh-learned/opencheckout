import type { TenantId } from "../types/branded.js";

export type OutboxEvent = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
};

/** Port — implemented by postgres outbox dispatcher (TDD-02) */
export interface OutboxPort {
  publish(event: Omit<OutboxEvent, "id" | "createdAt">): Promise<void>;
}
