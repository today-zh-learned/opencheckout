import type { AddressCandidate, AddressLookupPort, AddressQuery } from "@opencheckout/core";
import { type TenantId, err, ok } from "@opencheckout/core";
import type { Result } from "@opencheckout/core";

export type JusoClientConfig = {
  readonly apiKey: string;
  readonly baseUrl?: string;
};

type JusoApiItem = {
  roadAddr: string;
  jibunAddr: string;
  zipNo: string;
  siNm: string;
  sggNm: string;
  emdNm: string;
  detBdNmList: string;
};

type JusoApiResponse = {
  results: {
    common: {
      totalCount: string;
      currentPage: string;
      countPerPage: string;
      errorCode: string;
      errorMessage: string;
    };
    juso: JusoApiItem[] | null;
  };
};

const DEFAULT_BASE_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do";

export class JusoClient implements AddressLookupPort {
  readonly #apiKey: string;
  readonly #baseUrl: string;

  constructor(config: JusoClientConfig) {
    this.#apiKey = config.apiKey;
    this.#baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async search(_tenantId: TenantId, query: AddressQuery): Promise<Result<AddressCandidate[]>> {
    if (query.countryCode !== "KR") {
      return err(new Error("JusoClient only supports KR addresses"));
    }
    const params = new URLSearchParams({
      confmKey: this.#apiKey,
      currentPage: String(query.page ?? 1),
      countPerPage: "10",
      keyword: query.keyword,
      resultType: "json",
    });
    try {
      const res = await fetch(`${this.#baseUrl}?${params}`);
      if (!res.ok) return err(new Error(`Juso API failed: ${res.status}`));
      const data = (await res.json()) as JusoApiResponse;
      if (data.results.common.errorCode !== "0") {
        return err(
          new Error(
            `Juso error ${data.results.common.errorCode}: ${data.results.common.errorMessage}`,
          ),
        );
      }
      const candidates: AddressCandidate[] = (data.results.juso ?? []).map((item) => {
        const extraInfo = [item.emdNm, item.detBdNmList].filter(Boolean).join(" ") || undefined;
        return {
          roadAddress: item.roadAddr,
          jibunAddress: item.jibunAddr,
          zipCode: item.zipNo,
          city: item.sggNm ?? item.siNm ?? "",
          province: item.siNm ?? "",
          countryCode: "KR" as const,
          ...(extraInfo !== undefined ? { extraInfo } : {}),
        };
      });
      return ok(candidates);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async validate(_tenantId: TenantId, address: AddressCandidate): Promise<Result<boolean>> {
    return ok(address.zipCode.length === 5 && address.countryCode === "KR");
  }
}
