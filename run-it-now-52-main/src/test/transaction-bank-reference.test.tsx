import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceProvider, useFinance } from "@/finance/store";
import type { Transaction } from "@/finance/types";

function TransactionHarness() {
  const { transactions, saveTransaction } = useFinance();
  const create = (description: string, receiptNo: string, bankReference?: string) =>
    saveTransaction({
      type: "income",
      date: "2026-10-29",
      description,
      category: "Miscellaneous Income",
      amount: 100,
      method: "UPI",
      reference: receiptNo,
      receiptNo,
      bankReference,
      status: "Posted",
    });
  const update = (description: string, bankReference?: string) => {
    const transaction = transactions.find((item) => item.description === description);
    if (!transaction) throw new Error(`Missing transaction: ${description}`);
    return saveTransaction({ ...transaction, bankReference });
  };

  return (
    <>
      <button onClick={() => create("Without bank reference", "TEST-RCP-001")}>Create without reference</button>
      <button onClick={() => create("With bank reference", "TEST-RCP-002", "  UTR-EXACT-002  ")}>
        Create with reference
      </button>
      <button onClick={() => update("With bank reference", "UTR-UPDATED-002")}>Edit with reference</button>
      <button onClick={() => update("Without bank reference", "UTR-ADDED-001")}>Edit without reference</button>
      <output data-testid="transactions">{JSON.stringify(transactions)}</output>
    </>
  );
}

function readTransactions() {
  return JSON.parse(screen.getByTestId("transactions").textContent ?? "[]") as Transaction[];
}

describe("transaction bank references", () => {
  it("creates and edits optional bank references without changing transaction or receipt IDs", () => {
    render(
      <FinanceProvider>
        <TransactionHarness />
      </FinanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create without reference" }));
    fireEvent.click(screen.getByRole("button", { name: "Create with reference" }));
    let records = readTransactions();
    const withoutReference = records.find((item) => item.receiptNo === "TEST-RCP-001");
    const withReference = records.find((item) => item.receiptNo === "TEST-RCP-002");

    expect(withoutReference?.bankReference).toBeUndefined();
    expect(withReference?.bankReference).toBe("  UTR-EXACT-002  ");
    expect(withReference?.reference).toBe("TEST-RCP-002");
    expect(withReference?.id).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit with reference" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit without reference" }));
    records = readTransactions();

    const editedWithoutReference = records.find((item) => item.receiptNo === "TEST-RCP-001");
    const editedWithReference = records.find((item) => item.receiptNo === "TEST-RCP-002");
    expect(editedWithoutReference?.bankReference).toBe("UTR-ADDED-001");
    expect(editedWithReference?.bankReference).toBe("UTR-UPDATED-002");
    expect(editedWithoutReference?.id).toBe(withoutReference?.id);
    expect(editedWithReference?.id).toBe(withReference?.id);
    expect(editedWithoutReference?.receiptNo).toBe("TEST-RCP-001");
    expect(editedWithReference?.receiptNo).toBe("TEST-RCP-002");
    expect(editedWithoutReference?.reference).toBe("TEST-RCP-001");
    expect(editedWithReference?.reference).toBe("TEST-RCP-002");
  });
});
