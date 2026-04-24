import { asTenantId, isOk } from "@opencheckout/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JusoClient } from "./juso-client.js";

const tenantId = asTenantId("tenant_1");

describe("JusoClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-KR address searches before calling the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const client = new JusoClient({ apiKey: "test" });
    const result = await client.search(tenantId, { keyword: "Tokyo", countryCode: "JP" });

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps Juso API rows into canonical address candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: {
            common: {
              totalCount: "1",
              currentPage: "1",
              countPerPage: "10",
              errorCode: "0",
              errorMessage: "정상",
            },
            juso: [
              {
                roadAddr: "서울특별시 강남구 테헤란로 123",
                jibunAddr: "서울특별시 강남구 역삼동 1",
                zipNo: "06236",
                siNm: "서울특별시",
                sggNm: "강남구",
                emdNm: "역삼동",
                detBdNmList: "OpenCheckout Tower",
              },
            ],
          },
        }),
      })),
    );

    const client = new JusoClient({ apiKey: "test", baseUrl: "https://juso.test/search" });
    const result = await client.search(tenantId, { keyword: "테헤란로", countryCode: "KR" });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([
        {
          roadAddress: "서울특별시 강남구 테헤란로 123",
          jibunAddress: "서울특별시 강남구 역삼동 1",
          zipCode: "06236",
          city: "강남구",
          province: "서울특별시",
          countryCode: "KR",
          extraInfo: "역삼동 OpenCheckout Tower",
        },
      ]);
    }
  });

  it("validates KR postal code shape", async () => {
    const client = new JusoClient({ apiKey: "test" });

    await expect(
      client.validate(tenantId, {
        roadAddress: "서울특별시 강남구 테헤란로 123",
        zipCode: "06236",
        city: "강남구",
        province: "서울특별시",
        countryCode: "KR",
      }),
    ).resolves.toEqual({ ok: true, value: true });
  });
});
