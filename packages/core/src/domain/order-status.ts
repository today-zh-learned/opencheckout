/**
 * Canonical OrderStatus enum — ADR-001, ADR-013 §2
 */
export const OrderStatus = {
  draft: "draft",
  pending_payment: "pending_payment",
  paid: "paid",
  processing: "processing",
  label_purchased: "label_purchased",
  in_transit: "in_transit",
  delivered: "delivered",
  completed: "completed",
  canceled: "canceled",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_TRANSITIONS: ReadonlyMap<OrderStatus, ReadonlySet<OrderStatus>> = new Map([
  [OrderStatus.draft, new Set([OrderStatus.pending_payment, OrderStatus.canceled])],
  [OrderStatus.pending_payment, new Set([OrderStatus.paid, OrderStatus.canceled])],
  [OrderStatus.paid, new Set([OrderStatus.processing, OrderStatus.canceled])],
  [OrderStatus.processing, new Set([OrderStatus.label_purchased, OrderStatus.canceled])],
  [OrderStatus.label_purchased, new Set([OrderStatus.in_transit])],
  [OrderStatus.in_transit, new Set([OrderStatus.delivered])],
  [OrderStatus.delivered, new Set([OrderStatus.completed])],
  [OrderStatus.completed, new Set()],
  [OrderStatus.canceled, new Set()],
]);

export function isOrderTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS.get(from)?.has(to) ?? false;
}

export function parseOrderStatus(raw: string): OrderStatus | undefined {
  return Object.values(OrderStatus).find((v) => v === raw) as OrderStatus | undefined;
}
