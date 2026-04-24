import { assertPanFree } from "./pan-guard.js";
import { type ComponentChild, h, render } from "./preact-runtime.js";
import { WIDGET_CSS } from "./styles.js";

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

export function defineOnce(tagName: string, ctor: CustomElementConstructor): void {
  if (typeof customElements === "undefined") {
    throw new TypeError("customElements is required to register OpenCheckout widgets");
  }
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ctor);
  }
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
