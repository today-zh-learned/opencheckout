import type { TenantId } from "../types/branded.js";
import type { Result } from "../types/result.js";

export type AddressQuery = {
  readonly keyword: string;
  readonly countryCode: string;
  readonly page?: number;
};

export type AddressCandidate = {
  readonly roadAddress: string;
  readonly jibunAddress?: string;
  readonly zipCode: string;
  readonly city: string;
  readonly province: string;
  readonly countryCode: string;
  readonly extraInfo?: string;
};

/** Port — implemented by adapter-juso (KR) and future adapters */
export interface AddressLookupPort {
  search(tenantId: TenantId, query: AddressQuery): Promise<Result<AddressCandidate[]>>;
  validate(tenantId: TenantId, address: AddressCandidate): Promise<Result<boolean>>;
}
