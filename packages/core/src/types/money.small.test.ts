import { describe, expect, it } from "vitest";
import { addMoney, money, subtractMoney } from "./money.js";

describe("Money value object", () => {
  it("creates money with correct fields", () => {
    const m = money(1000n, "KRW");
    expect(m.amount).toBe(1000n);
    expect(m.currency).toBe("KRW");
  });

  it("addMoney: same currency succeeds", () => {
    const result = addMoney(money(1000n, "KRW"), money(500n, "KRW"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amount).toBe(1500n);
  });

  it("addMoney: mixed currency returns error", () => {
    const result = addMoney(money(1000n, "KRW"), money(1n, "USD"));
    expect(result.ok).toBe(false);
  });

  it("subtractMoney: same currency succeeds", () => {
    const result = subtractMoney(money(1000n, "KRW"), money(300n, "KRW"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amount).toBe(700n);
  });

  it("subtractMoney: negative result returns error", () => {
    const result = subtractMoney(money(100n, "KRW"), money(200n, "KRW"));
    expect(result.ok).toBe(false);
  });
});
