/**
 * Country-aware printable address formatter.
 *
 * Self-authored templates per locale convention. No external dataset
 * (e.g. opencagedata/address-formatting) is copied — the rules below are
 * paraphrased from postal authority guidance and ISO 19160-4 examples.
 *
 * Output is a label intended for human display (receipts, confirmation
 * screens). It is NOT canonical machine input — for that, prefer the
 * structured fields on `AddressSelection`.
 */

import type { AddressSelection } from "./state.js";

export type FormatAddressOptions = {
  /** "ko" produces Korean labels for KR; "en" prefers Romanised order. */
  readonly locale?: "ko" | "en";
  /** When false, joins the multiline output with ", ". */
  readonly multiline?: boolean;
};

type Parts = {
  line1: string | undefined;
  line2: string | undefined;
  city: string | undefined;
  admin1: string | undefined;
  admin2: string | undefined;
  postal: string | undefined;
  country: string | undefined;
};

function pick(addr: AddressSelection): Parts {
  return {
    line1: addr.line1 || undefined,
    line2: addr.line2 || undefined,
    city: addr.city || undefined,
    admin1: addr.admin1 || undefined,
    admin2: addr.admin2 || undefined,
    postal: addr.postal || undefined,
    country: addr.country || undefined,
  };
}

function joinSpace(...vals: ReadonlyArray<string | undefined>): string {
  return vals.filter((v) => v && v.length > 0).join(" ");
}

function joinTight(...vals: ReadonlyArray<string | undefined>): string {
  return vals.filter((v) => v && v.length > 0).join("");
}

function formatKR(p: Parts, locale: "ko" | "en"): string[] {
  if (locale === "ko") {
    const head = p.postal ? `우편번호 ${p.postal}` : "";
    const body = joinSpace(p.city, p.admin1, p.admin2, p.line1, p.line2);
    return [head, body].filter((s) => s.length > 0);
  }
  return [
    joinSpace(p.line1, p.line2),
    joinSpace(p.admin2, p.city),
    joinSpace(p.admin1, p.postal),
    "South Korea",
  ].filter((s) => s.length > 0);
}

function formatJP(p: Parts): string[] {
  const head = p.postal ? `〒${p.postal}` : "";
  const body = joinTight(p.admin1, p.city, p.admin2);
  const street = joinSpace(p.line1, p.line2);
  return [head, joinSpace(body, street)].filter((s) => s.length > 0);
}

function formatCN(p: Parts): string[] {
  const region = joinTight(p.admin1, p.city, p.admin2);
  const street = joinSpace(p.line1, p.line2);
  return [joinSpace(region, street, p.postal)].filter((s) => s.length > 0);
}

function formatHK(p: Parts): string[] {
  return [p.line1, p.line2, p.admin2, "Hong Kong"].filter((v): v is string =>
    Boolean(v && v.length > 0),
  );
}

function formatSG(p: Parts): string[] {
  const tail = p.postal ? `Singapore ${p.postal}` : "Singapore";
  return [p.line1, p.line2, tail].filter((v): v is string => Boolean(v && v.length > 0));
}

function formatUSLike(p: Parts, country: string): string[] {
  const cityLine = joinSpace(p.city ? `${p.city},` : undefined, p.admin1, p.postal).replace(
    /,\s*$/,
    "",
  );
  return [p.line1, p.line2, cityLine, country].filter((v): v is string =>
    Boolean(v && v.length > 0),
  );
}

const COUNTRY_NAME_EN: Readonly<Record<string, string>> = {
  KR: "South Korea",
  JP: "Japan",
  CN: "China",
  HK: "Hong Kong",
  SG: "Singapore",
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  NZ: "New Zealand",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  TW: "Taiwan",
  BR: "Brazil",
};

export function formatAddress(addr: AddressSelection, opts: FormatAddressOptions = {}): string {
  const locale: "ko" | "en" = opts.locale === "ko" ? "ko" : "en";
  const multiline = opts.multiline !== false;
  const parts = pick(addr);
  const code = (addr.country ?? "").toUpperCase();
  const countryName = COUNTRY_NAME_EN[code] ?? code;

  let lines: string[];
  switch (code) {
    case "KR":
      lines = formatKR(parts, locale);
      break;
    case "JP":
      lines = formatJP(parts);
      break;
    case "CN":
      lines = formatCN(parts);
      break;
    case "HK":
      lines = formatHK(parts);
      break;
    case "SG":
      lines = formatSG(parts);
      break;
    case "US":
      lines = formatUSLike(parts, countryName);
      break;
    default:
      lines = formatUSLike(parts, countryName);
  }
  return (multiline ? lines.join("\n") : lines.join(", ")).trim();
}
