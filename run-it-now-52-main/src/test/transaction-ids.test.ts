import { describe, expect, it } from "vitest";
import { ensureTransactionIds } from "@/finance/transactionIds";
import type { Transaction } from "@/finance/types";

const record = (overrides: Partial<Transaction> = {}): Omit<Transaction, "id"> & { id?: string } => ({
  type: "income",
  date: "2026-10-28",
  description: "Bank deposit",
  category: "Other",
  amount: 100,
  method: "UPI",
  reference: "BANK-001",
  status: "Posted",
  ...overrides,
});

describe("transaction IDs", () => {
  it("preserves existing IDs and deterministically assigns unique IDs to legacy records", () => {
    const records = [
      record({ id: "T010" }),
      record({ description: "First legacy deposit" }),
      record({ description: "Second legacy deposit" }),
      record({ id: "T010", description: "Duplicate ID record" }),
    ];

    const firstMigration = ensureTransactionIds(records);
    const secondMigration = ensureTransactionIds(records);

    expect(firstMigration.map((item) => item.id)).toEqual(secondMigration.map((item) => item.id));
    expect(firstMigration[0]?.id).toBe("T010");
    expect(new Set(firstMigration.map((item) => item.id)).size).toBe(records.length);
    expect(firstMigration.slice(1).every((item) => item.id.startsWith("T-LEGACY-"))).toBe(true);
  });
});
