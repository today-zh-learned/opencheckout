/**
 * Payment-method catalog for the OpenCheckout payment widget.
 *
 * Visibility rules per ADR-003 PAN boundary:
 *   - These descriptors carry only metadata used for tile rendering.
 *   - No card number, CVC, expiry, holder name, or any PCI-scoped data here.
 *   - Card data entry is hosted by the gateway adapter on a separate origin.
 */

export type PaymentMethodScope = "kr" | "intl" | "all";

export type PaymentMethodDescriptor = {
  readonly code: string;
  readonly labelKo: string;
  readonly labelEn: string;
  /** Inline 16x16 SVG path data, drawn with currentColor. Self-designed; no external icon set. */
  readonly iconPath: string;
  /** Country scope. "kr" = Korea only, "intl" = international only, "all" = both. */
  readonly scope: PaymentMethodScope;
};

export const PAYMENT_METHOD_CATALOG: readonly PaymentMethodDescriptor[] = [
  {
    code: "card",
    labelKo: "카드",
    labelEn: "Card",
    iconPath: "M2 5h12v6H2zM2 5v1.5h12V5M3.5 8.5h3M3.5 9.75h2",
    scope: "all",
  },
  {
    code: "transfer",
    labelKo: "계좌이체",
    labelEn: "Bank transfer",
    iconPath: "M2 6.5l6-3.5 6 3.5M3 6.5v5M13 6.5v5M5.5 6.5v5M10.5 6.5v5M2 12h12",
    scope: "kr",
  },
  {
    code: "virtual-account",
    labelKo: "가상계좌",
    labelEn: "Virtual account",
    iconPath: "M2.5 4h11v8h-11zM2.5 6.5h11M5 9h2M5 10.5h4",
    scope: "kr",
  },
  {
    code: "foreign-card",
    labelKo: "해외카드",
    labelEn: "Foreign card",
    iconPath:
      "M8 2a6 6 0 100 12 6 6 0 000-12zM2 8h12M8 2c1.5 1.6 2.4 3.7 2.4 6S9.5 14.4 8 14M8 2c-1.5 1.6-2.4 3.7-2.4 6S6.5 14.4 8 14",
    scope: "intl",
  },
  {
    code: "easy-pay",
    labelKo: "간편결제",
    labelEn: "Easy pay",
    iconPath: "M3 4.5h10v7H3zM3 7h10M5.5 9.5h2M9.5 9.5h1.5",
    scope: "all",
  },
];

const KR_BANKS: readonly {
  readonly code: string;
  readonly nameKo: string;
  readonly nameEn: string;
}[] = [
  { code: "kb", nameKo: "국민은행", nameEn: "KB Kookmin" },
  { code: "shinhan", nameKo: "신한은행", nameEn: "Shinhan" },
  { code: "woori", nameKo: "우리은행", nameEn: "Woori" },
  { code: "hana", nameKo: "하나은행", nameEn: "Hana" },
  { code: "ibk", nameKo: "기업은행", nameEn: "IBK" },
  { code: "nh", nameKo: "농협은행", nameEn: "NongHyup" },
  { code: "sc", nameKo: "SC제일은행", nameEn: "SC First" },
  { code: "kakao", nameKo: "카카오뱅크", nameEn: "Kakao Bank" },
];

export function listKrBanks(): typeof KR_BANKS {
  return KR_BANKS;
}

export const DEFAULT_EASY_PAY_BRANDS: readonly string[] = ["paypal"];

export function easyPayBrandLabel(code: string, locale: string): string {
  const map: Record<string, { ko: string; en: string }> = {
    paypal: { ko: "PayPal", en: "PayPal" },
    other: { ko: "기타", en: "Other" },
  };
  const entry = map[code];
  if (!entry) return code;
  return locale === "en" ? entry.en : entry.ko;
}

export function selectVisibleMethods(
  catalog: readonly PaymentMethodDescriptor[],
  isKorea: boolean,
  whitelist: readonly string[] | undefined,
): readonly PaymentMethodDescriptor[] {
  const allowed = whitelist && whitelist.length > 0 ? new Set(whitelist) : null;
  return catalog.filter((m) => {
    if (allowed && !allowed.has(m.code)) return false;
    if (m.scope === "all") return true;
    if (m.scope === "kr") return isKorea;
    return !isKorea;
  });
}
