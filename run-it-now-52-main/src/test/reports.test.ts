import { describe, expect, it } from "vitest";
import { OPENING } from "@/finance/data";
import { buildBookStatement } from "@/finance/books";
import type { LedgerEntry } from "@/finance/store";

const entries: LedgerEntry[] = [
  {
    id: "before-cash",
    date: "2026-09-30",
    type: "income",
    description: "Prior cash",
    category: "Other",
    amount: 100,
    method: "Cash",
    reference: "RCPT-1",
    status: "Posted",
    source: "txn",
  },
  {
    id: "cash-expense",
    date: "2026-10-03",
    type: "expense",
    description: "Cash expense",
    category: "Supplies",
    amount: 20,
    method: "Cash",
    reference: "VCH-1",
    status: "Posted",
    source: "txn",
  },
  {
    id: "bank-income",
    date: "2026-10-04",
    type: "income",
    description: "Bank income",
    category: "Other",
    amount: 60,
    method: "UPI",
    reference: "RCPT-2",
    status: "Posted",
    source: "txn",
  },
  {
    id: "cash-income",
    date: "2026-10-05",
    type: "income",
    description: "Cash income",
    category: "Other",
    amount: 10,
    method: "Cash",
    reference: "RCPT-3",
    status: "Posted",
    source: "txn",
  },
  {
    id: "fee-receipt",
    date: "2026-10-06",
    type: "income",
    description: "Fee payment – Student Name",
    category: "Student Fees",
    amount: 50,
    method: "Cash",
    reference: "RCP-1",
    receiptNo: "RCP-1",
    status: "Posted",
    source: "fee",
  },
];

describe("book statement calculations", () => {
  it("keeps cash and bank entries separate and carries balances through the period", () => {
    const cash = buildBookStatement(entries, "cash", "2026-10-01", "2026-10-31");
    expect(cash.opening).toBe(OPENING.cash + 100);
    expect(cash.rows.map((row) => row.id)).toEqual(["cash-expense", "cash-income", "fee-receipt"]);
    expect(cash.rows.at(-1)).toMatchObject({
      category: "Student Fees",
      description: "Fee payment – Student Name",
      receiptNo: "RCP-1",
    });
    expect(cash.totalReceived).toBe(60);
    expect(cash.totalPaid).toBe(20);
    expect(cash.closing).toBe(cash.opening + 60 - 20);
    expect(cash.rows.at(-1)?.balance).toBe(cash.closing);

    const bank = buildBookStatement(entries, "bank", "2026-10-01", "2026-10-31");
    expect(bank.rows.map((row) => row.id)).toEqual(["bank-income"]);
    expect(bank.totalReceived).toBe(60);
    expect(bank.totalPaid).toBe(0);
  });
});
