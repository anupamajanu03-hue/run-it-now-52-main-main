import { cashComparison, sum } from "./logic";

export type DenominationKind = "Note" | "Coin";
export interface CashDenomination { value: number; kind: DenominationKind; quantity: number }
export interface SavedCashCount {
  denominations: CashDenomination[];
  total: number;
  bookBalance: number;
  difference: number;
  status: "Matched" | "Shortage" | "Excess";
}
export interface CashCountState { denominations: CashDenomination[]; saved: SavedCashCount[] }
export type CashCountAction =
  | { type: "add"; value: number; kind: DenominationKind }
  | { type: "remove"; value: number; kind: DenominationKind }
  | { type: "quantity"; value: number; kind: DenominationKind; quantity: number }
  | { type: "save"; bookBalance: number };

export const initialCashCount: CashCountState = {
  denominations: [
    ...[500, 200, 100, 50, 20, 10].map((value) => ({ value, kind: "Note" as const, quantity: 0 })),
    ...[5, 2, 1].map((value) => ({ value, kind: "Coin" as const, quantity: 0 })),
  ],
  saved: [],
};
export const cashCountTotal = (rows: CashDenomination[]) => sum(rows.map((row) => row.value * row.quantity));

export function cashCountReducer(state: CashCountState, action: CashCountAction): CashCountState {
  if (action.type === "save") {
    const total = cashCountTotal(state.denominations);
    const comparison = cashComparison(action.bookBalance, total);
    return { ...state, saved: [...state.saved, {
      denominations: state.denominations.map((row) => ({ ...row })),
      total, bookBalance: action.bookBalance, difference: comparison.diff, status: comparison.status,
    }] };
  }
  const matches = (row: CashDenomination) => row.value === action.value && row.kind === action.kind;
  if (action.type === "add") {
    if (!Number.isSafeInteger(action.value) || action.value <= 0 || state.denominations.some(matches)) return state;
    return { ...state, denominations: [...state.denominations, { value: action.value, kind: action.kind, quantity: 0 }]
      .sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === "Note" ? -1 : 1)) };
  }
  if (action.type === "remove") return { ...state, denominations: state.denominations.filter((row) => !matches(row)) };
  if (!Number.isSafeInteger(action.quantity) || action.quantity < 0) return state;
  return { ...state, denominations: state.denominations.map((row) => matches(row) ? { ...row, quantity: action.quantity } : row) };
}