import {
  COUNTRIES,
  type CountrySchema,
  searchCountries,
} from "../../internal/address-data.js";
import { h } from "../../internal/preact-runtime.js";

export type CountryComboProps = {
  schema: CountrySchema;
  countryOpen: boolean;
  countryQuery: string;
  countryActiveIdx: number;
  countryLabel: string;
  locale: "ko" | "en";
  onFocus: () => void;
  onBlur: () => void;
  onInput: (value: string) => void;
  onKeyDown: (ev: KeyboardEvent) => void;
  onSelect: (code: string) => void;
};

export function renderCountryCombo(props: CountryComboProps) {
  const {
    schema,
    countryOpen,
    countryQuery,
    countryActiveIdx,
    countryLabel,
    locale,
    onFocus,
    onBlur,
    onInput,
    onKeyDown,
    onSelect,
  } = props;

  const filtered = countryOpen ? searchCountries(countryQuery, locale) : COUNTRIES;
  const safeIdx = Math.min(countryActiveIdx, Math.max(0, filtered.length - 1));
  const inputValue = countryOpen ? countryQuery : locale === "ko" ? schema.nameKo : schema.nameEn;
  const activeOptionId =
    countryOpen && filtered.length > 0
      ? `oc-country-${safeIdx}-${(filtered[safeIdx]?.code ?? "").toLowerCase()}`
      : "";

  return h(
    "div",
    { class: "oc-field" },
    h("label", { class: "oc-label" }, countryLabel),
    h(
      "div",
      { class: "oc-combo" },
      h("input", {
        class: "oc-input",
        type: "text",
        role: "combobox",
        "aria-expanded": countryOpen ? "true" : "false",
        "aria-autocomplete": "list",
        "aria-activedescendant": activeOptionId,
        autocomplete: "off",
        value: inputValue,
        onFocus,
        onBlur,
        onInput: (ev: Event) => onInput((ev.target as HTMLInputElement).value),
        onKeyDown,
      }),
      countryOpen && filtered.length > 0
        ? h(
            "ul",
            { class: "oc-combo-list", role: "listbox" },
            filtered.map((c, i) =>
              h(
                "li",
                {
                  id: `oc-country-${i}-${c.code.toLowerCase()}`,
                  class: "oc-combo-item",
                  role: "option",
                  "aria-selected": i === safeIdx ? "true" : "false",
                  key: c.code,
                  onMouseDown: (ev: Event) => {
                    ev.preventDefault();
                    onSelect(c.code);
                  },
                },
                locale === "ko" ? c.nameKo : c.nameEn,
                h("span", { class: "oc-combo-item-sub" }, c.code),
              ),
            ),
          )
        : null,
    ),
  );
}
