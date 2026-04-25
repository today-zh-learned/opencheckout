import {
  type AddressFieldKey,
  type AdminEntry,
  COUNTRIES,
  type CountrySchema,
  getCountrySchema,
  getFieldLabel,
  isValidPostal,
  searchCountries,
} from "../internal/address-data.js";
import { assertPanFree } from "../internal/pan-guard.js";
import { h } from "../internal/preact-runtime.js";
import { OpenCheckoutShadowElement, defineOnce, resolveTarget } from "../internal/shadow-base.js";
import type { AddressSelection, SessionState } from "../internal/state.js";

export type AddressWidgetEvents = {
  addressSelect: AddressSelection;
};

export type AddressWidget = {
  on<K extends keyof AddressWidgetEvents>(
    event: K,
    cb: (payload: AddressWidgetEvents[K]) => void,
  ): () => void;
  destroy(): void;
};

const TAG = "oc-address";

export class OcAddressElement extends OpenCheckoutShadowElement {}

type FieldValues = {
  admin1Code: string;
  admin1: string;
  admin2Code: string;
  admin2: string;
  city: string;
  line1: string;
  line2: string;
  postal: string;
};

function emptyFields(): FieldValues {
  return {
    admin1Code: "",
    admin1: "",
    admin2Code: "",
    admin2: "",
    city: "",
    line1: "",
    line2: "",
    postal: "",
  };
}

function uiLocale(state: SessionState): "ko" | "en" {
  return state.locale === "ko" ? "ko" : "en";
}

