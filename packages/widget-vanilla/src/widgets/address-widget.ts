import {
  type AddressFieldKey,
  type AdminEntry,
  type CountrySchema,
  getCountrySchema,
  searchCountries,
} from "../internal/address-data.js";
import { assertPanFree } from "../internal/pan-guard.js";
import { h } from "../internal/preact-runtime.js";
import { OpenCheckoutShadowElement, defineOnce, resolveTarget } from "../internal/shadow-base.js";
import type { AddressSelection, SessionState } from "../internal/state.js";
import { type FieldValues, emptyFields, renderAddressField } from "./internal/address-field.js";
import { renderCountryCombo } from "./internal/address-country-combobox.js";

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

  const renderField = (key: AddressFieldKey) =>
    renderAddressField({
      key_: key,
      schema,
      fields,
      locale: uiLocale(state),
      postalTouched,
      onAdmin1Change,
      onAdmin2Change,
      onTextField,
      onPostalBlur: () => {
        postalTouched = true;
        el.rerender();
      },
    });

  const renderNode = () => {
    const snapshot = buildSnapshot();
    assertPanFree({ ...snapshot, variantKey: options.variantKey });
    const visibleFields = schema.fields;
    const l = labels();
    const locale = uiLocale(state);
    return h(
      "section",
      { class: "oc-shell", part: "shell", "aria-label": "OpenCheckout address widget" },
      h("p", { class: "oc-eyebrow" }, l.eyebrow),
      h("h3", { class: "oc-title" }, l.title),
      renderCountryCombo({
        schema,
        countryOpen,
        countryQuery,
        countryActiveIdx,
        countryLabel: l.countryLabel,
        locale,
        onFocus: () => {
          countryOpen = true;
          countryQuery = "";
          countryActiveIdx = 0;
          el.rerender();
        },
        onBlur: () => {
          setTimeout(() => {
            countryOpen = false;
            countryQuery = "";
            if (!destroyed) el.rerender();
          }, 120);
        },
        onInput: (value: string) => {
          countryQuery = value;
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
        onSelect: setCountry,
      }),
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
