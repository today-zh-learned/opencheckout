import { assertPanFree } from "../internal/pan-guard.js";
import { h } from "../internal/preact-runtime.js";
import { OpenCheckoutShadowElement, defineOnce, resolveTarget } from "../internal/shadow-base.js";
import type { SessionState } from "../internal/state.js";
import { OpenCheckoutValidationError } from "../internal/validate.js";

/** Single clause supplied by the merchant. No engineering legal copy is injected as defaults. */
export type AgreementClause = {
  /** Stable id used in `clauseChange` payloads. */
  readonly id: string;
  /** Merchant-supplied display text. */
  readonly label: string;
  /** If true, must be checked for overall `agreed` to be true. */
  readonly required: boolean;
  /** Optional "보기 ↗" link. Must be https: (http: only for localhost). */
  readonly href?: string;
};

export type AgreementWidgetEvents = {
  /** Fires when overall agreed changes (all required clauses checked → true). */
  agreementStatusChange: boolean;
  /**
   * NEW (Wave-B): fires on every individual clause toggle.
   * Payload: `{ id: string; checked: boolean }` — use for analytics or per-clause gating.
   */
  clauseChange: { id: string; checked: boolean };
};

export type AgreementWidget = {
  on<K extends keyof AgreementWidgetEvents>(
    event: K,
    cb: (payload: AgreementWidgetEvents[K]) => void,
  ): () => void;
  destroy(): void;
};

// Fallback clause when merchant omits `clauses` — preserves single-checkbox backwards compat.
const DEFAULT_CLAUSE: AgreementClause = {
  id: "default",
  label: "전체 약관에 동의합니다",
  required: true,
};

const TAG = "oc-agreement";

export class OcAgreementElement extends OpenCheckoutShadowElement {}

function validateClauseHref(href: string): void {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    throw new OpenCheckoutValidationError(`clause href is not a valid URL: "${href}"`);
  }
  if (parsed.protocol === "https:") return;
  const h = parsed.hostname.toLowerCase();
  const isLocal = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  if (parsed.protocol === "http:" && isLocal) return;
  throw new OpenCheckoutValidationError(
    `clause href must use https (http allowed only on localhost), got "${href}"`,
  );
}

export function mountAgreementWidget(
  target: Element | string,
  state: SessionState,
  opts?: { clauses?: ReadonlyArray<AgreementClause> },
): AgreementWidget {
  defineOnce(TAG, OcAgreementElement);
  const host = resolveTarget(target);
  const el = document.createElement(TAG) as OcAgreementElement;

  const rawClauses: ReadonlyArray<AgreementClause> =
    opts?.clauses && opts.clauses.length > 0 ? opts.clauses : [DEFAULT_CLAUSE];

  // PAN boundary + href scheme check at mount time (defence in depth).
  assertPanFree(rawClauses);
  for (const clause of rawClauses) {
    assertPanFree(clause.label);
    if (clause.href !== undefined) validateClauseHref(clause.href);
  }

  const clauseState = new Map<string, boolean>(rawClauses.map((c) => [c.id, false]));
  const isSingle = rawClauses.length === 1;

  const agreementListeners: Array<(payload: boolean) => void> = [];
  const clauseListeners: Array<(payload: { id: string; checked: boolean }) => void> = [];
  let destroyed = false;

  const computeAgreed = (): boolean => {
    for (const clause of rawClauses) {
      if (clause.required && !clauseState.get(clause.id)) return false;
    }
    return true;
  };

  const emitAgreed = (next: boolean): void => {
    state.agreementChecked = next;
    state.bus.emit("agreement:change", next);
    for (const cb of agreementListeners) cb(next);
  };

  const toggleClause = (id: string, next: boolean): void => {
    clauseState.set(id, next);
    for (const cb of clauseListeners) cb({ id, checked: next });
    emitAgreed(computeAgreed());
    el.rerender();
  };

  const toggleAll = (next: boolean): void => {
    for (const clause of rawClauses) {
      clauseState.set(clause.id, next);
      for (const cb of clauseListeners) cb({ id: clause.id, checked: next });
    }
    emitAgreed(computeAgreed());
    el.rerender();
  };

  const masterAriaChecked = (): "true" | "false" | "mixed" => {
    const vals = rawClauses.map((c) => clauseState.get(c.id) ?? false);
    if (vals.every(Boolean)) return "true";
    if (vals.every((v) => !v)) return "false";
    return "mixed";
  };

  const renderNode = () => {
    const firstClause = rawClauses[0];
    if (isSingle && firstClause) {
      const clause = firstClause;
      const checked = clauseState.get(clause.id) ?? false;
      return h(
        "section",
        { class: "oc-shell", part: "shell", "aria-label": "OpenCheckout agreement widget" },
        h(
          "label",
          { class: "oc-check" },
          h("input", {
            type: "checkbox",
            checked,
            onChange: (ev: Event) =>
              toggleClause(clause.id, (ev.target as HTMLInputElement).checked),
          }),
          clause.label,
          clause.href
            ? h(
                "a",
                {
                  class: "oc-clause-link",
                  href: clause.href,
                  target: "_blank",
                  rel: "noopener noreferrer",
                },
                "보기 ↗",
              )
            : null,
        ),
      );
    }

    const ariaChecked = masterAriaChecked();
    return h(
      "section",
      { class: "oc-shell", part: "shell", "aria-label": "OpenCheckout agreement widget" },
      h(
        "label",
        { class: "oc-check oc-check--master" },
        h("input", {
          type: "checkbox",
          checked: ariaChecked === "true",
          "aria-checked": ariaChecked,
          onChange: (ev: Event) => toggleAll((ev.target as HTMLInputElement).checked),
        }),
        "전체 동의",
      ),
      ...rawClauses.map((clause) =>
        h(
          "label",
          { key: clause.id, class: "oc-check oc-check--clause" },
          h("input", {
            type: "checkbox",
            checked: clauseState.get(clause.id) ?? false,
            onChange: (ev: Event) =>
              toggleClause(clause.id, (ev.target as HTMLInputElement).checked),
          }),
          clause.label,
          clause.required ? h("span", { class: "oc-clause-required" }, "필수") : null,
          clause.href
            ? h(
                "a",
                {
                  class: "oc-clause-link",
                  href: clause.href,
                  target: "_blank",
                  rel: "noopener noreferrer",
                },
                "보기 ↗",
              )
            : null,
        ),
      ),
    );
  };

  el.setRenderFn(renderNode, rawClauses);
  host.append(el);

  return {
    on<K extends keyof AgreementWidgetEvents>(
      event: K,
      cb: (payload: AgreementWidgetEvents[K]) => void,
    ): () => void {
      if (destroyed) throw new Error("AgreementWidget has been destroyed");
      if (event === "agreementStatusChange") {
        const typedCb = cb as (payload: boolean) => void;
        agreementListeners.push(typedCb);
        return () => {
          const idx = agreementListeners.indexOf(typedCb);
          if (idx >= 0) agreementListeners.splice(idx, 1);
        };
      }
      if (event === "clauseChange") {
        const typedCb = cb as (payload: { id: string; checked: boolean }) => void;
        clauseListeners.push(typedCb);
        return () => {
          const idx = clauseListeners.indexOf(typedCb);
          if (idx >= 0) clauseListeners.splice(idx, 1);
        };
      }
      throw new Error(`Unknown AgreementWidget event: ${String(event)}`);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      agreementListeners.length = 0;
      clauseListeners.length = 0;
      el.remove();
    },
  };
}