export function mountAddressWidget(
  target: Element | string,
  state: SessionState,
  options: { variantKey?: string } = {},
): AddressWidget {
  defineOnce(TAG, OcAddressElement);
  const host = resolveTarget(target);
  const el = document.createElement(TAG) as OcAddressElement;
  const listeners: Array<(payload: AddressSelection) => void> = [];

  const initial = state.addressSelected;
  let countryCode = initial?.country ?? state.order?.buyerCountry ?? "KR";
  let schema: CountrySchema = getCountrySchema(countryCode);
  let fields: FieldValues = initial
    ? {
        admin1Code: initial.admin1Code ?? "",
        admin1: initial.admin1 ?? "",
        admin2Code: initial.admin2Code ?? "",
        admin2: initial.admin2 ?? "",
        city: initial.city ?? "",
        line1: initial.line1 ?? "",
        line2: initial.line2 ?? "",
        postal: initial.postal ?? initial.zip ?? "",
      }
    : emptyFields();
  let countryQuery = "";
  let countryOpen = false;
  let countryActiveIdx = 0;
  let postalTouched = false;
  let destroyed = false;

  const labels = (): { eyebrow: string; title: string; countryLabel: string } => {
    const locale = uiLocale(state);
    return locale === "en"
      ? { eyebrow: "ADDRESS", title: "Shipping address", countryLabel: "Country" }
      : { eyebrow: "주소", title: "배송 주소", countryLabel: "국가" };
  };

  const buildSnapshot = (): AddressSelection => {
    const cc = schema.code === "ZZ" ? countryCode : schema.code;
    const lines: string[] = [];
    if (fields.line1) lines.push(fields.line1);
    if (fields.line2) lines.push(fields.line2);
    const next: AddressSelection = {
      country: cc,
      ...(fields.admin1 ? { admin1: fields.admin1 } : {}),
      ...(fields.admin1Code ? { admin1Code: fields.admin1Code } : {}),
      ...(fields.admin2 ? { admin2: fields.admin2 } : {}),
      ...(fields.admin2Code ? { admin2Code: fields.admin2Code } : {}),
      ...(fields.city ? { city: fields.city } : {}),
      line1: fields.line1,
      ...(fields.line2 ? { line2: fields.line2 } : {}),
      postal: fields.postal,
      zip: fields.postal,
      // google.type.PostalAddress proto-compatible alias view (additive).
      regionCode: cc,
      languageCode: state.locale,
      ...(fields.postal ? { postalCode: fields.postal } : {}),
      ...(fields.admin1 ? { administrativeArea: fields.admin1 } : {}),
      ...(fields.city ? { locality: fields.city } : {}),
      ...(fields.admin2 ? { sublocality: fields.admin2 } : {}),
      addressLines: lines,
      recipients: [],
    };
    return next;
  };

  const emit = (): void => {
    const next = buildSnapshot();
    assertPanFree(next);
    state.addressSelected = next;
    state.bus.emit("address:change", next);
    for (const cb of listeners) cb(next);
  };

  const setCountry = (code: string): void => {
    countryCode = code;
    schema = getCountrySchema(code);
    fields = emptyFields();
    postalTouched = false;
    countryQuery = "";
    countryOpen = false;
    emit();
    el.rerender();
  };

  const onAdmin1Change = (entryCode: string): void => {
    const entry = schema.admin1?.find((e) => e.code === entryCode);
    if (!entry) {
      fields.admin1Code = "";
      fields.admin1 = "";
      fields.admin2Code = "";
      fields.admin2 = "";
    } else {
      fields.admin1Code = entry.code;
      fields.admin1 = uiLocale(state) === "ko" ? entry.nameLocal : entry.nameEn;
      fields.admin2Code = "";
      fields.admin2 = "";
      // CN-style postal autofill
      const auto = schema.postalAutoFill?.[entry.code];
      if (auto && !fields.postal) {
        fields.postal = auto;
      }
    }
    emit();
    el.rerender();
  };

  const onAdmin2Change = (entryCode: string, source: readonly AdminEntry[] | undefined): void => {
    const entry = source?.find((e) => e.code === entryCode);
    if (!entry) {
      fields.admin2Code = "";
      fields.admin2 = "";
    } else {
      fields.admin2Code = entry.code;
      fields.admin2 = uiLocale(state) === "ko" ? entry.nameLocal : entry.nameEn;
    }
    emit();
    el.rerender();
  };

  const onTextField = (key: keyof FieldValues, value: string): void => {
    fields[key] = value;
    emit();
  };

  const renderCountryCombo = () => {
    const locale = uiLocale(state);
    const filtered = countryOpen ? searchCountries(countryQuery, locale) : COUNTRIES;
    const safeIdx = Math.min(countryActiveIdx, Math.max(0, filtered.length - 1));
    const inputValue = countryOpen ? countryQuery : locale === "ko" ? schema.nameKo : schema.nameEn;
    // Build the active descendant id: points at the highlighted option when open.
    const activeOptionId =
      countryOpen && filtered.length > 0
        ? `oc-country-${safeIdx}-${(filtered[safeIdx]?.code ?? "").toLowerCase()}`
        : "";
    return h(
      "div",
      { class: "oc-field" },
      h("label", { class: "oc-label" }, labels().countryLabel),
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
          onFocus: () => {
            countryOpen = true;
            countryQuery = "";
            countryActiveIdx = 0;
            el.rerender();
          },
          onBlur: () => {
            // Defer so click on item registers first
            setTimeout(() => {
              countryOpen = false;
              countryQuery = "";
              if (!destroyed) el.rerender();
            }, 120);
          },
          onInput: (ev: Event) => {
            countryQuery = (ev.target as HTMLInputElement).value;
            countryOpen = true;
            countryActiveIdx = 0;
            el.rerender();
          },
          onKeyDown: (ev: KeyboardEvent) => {
            if (!countryOpen) return;
            const list = searchCountries(countryQuery, locale);
            if (ev.key === "ArrowDown") {
              ev.preventDefault();
              countryActiveIdx = Math.min(countryActiveIdx + 1, list.length - 1);
              el.rerender();
            } else if (ev.key === "ArrowUp") {
              ev.preventDefault();
              countryActiveIdx = Math.max(countryActiveIdx - 1, 0);
              el.rerender();
            } else if (ev.key === "Enter") {
              ev.preventDefault();
              const pick = list[countryActiveIdx];
              if (pick) setCountry(pick.code);
            } else if (ev.key === "Escape") {
              countryOpen = false;
              countryQuery = "";
              el.rerender();
            }
          },
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
                      setCountry(c.code);
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
  };

  const renderField = (key: AddressFieldKey) => {
    const locale = uiLocale(state);
    const label = getFieldLabel(schema, key, locale);
    const isRequired = schema.required.includes(key);

    if (key === "admin1" && schema.admin1) {
      // For HK, admin2 field uses HK_DISTRICTS via admin1 array (HK schema lists "admin2").
      return h(
        "div",
        { class: "oc-field", key: "f-admin1" },
        h("label", { class: "oc-label" }, isRequired ? `${label} *` : label),
        h(
          "select",
          {
            class: "oc-select",
            value: fields.admin1Code,
            onChange: (ev: Event) => onAdmin1Change((ev.target as HTMLSelectElement).value),
          },
          h("option", { value: "" }, locale === "ko" ? "선택" : "Select"),
          schema.admin1.map((e) =>
            h("option", { value: e.code, key: e.code }, locale === "ko" ? e.nameLocal : e.nameEn),
          ),
        ),
      );
    }

    if (key === "admin1" && !schema.admin1) {
      return h(
        "div",
        { class: "oc-field", key: "f-admin1" },
        h("label", { class: "oc-label" }, isRequired ? `${label} *` : label),
        h("input", {
          class: "oc-input",
          type: "text",
          value: fields.admin1,
          onInput: (ev: Event) => onTextField("admin1", (ev.target as HTMLInputElement).value),
        }),
      );
    }

    if (key === "admin2") {
      // HK: admin1 field hidden, admin2 uses schema.admin1 dataset (HK districts).
      const source =
        schema.code === "HK"
          ? schema.admin1
          : schema.admin1?.find((e) => e.code === fields.admin1Code)?.children;
      if (source && source.length > 0) {
        return h(
          "div",
          { class: "oc-field", key: "f-admin2" },
          h("label", { class: "oc-label" }, isRequired ? `${label} *` : label),
          h(
            "select",
            {
              class: "oc-select",
              value: fields.admin2Code,
              onChange: (ev: Event) =>
                onAdmin2Change((ev.target as HTMLSelectElement).value, source),
            },
            h("option", { value: "" }, locale === "ko" ? "선택" : "Select"),
            source.map((e) =>
              h("option", { value: e.code, key: e.code }, locale === "ko" ? e.nameLocal : e.nameEn),
            ),
          ),
        );
      }
      return h(
        "div",
        { class: "oc-field", key: "f-admin2" },
        h("label", { class: "oc-label" }, isRequired ? `${label} *` : label),
        h("input", {
          class: "oc-input",
          type: "text",
          value: fields.admin2,
          onInput: (ev: Event) => onTextField("admin2", (ev.target as HTMLInputElement).value),
        }),
      );
    }

    if (key === "postal") {
      const valid = isValidPostal(schema, fields.postal);
      const showError = postalTouched && !valid;
      return h(
        "div",
        { class: "oc-field", key: "f-postal" },
        h("label", { class: "oc-label" }, isRequired ? `${label} *` : label),
        h("input", {
          class: showError ? "oc-input oc-invalid" : "oc-input",
          type: "text",
          value: fields.postal,
          placeholder: schema.postalPlaceholder ?? "",
          inputmode: "numeric",
          onInput: (ev: Event) => onTextField("postal", (ev.target as HTMLInputElement).value),
          onBlur: () => {
            postalTouched = true;
            el.rerender();
          },
        }),
        showError
          ? h(
              "p",
              { class: "oc-error-hint" },
              locale === "ko" ? "우편번호 형식이 올바르지 않습니다." : "Invalid postal code.",
            )
          : null,
      );
    }

    const valueKey = key as "city" | "line1" | "line2";
    return h(
      "div",
      { class: "oc-field", key: `f-${key}` },
      h("label", { class: "oc-label" }, isRequired ? `${label} *` : label),
      h("input", {
        class: "oc-input",
        type: "text",
        value: fields[valueKey],
        onInput: (ev: Event) => onTextField(valueKey, (ev.target as HTMLInputElement).value),
      }),
    );
  };

  const renderNode = () => {
    const snapshot = buildSnapshot();
    assertPanFree({ ...snapshot, variantKey: options.variantKey });
    const visibleFields = schema.fields;
    const l = labels();
    return h(
      "section",
      { class: "oc-shell", part: "shell", "aria-label": "OpenCheckout address widget" },
      h("p", { class: "oc-eyebrow" }, l.eyebrow),
      h("h3", { class: "oc-title" }, l.title),
      renderCountryCombo(),
      visibleFields.map((key) => renderField(key)),
    );
  };

  const configSnapshot = () => ({
    countryCode,
    fields,
    locale: state.locale,
    variantKey: options.variantKey,
  });

  el.setRenderFn(renderNode, configSnapshot());
  host.append(el);

  const unsubAmount = state.bus.on("amount:change", () => el.rerender());
  const unsubOrder = state.bus.on("order:change", (order) => {
    if (order.buyerCountry && order.buyerCountry !== countryCode) {
      setCountry(order.buyerCountry);
    }
  });

  return {
    on<K extends keyof AddressWidgetEvents>(
      event: K,
      cb: (payload: AddressWidgetEvents[K]) => void,
    ): () => void {
      if (destroyed) {
        throw new Error("AddressWidget has been destroyed");
      }
      if (event !== "addressSelect") {
        throw new Error(`Unknown AddressWidget event: ${String(event)}`);
      }
      listeners.push(cb as (payload: AddressSelection) => void);
      return () => {
        const idx = listeners.indexOf(cb as (payload: AddressSelection) => void);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubAmount();
      unsubOrder();
      listeners.length = 0;
      el.remove();
    },
  };
}
