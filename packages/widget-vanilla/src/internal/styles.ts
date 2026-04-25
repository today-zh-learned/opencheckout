export const WIDGET_CSS = `
  :host {
    color-scheme: light;
    display: block;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .oc-shell {
    border: 1px solid #d6d3c7;
    border-radius: 18px;
    background: linear-gradient(135deg, #fffaf0 0%, #f6f1e4 52%, #e8f0eb 100%);
    box-shadow: 0 20px 50px rgba(45, 40, 25, 0.14);
    color: #262319;
    max-width: 460px;
    overflow: hidden;
    padding: 18px;
  }

  .oc-eyebrow {
    color: #7b4e10;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    margin: 0 0 6px;
    text-transform: uppercase;
  }

  .oc-title {
    font-size: 18px;
    line-height: 1.2;
    margin: 0 0 12px;
  }

  .oc-field {
    display: grid;
    gap: 6px;
    margin: 0 0 12px;
  }

  .oc-label {
    font-size: 12px;
    font-weight: 600;
    opacity: 0.8;
  }

  .oc-input {
    background: #fff;
    border: 1px solid rgba(87, 79, 52, 0.26);
    border-radius: 10px;
    font: inherit;
    padding: 9px 12px;
    width: 100%;
    box-sizing: border-box;
  }

  .oc-input:focus-visible {
    outline: 3px solid #d38b27;
    outline-offset: 1px;
  }

  .oc-radios {
    display: grid;
    gap: 8px;
    margin: 0 0 12px;
  }

  .oc-radio {
    align-items: center;
    background: rgba(255, 255, 255, 0.56);
    border: 1px solid rgba(87, 79, 52, 0.18);
    border-radius: 12px;
    cursor: pointer;
    display: flex;
    gap: 10px;
    padding: 10px 12px;
  }

  .oc-radio[data-selected="true"] {
    border-color: #1f4d3a;
    background: rgba(31, 77, 58, 0.08);
  }

  .oc-radio input {
    margin: 0;
  }

  .oc-radio-label {
    flex: 1;
    font-size: 14px;
  }

  .oc-radio-hint {
    color: #4d4a3b;
    font-size: 12px;
    opacity: 0.75;
  }

  .oc-toggle {
    display: flex;
    gap: 12px;
    margin: 0 0 10px;
  }

  .oc-amount {
    background: rgba(31, 77, 58, 0.07);
    border-radius: 12px;
    font-size: 13px;
    margin: 0 0 12px;
    padding: 10px 12px;
  }

  .oc-footnote {
    font-size: 11px;
    margin: 6px 0 0;
    opacity: 0.7;
  }

  .oc-check {
    align-items: center;
    display: flex;
    gap: 8px;
    font-size: 14px;
  }

  .oc-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .oc-row .oc-field {
    margin: 0 0 12px;
  }

  .oc-select {
    background: #fff;
    border: 1px solid rgba(87, 79, 52, 0.26);
    border-radius: 10px;
    font: inherit;
    padding: 9px 12px;
    width: 100%;
    box-sizing: border-box;
    appearance: none;
    -webkit-appearance: none;
    background-image: linear-gradient(45deg, transparent 50%, #6a5a2c 50%),
      linear-gradient(135deg, #6a5a2c 50%, transparent 50%);
    background-position: calc(100% - 18px) 50%, calc(100% - 13px) 50%;
    background-size: 5px 5px, 5px 5px;
    background-repeat: no-repeat;
    padding-right: 30px;
  }

  .oc-select:focus-visible {
    outline: 3px solid #d38b27;
    outline-offset: 1px;
  }

  .oc-combo {
    position: relative;
  }

  .oc-combo-list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid rgba(87, 79, 52, 0.26);
    border-radius: 10px;
    box-shadow: 0 12px 28px rgba(45, 40, 25, 0.16);
    list-style: none;
    margin: 0;
    padding: 4px 0;
    max-height: 220px;
    overflow-y: auto;
    z-index: 50;
  }

  .oc-combo-item {
    padding: 8px 12px;
    cursor: pointer;
    font-size: 14px;
    line-height: 1.3;
  }

  .oc-combo-item[aria-selected="true"],
  .oc-combo-item:hover {
    background: rgba(31, 77, 58, 0.1);
  }

  .oc-combo-item-sub {
    color: #6a5a2c;
    font-size: 11px;
    margin-left: 6px;
  }

  .oc-input.oc-invalid,
  .oc-select.oc-invalid {
    border-color: #b3261e;
    outline-color: #b3261e;
  }

  .oc-error-hint {
    color: #b3261e;
    font-size: 11px;
    margin: 4px 0 0;
  }
`;
