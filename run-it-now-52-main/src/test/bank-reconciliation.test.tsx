import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { BankStatementReconciliation } from "@/components/finance/BankStatementReconciliation";
import {
  bankBalanceDifference,
  canCompleteReconciliation,
  statementClosing,
  type BankReconciliationDecision,
} from "@/finance/bankReconciliation";
import type { BankStatementImport } from "@/finance/bankStatementImport";
import { buildBookStatement } from "@/finance/books";
import { FinanceProvider, useFinance } from "@/finance/store";

const statement: BankStatementImport = {
  id: "statement-1",
  fileName: "october.csv",
  importedAt: "2026-10-29T10:00:00.000Z",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-29",
  rows: [
    {
      rowKey: "row-1",
      date: "2026-10-28",
      description: "Recorded transfer",
      bankReference: "UTR-101",
      debit: 0,
      credit: 500,
      balance: 1000,
    },
    {
      rowKey: "row-2",
      date: "2026-10-29",
      description: "Unmatched deposit",
      bankReference: "UTR-102",
      debit: 0,
      credit: 250,
      balance: 1250,
    },
  ],
};

function completeDecision(
  overrides: Partial<BankReconciliationDecision> = {},
): BankReconciliationDecision {
  return {
    statementId: statement.id,
    rowReviews: { "row-1": "matched", "row-2": "acknowledged" },
    explanation: "Deposit is pending entry review.",
    ...overrides,
  };
}

describe("bank statement reconciliation", () => {
  it("uses the last available statement closing balance and its date", () => {
    expect(statementClosing(statement)).toEqual({ date: "2026-10-29", balance: 1250 });
    expect(buildBookStatement([], "bank", "2026-10-29", "2026-10-29").closing).toBeGreaterThan(0);
  });

  it("permits matching balances once every statement row is reviewed", () => {
    const matching = { ...statement, rows: statement.rows.slice(0, 1) };
    const decision = {
      ...completeDecision(),
      rowReviews: { "row-1": "matched" as const },
      explanation: "",
    };
    expect(bankBalanceDifference(1000, 1000)).toBe(0);
    expect(bankBalanceDifference(1250, 1000)).toBe(250);
    expect(bankBalanceDifference(1000, 1250)).toBe(-250);
    expect(canCompleteReconciliation(matching, 1000, decision)).toBe(true);
    expect(canCompleteReconciliation(matching, 1001, decision)).toBe(false);
  });

  it("blocks missing statements, missing closing balances, and unresolved rows", () => {
    expect(canCompleteReconciliation(statement, null, completeDecision())).toBe(false);
    expect(
      statementClosing({ ...statement, rows: [{ ...statement.rows[0]!, balance: undefined }] }),
    ).toBeNull();
    expect(canCompleteReconciliation(statement, 1250, undefined)).toBe(false);
    expect(
      canCompleteReconciliation(statement, 1000, {
        ...completeDecision(),
        rowReviews: { "row-1": "matched" as const },
      }),
    ).toBe(false);
  });

  it("requires an explanation to acknowledge a difference, then allows completion", () => {
    expect(
      canCompleteReconciliation(statement, 1000, { ...completeDecision(), explanation: "" }),
    ).toBe(false);
    expect(canCompleteReconciliation(statement, 1000, completeDecision())).toBe(true);
  });

  it("shows a clear empty state if no statement has been imported", () => {
    render(
      <BankStatementReconciliation
        imports={[]}
        entries={[]}
        decisions={{}}
        ready
        onSaveDecision={() => true}
      />,
    );
    expect(screen.getByText("No imported bank statements")).toBeInTheDocument();
  });

  it("completes reconciliation only after reviewed rows and saves the completed state", async () => {
    function Harness() {
      const [decision, setDecision] = useState(completeDecision());
      return (
        <BankStatementReconciliation
          imports={[statement]}
          entries={[]}
          decisions={{ [statement.id]: decision }}
          ready
          onSaveDecision={(next) => {
            setDecision(next);
            return true;
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Mark reconciliation reviewed" }));
    expect(
      await screen.findByText("Reconciliation reviewed — difference acknowledged"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Deposit is pending entry review/)).toBeInTheDocument();
  });

  it("persists bank review decisions in local browser storage", async () => {
    const key = "finance-bank-reconciliation-v1";
    localStorage.removeItem(key);
    function Harness() {
      const { bankReconciliationLoaded, saveBankReconciliationDecision } = useFinance();
      return (
        <button
          disabled={!bankReconciliationLoaded}
          onClick={() => saveBankReconciliationDecision(completeDecision())}
        >
          Save review
        </button>
      );
    }

    render(
      <FinanceProvider>
        <Harness />
      </FinanceProvider>,
    );
    const button = await screen.findByRole("button", { name: "Save review" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(JSON.parse(localStorage.getItem(key) ?? "{}")[statement.id]).toMatchObject({
      rowReviews: { "row-1": "matched", "row-2": "acknowledged" },
    });
    localStorage.removeItem(key);
  });
});
