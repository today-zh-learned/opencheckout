export type { AddressCandidate, AddressQuery, AddressLookupPort } from "@opencheckout/core";

export type AddressCanonicalRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly roadAddress: string;
  readonly jibunAddress?: string;
  readonly zipCode: string;
  readonly city: string;
  readonly province: string;
  readonly countryCode: string;
  readonly extraInfo?: string;
  readonly version: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AddressDisplayDTO = {
  readonly id: string;
  readonly formatted: string;
  readonly zipCode: string;
  readonly countryCode: string;
};

export function formatAddressDisplay(record: AddressCanonicalRecord): AddressDisplayDTO {
  const parts = [record.province, record.city, record.roadAddress, record.extraInfo].filter(
    Boolean,
  );
  return {
    id: record.id,
    formatted: parts.join(" "),
    zipCode: record.zipCode,
    countryCode: record.countryCode,
  };
}
