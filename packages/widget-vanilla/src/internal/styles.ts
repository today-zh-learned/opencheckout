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

  /* Payment-method tile system */
  .oc-pm-header {
    align-items: center;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 12px;
  }

  .oc-pm-amount-chip {
    background: #1f4d3a;
    border-radius: 999px;
    color: #fffaf0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 6px 12px;
  }

  .oc-pm-tiles {
    display: grid;
    gap: 8px;
    margin: 0 0 4px;
  }

  .oc-pm-tile {
    align-items: center;
    background: rgba(255, 255, 255, 0.62);
    border: 1px solid rgba(87, 79, 52, 0.18);
    border-radius: 12px;
    color: #262319;
    cursor: pointer;
    display: flex;
    gap: 12px;
    padding: 12px 14px;
    transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
  }

  .oc-pm-tile:hover {
    background: rgba(255, 255, 255, 0.88);
    border-color: rgba(31, 77, 58, 0.45);
  }

  .oc-pm-tile:focus-visible {
    outline: 3px solid #d38b27;
    outline-offset: 2px;
  }

  .oc-pm-tile[data-selected="true"] {
    background: rgba(31, 77, 58, 0.10);
    border-color: #1f4d3a;
    box-shadow: inset 0 0 0 1px #1f4d3a;
  }

  .oc-pm-tile-radio {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    border: 0;
  }

  .oc-pm-icon {
    align-items: center;
    color: #1f4d3a;
    display: inline-flex;
    flex: 0 0 auto;
    height: 20px;
    justify-content: center;
    width: 20px;
  }

  .oc-pm-label {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
  }

  .oc-pm-chevron {
    color: rgba(38, 35, 25, 0.45);
    font-size: 14px;
    transition: transform 160ms ease, color 120ms ease;
  }

  .oc-pm-tile[data-selected="true"] .oc-pm-chevron {
    color: #1f4d3a;
    transform: rotate(90deg);
  }

  .oc-pm-detail {
    display: grid;
    grid-template-rows: 0fr;
    overflow: hidden;
    transition: grid-template-rows 220ms ease;
  }

  .oc-pm-detail[data-open="true"] {
    grid-template-rows: 1fr;
  }

  .oc-pm-detail-inner {
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(87, 79, 52, 0.16);
    border-radius: 12px;
    margin-top: 8px;
    min-height: 0;
    padding: 12px;
  }

  .oc-pm-detail-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    margin: 0 0 8px;
    text-transform: uppercase;
    opacity: 0.75;
  }

  .oc-installment-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .oc-installment-cell {
    background: #fff;
    border: 1px solid rgba(87, 79, 52, 0.22);
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    padding: 8px 4px;
    text-align: center;
    transition: border-color 120ms ease, background-color 120ms ease;
  }

  .oc-installment-cell:hover {
    border-color: #1f4d3a;
  }

  .oc-installment-cell:focus-visible {
    outline: 2px solid #d38b27;
    outline-offset: 1px;
  }

  .oc-installment-cell[data-selected="true"] {
    background: #1f4d3a;
    border-color: #1f4d3a;
    color: #fffaf0;
  }

  .oc-bank-select {
    background: #fff;
    border: 1px solid rgba(87, 79, 52, 0.26);
    border-radius: 10px;
    font: inherit;
    padding: 9px 12px;
    width: 100%;
    box-sizing: border-box;
  }

  .oc-bank-select:focus-visible {
    outline: 3px solid #d38b27;
    outline-offset: 1px;
  }

  .oc-pm-note {
    color: #4d4a3b;
    font-size: 12px;
    line-height: 1.4;
    margin: 0;
  }

  .oc-easy-pay-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .oc-easy-pay-chip {
    background: #fff;
    border: 1px solid rgba(87, 79, 52, 0.22);
    border-radius: 999px;
    cursor: pointer;
    font-size: 12px;
    padding: 6px 12px;
    transition: border-color 120ms ease, background-color 120ms ease;
  }

  .oc-easy-pay-chip:hover {
    border-color: #1f4d3a;
  }

  .oc-easy-pay-chip:focus-visible {
    outline: 2px solid #d38b27;
    outline-offset: 1px;
  }

  .oc-easy-pay-chip[data-selected="true"] {
    background: #1f4d3a;
    border-color: #1f4d3a;
    color: #fffaf0;
  }

  .oc-pm-skeleton {
    background: linear-gradient(
      90deg,
      rgba(214, 211, 199, 0.35) 0%,
      rgba(214, 211, 199, 0.6) 50%,
      rgba(214, 211, 199, 0.35) 100%
    );
    background-size: 200% 100%;
    border-radius: 12px;
    height: 56px;
    animation: oc-pm-shimmer 1200ms linear infinite;
  }

  .oc-pm-skeleton + .oc-pm-skeleton {
    margin-top: 8px;
  }

  .oc-pm-fade {
    animation: oc-pm-fade-in 220ms ease;
  }

  @keyframes oc-pm-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @keyframes oc-pm-fade-in {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: none; }
  }
`;
