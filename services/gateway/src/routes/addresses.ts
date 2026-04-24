import type { AddressLookupPort, TenantId } from "@opencheckout/core";
import { isOk } from "@opencheckout/core";
import { Hono } from "hono";
import { z } from "zod";

const AddressSearchSchema = z.object({
  keyword: z.string().min(2),
  countryCode: z.string().length(2).default("KR"),
  page: z.coerce.number().int().min(1).max(50).optional(),
});

export function addressRoutes(lookup: AddressLookupPort): Hono {
  const app = new Hono();

  app.get("/v1/addresses/search", async (c) => {
    const tenantId = c.get("tenantId") as TenantId;
    const parsed = AddressSearchSchema.safeParse({
      keyword: c.req.query("keyword"),
      countryCode: c.req.query("countryCode") ?? "KR",
      page: c.req.query("page"),
    });
    if (!parsed.success) {
      return c.json(
        {
          type: "https://opencheckout.dev/errors/validation",
          title: "Invalid query",
          status: 400,
          errors: parsed.error.issues,
        },
        400,
      );
    }

    const query = parsed.data.page
      ? {
          keyword: parsed.data.keyword,
          countryCode: parsed.data.countryCode,
          page: parsed.data.page,
        }
      : { keyword: parsed.data.keyword, countryCode: parsed.data.countryCode };

    const result = await lookup.search(tenantId, query);
    if (!isOk(result)) {
      return c.json(
        {
          type: "https://opencheckout.dev/errors/address-search",
          title: "Address lookup failed",
          status: 502,
          detail: result.error.message,
        },
        502,
      );
    }

    return c.json({ candidates: result.value, count: result.value.length });
  });

  return app;
}
