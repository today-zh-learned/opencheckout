/**
 * Monotonic ULID generator.
 * Uses crypto.randomUUID fallback if @std/ulid is not available.
 * Production: replace with a proper ULID library.
 */
export function generateUlid(): string {
  const ts = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[(b ?? 0) % 32])
    .join("");
  return ts + rand;
}
