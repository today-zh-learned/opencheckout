import { assertPanFree } from "./pan-guard.js";
import { type ComponentChild, h, render } from "./preact-runtime.js";
import { WIDGET_CSS } from "./styles.js";
import { OpenCheckoutValidationError } from "./validate.js";

export type ShadowRenderFn = () => ComponentChild;

/**
 * Base custom element helper for OpenCheckout widgets.
 * - Attaches an open shadow root.
 * - Renders a Preact VNode + shared WIDGET_CSS via `<style>`.
 * - Runs assertPanFree on the config snapshot each render tick.
 */
export class OpenCheckoutShadowElement extends HTMLElement {
  private _renderFn: ShadowRenderFn | null = null;
  private _configSnapshot: unknown = null;

  setRenderFn(fn: ShadowRenderFn, configSnapshot: unknown): void {
    this._renderFn = fn;
    this._configSnapshot = configSnapshot;
    if (this.isConnected) this.rerender();
  }

  rerender(): void {
    if (!this._renderFn) return;
    assertPanFree(this._configSnapshot);
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    render(h("div", { part: "root" }, h("style", null, WIDGET_CSS), this._renderFn()), root);
  }

  connectedCallback(): void {
    this.rerender();
  }

  disconnectedCallback(): void {
    const root = this.shadowRoot;
    if (root) render(null, root);
  }
}

/**
 * Throws OpenCheckoutValidationError if `host` already contains a child element
 * matching `tag`. Call before appending a widget element to enforce single-mount.
 */
export function assertNotAlreadyMounted(host: Element, tag: string): void {
  if (host.querySelector(tag) !== null) {
    throw new OpenCheckoutValidationError(
      `${tag} is already mounted at this selector — call .destroy() first or pick a different selector`,
    );
  }
}

export function defineOnce(tagName: string, ctor: CustomElementConstructor): void {
  if (typeof customElements === "undefined") {
    throw new TypeError("customElements is required to register OpenCheckout widgets");
  }
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ctor);
  }
}

/**
 * Returns a `mountInto(host)` helper that performs idempotency check then appends
 * `el` to `host`. Callers should migrate from bare `host.append(el)` to this helper.
 * Existing callers using `host.append(el)` directly retain pre-existing
 * append-second-instance behaviour until they migrate.
 */
export function makeMountHelper(tag: string, el: Element): { mountInto(host: Element): void } {
  return {
    mountInto(host: Element): void {
      assertNotAlreadyMounted(host, tag);
      host.append(el);
    },
  };
}

export function resolveTarget(target: Element | string): Element {
  if (typeof document === "undefined") {
    throw new TypeError("document is required to mount OpenCheckout widgets");
  }
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) {
    throw new TypeError(`OpenCheckout mount target was not found: ${String(target)}`);
  }
  return el;
}
