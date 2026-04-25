/**
 * Lazy fetcher for libaddressinput-format country schemas.
 *
 * Fetches at runtime from chromium-i18n.appspot.com (Google's libaddressinput
 * mirror) and converts to our `CountrySchema` shape. Useful for territories
 * not in the inlined catalog. Results are cached per-process.
 *
 * No package is bundled — `fetch` is consumed at call time so that the
 * widget core stays request-free for the 15 baked-in countries.
 */

import { type AddressFieldKey, type CountrySchema, FALLBACK_COUNTRY } from "./address-data.js";
import { assertPanFree } from "./pan-guard.js";

export type LoadCountryOptions = {
  readonly fetcher?: typeof fetch;
  readonly baseUrl?: string;
};

type LibAddressInputRaw = {
  key?: string;
  name?: string;
  fmt?: string;
  lfmt?: string;
  require?: string;
  zip?: string;
  zipex?: string;
  postprefix?: string;
  languages?: string;
  sub_keys?: string;
  sub_names?: string;
};

const DEFAULT_BASE_URL = "https://chromium-i18n.appspot.com/ssl-address";
const cache = new Map<string, CountrySchema | undefined>();

const FMT_TO_FIELD: Readonly<Record<string, AddressFieldKey>> = {
  A: "line1",
  C: "city",
  S: "admin1",
  D: "admin2",
  Z: "postal",
};

const REQUIRE_TO_FIELD: Readonly<Record<string, AddressFieldKey>> = {
  A: "line1",
  C: "city",
  S: "admin1",
  D: "admin2",
  Z: "postal",
};

function parseFields(fmt: string | undefined): readonly AddressFieldKey[] {
  if (!fmt) return ["admin1", "city", "line1", "line2", "postal"];
  const out: AddressFieldKey[] = [];
  const seen = new Set<AddressFieldKey>();
  // libaddressinput tokens look like "%N%n%O%n%A%n%D%n%C, %S %Z"
  const matches = fmt.matchAll(/%([A-Z])/g);
  for (const match of matches) {
    const tok = match[1];
    if (!tok) continue;
    const f = FMT_TO_FIELD[tok];
    if (f && !seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  if (seen.has("line1") && !seen.has("line2")) out.push("line2");
  return out;
}

function parseRequired(req: string | undefined): readonly AddressFieldKey[] {
  if (!req) return ["line1"];
  const out: AddressFieldKey[] = [];
  const seen = new Set<AddressFieldKey>();
  for (const ch of req) {
    const f = REQUIRE_TO_FIELD[ch];
    if (f && !seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out.length ? out : ["line1"];
}

function convert(code: string, raw: LibAddressInputRaw): CountrySchema {
  const fields = parseFields(raw.fmt ?? raw.lfmt);
  const required = parseRequired(raw.require);
  const schema: CountrySchema = {
    code: code.toUpperCase(),
    nameEn: raw.name ?? code,
    nameKo: raw.name ?? code,
    aliases: [code, raw.name ?? code].filter((v) => v && v.length > 0),
    fields,
    required,
    ...(raw.zip ? { postalRegex: `^${raw.zip}$` } : {}),
    ...(raw.zipex ? { postalPlaceholder: raw.zipex.split(",")[0]?.trim() ?? "" } : {}),
  };
  return schema;
}

export async function loadCountrySchema(
  code: string,
  opts: LoadCountryOptions = {},
): Promise<CountrySchema | undefined> {
  if (!code) return undefined;
  const upper = code.toUpperCase();
  if (cache.has(upper)) return cache.get(upper);
  const fetcher = opts.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== "function") {
    cache.set(upper, undefined);
    return undefined;
  }
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  try {
    const res = await fetcher(`${baseUrl}/data/${upper}`);
    if (!res || !res.ok) {
      cache.set(upper, undefined);
      return undefined;
    }
    const raw = (await res.json()) as LibAddressInputRaw;
    const schema = convert(upper, raw);
    assertPanFree(schema);
    cache.set(upper, schema);
    return schema;
  } catch {
    cache.set(upper, undefined);
    return undefined;
  }
}

/** Returns a baked-in or previously fetched schema, or FALLBACK_COUNTRY. */
export function getCachedSchema(code: string): CountrySchema {
  return cache.get(code.toUpperCase()) ?? FALLBACK_COUNTRY;
}

/** @internal Test-only — clears the lazy fetch cache. */
export function _clearCountrySchemaCache(): void {
  cache.clear();
}
