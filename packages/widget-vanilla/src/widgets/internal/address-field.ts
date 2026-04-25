import {
  type AddressFieldKey,
  type AdminEntry,
  type CountrySchema,
  getFieldLabel,
  isValidPostal,
} from "../../internal/address-data.js";
import { h } from "../../internal/preact-runtime.js";

export type FieldValues = {
  admin1Code: string;
  admin1: string;
  admin2Code: string;
  admin2: string;
  city: string;
  line1: string;
  line2: string;
  postal: string;
};

export function emptyFields(): FieldValues {
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

export type AddressFieldProps = {
  key_: AddressFieldKey;
  schema: CountrySchema;
  fields: FieldValues;
  locale: "ko" | "en";
  postalTouched: boolean;
  onAdmin1Change: (entryCode: string) => void;
  onAdmin2Change: (entryCode: string, source: readonly AdminEntry[] | undefined) => void;
  onTextField: (key: keyof FieldValues, value: string) => void;
  onPostalBlur: () => void;
};

export function renderAddressField(props: AddressFieldProps) {
  const { key_: key, schema, fields, locale, postalTouched, onAdmin1Change, onAdmin2Change, onTextField, onPostalBlur } = props;
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
        onBlur: onPostalBlur,
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
}
