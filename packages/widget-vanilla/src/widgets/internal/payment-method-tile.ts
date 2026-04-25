import { type PaymentMethodDescriptor } from "../../internal/payment-methods.js";
import { type ComponentChild, h } from "../../internal/preact-runtime.js";

export type PaymentTileProps = {
  descriptor: PaymentMethodDescriptor;
  visibleList: readonly PaymentMethodDescriptor[];
  isSelected: boolean;
  locale: string;
  detail: ComponentChild;
  onSelect: (code: string) => void;
};

function renderIcon(descriptor: PaymentMethodDescriptor): ComponentChild {
  return h(
    "span",
    { class: "oc-pm-icon", "aria-hidden": "true" },
    h(
      "svg",
      {
        width: "16",
        height: "16",
        viewBox: "0 0 16 16",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "1.4",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
      h("path", { d: descriptor.iconPath }),
    ),
  );
}

export function renderPaymentTile(props: PaymentTileProps) {
  const { descriptor, visibleList, isSelected, locale, detail, onSelect } = props;
  const labelText = locale === "en" ? descriptor.labelEn : descriptor.labelKo;

  return h(
    "div",
    { class: "oc-pm-tile-wrap", key: `wrap-${descriptor.code}` },
    h(
      "div",
      {
        class: "oc-pm-tile",
        role: "radio",
        tabindex: isSelected ? "0" : "-1",
        "aria-checked": isSelected ? "true" : "false",
        "data-selected": isSelected ? "true" : "false",
        "data-method": descriptor.code,
        key: `tile-${descriptor.code}`,
        onClick: () => onSelect(descriptor.code),
        onKeyDown: (ev: KeyboardEvent) => {
          // Space/Enter on an already-selected tile: no-op (selection follows focus).
          if (ev.key === " " || ev.key === "Enter") {
            ev.preventDefault();
            return;
          }
          // Roving tabindex arrow navigation handled on the radiogroup container.
          // Forward navigation keys to the container handler so focus + selection move.
          const isNavKey = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(ev.key);
          if (isNavKey) {
            ev.preventDefault();
            const currentIdx = visibleList.findIndex((d) => d.code === descriptor.code);
            let nextIdx = currentIdx;
            if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
              nextIdx = (currentIdx + 1) % visibleList.length;
            } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
              nextIdx = (currentIdx - 1 + visibleList.length) % visibleList.length;
            } else if (ev.key === "Home") {
              nextIdx = 0;
            } else if (ev.key === "End") {
              nextIdx = visibleList.length - 1;
            }
            const nextCode = visibleList[nextIdx]?.code;
            if (nextCode) {
              // Capture root reference before onSelect() triggers re-render (currentTarget nulls out async).
              const tileRoot = (ev.currentTarget as HTMLElement).getRootNode() as ShadowRoot | Document;
              onSelect(nextCode);
              // Move focus to the newly selected tile after re-render.
              requestAnimationFrame(() => {
                const nextTile = tileRoot.querySelector(`[data-method="${nextCode}"]`) as HTMLElement | null;
                nextTile?.focus();
              });
            }
          }
        },
      },
      renderIcon(descriptor),
      h("span", { class: "oc-pm-label" }, labelText),
      h("span", { class: "oc-pm-chevron", "aria-hidden": "true" }, ">"),
      // Hidden native radio kept for form-association tests / a11y fallback (PAN-free).
      h("input", {
        class: "oc-pm-tile-radio",
        type: "radio",
        name: "oc-payment",
        value: descriptor.code,
        checked: isSelected,
        tabindex: "-1",
        "aria-hidden": "true",
        readonly: true,
        onChange: () => onSelect(descriptor.code),
      }),
    ),
    h("div", { class: "oc-pm-detail", "data-open": isSelected ? "true" : "false" }, detail),
  );
}
