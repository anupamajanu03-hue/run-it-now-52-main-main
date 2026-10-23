import { describe, expect, it } from "vitest";
import { cashCountReducer, cashCountTotal, initialCashCount } from "@/finance/cashCount";

describe("Petty cash denomination rules", () => {
  it("allows every default denomination, including the 500 note, to be removed and re-added", () => {
    for (const row of initialCashCount.denominations) {
      const removed = cashCountReducer(initialCashCount, { type: "remove", ...row });
      expect(removed.denominations).not.toContainEqual(row);
      const added = cashCountReducer(removed, { type: "add", ...row });
      expect(added.denominations).toContainEqual(row);
    }
    expect(initialCashCount.denominations.map((row) => row.value)).toEqual([500, 200, 100, 50, 20, 10, 5, 2, 1]);
  });
  it("blocks duplicate value/type pairs but permits a note and coin with the same value", () => {
    const duplicate = cashCountReducer(initialCashCount, { type: "add", value: 10, kind: "Note" });
    expect(duplicate.denominations).toHaveLength(9);
    const coin = cashCountReducer(duplicate, { type: "add", value: 10, kind: "Coin" });
    expect(coin.denominations.filter((row) => row.value === 10)).toHaveLength(2);
  });
  it("rejects negative, fractional and nonfinite quantities", () => {
    for (const quantity of [-1, 1.5, NaN, Infinity]) {
      const state = cashCountReducer(initialCashCount, { type: "quantity", value: 500, kind: "Note", quantity });
      expect(state.denominations.find((row) => row.value === 500)?.quantity).toBe(0);
    }
  });
  it("multiplies denominations and quantities immediately, including same-value notes and coins", () => {
    let state = cashCountReducer(initialCashCount, { type: "quantity", value: 500, kind: "Note", quantity: 2 });
    state = cashCountReducer(state, { type: "add", value: 500, kind: "Coin" });
    state = cashCountReducer(state, { type: "quantity", value: 500, kind: "Coin", quantity: 1 });
    expect(cashCountTotal(state.denominations)).toBe(1500);
  });
  it.each([[1000, 0, "Matched"], [1200, -200, "Shortage"], [800, 200, "Excess"]] as const)(
    "compares physical cash with book balance %s without altering it", (bookBalance, difference, status) => {
      const draft = cashCountReducer(initialCashCount, { type: "quantity", value: 500, kind: "Note", quantity: 2 });
      const saved = cashCountReducer(draft, { type: "save", bookBalance });
      expect(saved.saved[0]).toMatchObject({ total: 1000, bookBalance, difference, status });
    },
  );
  it("preserves saved snapshots when denominations are removed or quantities edited", () => {
    let state = cashCountReducer(initialCashCount, { type: "quantity", value: 500, kind: "Note", quantity: 2 });
    state = cashCountReducer(state, { type: "save", bookBalance: 1000 });
    state = cashCountReducer(state, { type: "remove", value: 500, kind: "Note" });
    state = cashCountReducer(state, { type: "quantity", value: 200, kind: "Note", quantity: 3 });
    state = cashCountReducer(state, { type: "save", bookBalance: 1000 });
    expect(state.saved[0]?.total).toBe(1000);
    expect(state.saved[0]?.denominations.find((row) => row.value === 500)?.quantity).toBe(2);
    expect(state.saved[0]?.denominations.find((row) => row.value === 200)?.quantity).toBe(0);
    expect(state.saved[1]?.total).toBe(600);
  });
});