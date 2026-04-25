import type { Money } from "../../internal/validate.js";

export type PaymentLabels = {
  eyebrow: string;
  title: string;
  installment: string;
  bank: string;
  transferNote: string;
  easyPay: string;
  country: string;
  countryUnknown: string;
};

export function buildPaymentLabels(locale: string): PaymentLabels {
  return locale === "en"
    ? {
        eyebrow: "PAYMENT",
        title: "Payment method",
        installment: "Installments",
        bank: "Bank",
        transferNote: "A virtual bank account will be issued after payment.",
        easyPay: "Easy pay",
        country: "Issuing country",
        countryUnknown: "Select country in the address widget",
      }
    : {
        eyebrow: "결제",
        title: "결제 수단",
        installment: "할부 개월수",
        bank: "은행",
        transferNote: "결제 후 가상 계좌가 발급됩니다.",
        easyPay: "간편결제 브랜드",
        country: "발급 국가",
        countryUnknown: "주소 위젯에서 국가를 선택하세요",
      };
}

export function formatMoney(amount: Money | undefined, locale: string): string {
  if (!amount) return "";
  const intlLocale =
    locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : locale === "zh-CN" ? "zh-CN" : "en-US";
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: amount.currency,
      maximumFractionDigits: amount.currency === "KRW" || amount.currency === "JPY" ? 0 : 2,
    }).format(amount.value);
  } catch {
    return `${amount.value} ${amount.currency}`;
  }
}
