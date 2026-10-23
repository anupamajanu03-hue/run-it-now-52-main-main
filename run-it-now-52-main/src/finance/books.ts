import { OPENING } from "./data";
import { inRange, isCash, sum } from "./logic";
import type { LedgerEntry } from "./store";

export function buildBookStatement(
  entries: LedgerEntry[],
  kind: "cash" | "bank",
  from: string,
  to: string,
) {
  const scoped = entries
    .filter((entry) => (kind === "cash" ? isCash(entry.method) : !isCash(entry.method)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const signed = (entry: LedgerEntry) => (entry.type === "income" ? entry.amount : -entry.amount);
  const opening =
    (kind === "cash" ? OPENING.cash : OPENING.bank) +
    scoped
      .filter((entry) => entry.date < from)
      .reduce((balance, entry) => balance + signed(entry), 0);
  let balance = opening;
  const rows = scoped
    .filter((entry) => inRange(entry.date, from, to))
    .map((entry) => ({ ...entry, balance: (balance += signed(entry)) }));
  return {
    opening,
    rows,
    totalReceived: sum(
      rows.filter((entry) => entry.type === "income").map((entry) => entry.amount),
    ),
    totalPaid: sum(rows.filter((entry) => entry.type === "expense").map((entry) => entry.amount)),
    closing: balance,
  };
}
