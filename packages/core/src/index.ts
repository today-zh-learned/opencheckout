// Value objects & primitives
export * from "./types/result.js";
export * from "./types/branded.js";
export * from "./types/money.js";
export * from "./types/ulid.js";

// Domain enums & state machines
export * from "./domain/payment-status.js";
export * from "./domain/order-status.js";

// Ports (interfaces only — no implementations)
export type {
  PaymentGatewayPort,
  InitiatePaymentCommand,
  PaymentIntent,
  PaymentRecord,
  CapturePaymentCommand,
  RefundPaymentCommand,
} from "./ports/payment.port.js";
export type { AddressLookupPort, AddressQuery, AddressCandidate } from "./ports/address.port.js";
export type { OutboxPort, OutboxEvent } from "./ports/outbox.port.js";
