import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceProvider, useLedgerEntries } from "@/finance/store";
import { Book } from "@/routes/ledgers";

function BookHarness({
  kind,
  account = "all",
}: {
  kind: "cash" | "bank" | "general";
  account?: string;
}) {
  const entries = useLedgerEntries();
  return (
    <Book
      kind={kind}
      entries={entries}
      q=""
      setQ={() => {}}
      from="2026-04-01"
      to="2026-10-29"
      setRange={() => {}}
      account={account}
      setAccount={() => {}}
      ledgerOptions={["Student Fees"]}
    />
  );
}

function renderBook(kind: "cash" | "bank" | "general", account = "all") {
  return render(
    <FinanceProvider>
      <BookHarness kind={kind} account={account} />
    </FinanceProvider>,
  );
}

function transactionIdCell(row: HTMLElement) {
  return within(row).getAllByRole("cell")[1]?.textContent?.trim() ?? "";
}

function ledgerRowContaining(text: string) {
  const row = screen.getByText(text).closest("tr");
  if (!row) throw new Error(`Could not find table row containing ${text}`);
  return row;
}

describe("Transaction IDs across ledger books", () => {
  it.each([
    [
      "cash",
      "MNT-04",
      "all",
      [
        "Date",
        "Transaction ID",
        "Particulars",
        "Ledger Name",
        "Receipt No.",
        "Debit",
        "Credit",
        "Balance",
      ],
    ],
    [
      "bank",
      "SAL-04",
      "all",
      [
        "Date",
        "Transaction ID",
        "Particulars",
        "Type",
        "Receipt No.",
        "Debit",
        "Credit",
        "Balance",
      ],
    ],
    [
      "general",
      "SAL-04",
      "Salaries",
      [
        "Date",
        "Transaction ID",
        "Ledger Name",
        "Particulars",
        "Payment Mode",
        "Reference",
        "Debit",
        "Credit",
        "Balance",
      ],
    ],
  ] as const)(
    "shows an ID after Date in the %s book without removing or reordering existing columns",
    (kind, rowText, account, expectedHeaders) => {
      renderBook(kind, account);
      const headers = screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim());
      expect(headers).toEqual(expectedHeaders);

      const row = ledgerRowContaining(rowText);
      expect(transactionIdCell(row)).toMatch(/^T/);
      expect(within(row).getByText(rowText)).toBeInTheDocument();
    },
  );

  it("uses the same transaction ID in Cash Book and General Ledger", () => {
    const cash = renderBook("cash");
    const cashRow = ledgerRowContaining("MNT-04");
    const cashId = transactionIdCell(cashRow);
    cash.unmount();

    renderBook("general", "Maintenance");
    const generalRow = ledgerRowContaining("MNT-04");
    expect(transactionIdCell(generalRow)).toBe(cashId);
  });

  it("uses the same transaction ID in Bank Book and General Ledger", () => {
    const bank = renderBook("bank");
    const bankRow = ledgerRowContaining("SAL-04");
    const bankId = transactionIdCell(bankRow);
    bank.unmount();

    renderBook("general", "Salaries");
    const generalRow = ledgerRowContaining("SAL-04");
    expect(transactionIdCell(generalRow)).toBe(bankId);
  });
});
