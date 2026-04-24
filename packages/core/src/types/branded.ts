declare const __brand: unique symbol;
export type Brand<T, B> = T & { readonly [__brand]: B };

export type TenantId = Brand<string, "TenantId">;
export type OrderId = Brand<string, "OrderId">;
export type PaymentId = Brand<string, "PaymentId">;
export type AddressId = Brand<string, "AddressId">;
export type IdempotencyKey = Brand<string, "IdempotencyKey">;
export type UserId = Brand<string, "UserId">;
export type ShipmentId = Brand<string, "ShipmentId">;

export function asTenantId(s: string): TenantId {
  return s as TenantId;
}
export function asOrderId(s: string): OrderId {
  return s as OrderId;
}
export function asPaymentId(s: string): PaymentId {
  return s as PaymentId;
}
export function asAddressId(s: string): AddressId {
  return s as AddressId;
}
export function asIdempotencyKey(s: string): IdempotencyKey {
  return s as IdempotencyKey;
}
export function asUserId(s: string): UserId {
  return s as UserId;
}
export function asShipmentId(s: string): ShipmentId {
  return s as ShipmentId;
}
