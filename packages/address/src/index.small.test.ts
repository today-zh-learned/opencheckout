import { describe, expect, it } from "vitest";
import { type AddressCanonicalRecord, formatAddressDisplay } from "./index.js";

function makeAddress(overrides: Partial<AddressCanonicalRecord> = {}): AddressCanonicalRecord {
  const now = new Date("2026-04-24T12:00:00.000Z");
  return {
    id: "addr_1",
    tenantId: "tenant_1",
    roadAddress: "Teheran-ro 123",
    zipCode: "06236",
    city: "Gangnam-gu",
    province: "Seoul",
    countryCode: "KR",
    version: 1n,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("formatAddressDisplay", () => {
  it("projects canonical address fields into a display DTO", () => {
    expect(formatAddressDisplay(makeAddress({ extraInfo: "4F 401" }))).toEqual({
      id: "addr_1",
      formatted: "Seoul Gangnam-gu Teheran-ro 123 4F 401",
      zipCode: "06236",
      countryCode: "KR",
    });
  });

  it("omits empty optional display segments", () => {
    expect(formatAddressDisplay(makeAddress()).formatted).toBe("Seoul Gangnam-gu Teheran-ro 123");
  });
});
