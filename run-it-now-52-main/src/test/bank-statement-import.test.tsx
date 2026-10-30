import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  BankStatementImport,
  ImportedStatementList,
} from "@/components/finance/BankStatementImport";
import {
  parseBankStatementCsv,
  suggestBankStatementMapping,
  validateBankStatementRows,
  type BankStatementImport as BankStatementImportRecord,
} from "@/finance/bankStatementImport";
import { FinanceProvider, useFinance } from "@/finance/store";

const validCsv = [
  "Date,Narration,UTR No.,Debit,Credit,Balance",
  "2026-10-28,Office supplies,  UTR-551  ,,1250,25000",
].join("\n");

function ImportHarness() {
  const [imports, setImports] = useState<BankStatementImportRecord[]>([]);
  return (
    <>
      <BankStatementImport
        imports={imports}
        onImport={(statement) => {
          setImports((current) => [...current, statement]);
          return true;
        }}
      />
      <ImportedStatementList imports={imports} />
      <output data-testid="import-count">{imports.length}</output>
      <output data-testid="imported-data">{JSON.stringify(imports)}</output>
    </>
  );
}

function FinanceImportHarness() {
  const {
    bankStatementImports,
    bankStatementImportsLoaded,
    addBankStatementImport,
    transactions,
    balances,
  } = useFinance();
  return (
    <>
      <BankStatementImport
        imports={bankStatementImports}
        onImport={addBankStatementImport}
        ready={bankStatementImportsLoaded}
      />
      <ImportedStatementList imports={bankStatementImports} />
      <output data-testid="finance-import-data">{JSON.stringify(bankStatementImports)}</output>
      <output data-testid="transaction-count">{transactions.length}</output>
      <output data-testid="bank-balance">{balances.bank}</output>
    </>
  );
}

async function selectCsv(content: string, name = "statement.csv") {
  const input = screen.getByLabelText("Bank statement file (CSV)");
  fireEvent.change(input, {
    target: { files: [new File([content], name, { type: "text/csv" })] },
  });
  await waitFor(() => {
    expect(screen.queryByText(/Preview:/) || screen.queryByRole("alert")).toBeTruthy();
  });
}

describe("Bank statement import flow", () => {
  it("previews CSV without importing and can cancel", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv);
    expect(await screen.findByText("Office supplies")).toBeInTheDocument();
    expect(screen.getByText("UTR-551")).toBeInTheDocument();
    expect(screen.getByTestId("import-count")).toHaveTextContent("0");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("import-count")).toHaveTextContent("0");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms imported statement rows separately from transactions", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv);
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));

    expect(
      await screen.findByText("Imported statements — staged for reconciliation"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("import-count")).toHaveTextContent("1");
    expect(screen.getByText("statement.csv")).toBeInTheDocument();
    expect(screen.getByText("1 rows")).toBeInTheDocument();
    expect(
      JSON.parse(screen.getByTestId("imported-data").textContent ?? "[]")[0].rows[0],
    ).toMatchObject({
      date: "2026-10-28",
      description: "Office supplies",
      bankReference: "  UTR-551  ",
      debit: 0,
      credit: 1250,
      balance: 25000,
    });
  });

  it("rejects unsupported and malformed CSV files", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv, "statement.xlsx");
    expect(screen.getByRole("alert")).toHaveTextContent("Unsupported file format");

    await selectCsv('Date,Description\n2026-10-28,"unfinished');
    expect(await screen.findByRole("alert")).toHaveTextContent("unclosed quoted field");
    await selectCsv("");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "empty or contains no statement rows",
    );
    await selectCsv("Date,Description,Debit\n2026-10-28,Office supplies");
    expect(await screen.findByRole("alert")).toHaveTextContent("expected 3");
    expect(screen.getByTestId("import-count")).toHaveTextContent("0");
  });

  it("blocks missing required amount columns and invalid dates or amounts", async () => {
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv("Date,Narration\n2026-10-28,Office supplies");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Map at least one required amount column",
    );
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();

    await selectCsv("Date,Narration,Debit,Credit\n31/02/2026,Office supplies,invalid,");
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or missing date");
    expect(screen.getByRole("alert")).toHaveTextContent("not a valid amount");
  });

  it("blocks duplicate rows from the same file and repeat imports", async () => {
    const duplicateCsv = [
      "Date,Narration,UTR No.,Debit,Credit",
      "2026-10-28,Office supplies,UTR-551,1250,",
      "2026-10-28,Office supply items,UTR-551,1200,",
    ].join("\n");
    render(<ImportHarness />);
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(duplicateCsv);
    expect(await screen.findByText(/duplicate row\(s\) detected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv);
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
    fireEvent.click(screen.getByRole("button", { name: /Import Bank Statement/ }));
    await selectCsv(validCsv);
    expect(await screen.findByText(/duplicate row\(s\) detected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
    expect(screen.getByTestId("import-count")).toHaveTextContent("1");
  });

  it("allows manual mapping for unfamiliar headers", () => {
    const parsed = parseBankStatementCsv("Booked,Memo,Outflow,Inflow\n2026-10-28,Transfer,450,");
    const mapping = {
      ...suggestBankStatementMapping(parsed.headers),
      date: "Booked",
      description: "Memo",
      debit: "Outflow",
    };
    const validation = validateBankStatementRows(parsed, mapping);
    expect(validation.errors).toEqual([]);
    expect(validation.rows[0]).toMatchObject({
      date: "2026-10-28",
      description: "Transfer",
      debit: 450,
      credit: 0,
    });
  });

  it("persists confirmed imported rows in browser storage without changing transactions or balances", async () => {
    const storageKey = Object.keys(localStorage).find((key) =>
      key.includes("bank-statement-imports"),
    );
    if (storageKey) localStorage.removeItem(storageKey);
    const firstRender = render(
      <FinanceProvider>
        <FinanceImportHarness />
      </FinanceProvider>,
    );
    const importButton = await screen.findByRole("button", { name: /Import Bank Statement/ });
    await waitFor(() => expect(importButton).toBeEnabled());
    const initialTransactions = screen.getByTestId("transaction-count").textContent;
    const initialBalance = screen.getByTestId("bank-balance").textContent;
    fireEvent.click(importButton);
    await selectCsv(validCsv);
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
    expect(
      await screen.findByText("Imported statements — staged for reconciliation"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("transaction-count")).toHaveTextContent(initialTransactions ?? "");
    expect(screen.getByTestId("bank-balance")).toHaveTextContent(initialBalance ?? "");
    expect(Object.keys(localStorage).some((key) => key.includes("bank-statement-imports"))).toBe(
      true,
    );

    firstRender.unmount();
    render(
      <FinanceProvider>
        <FinanceImportHarness />
      </FinanceProvider>,
    );
    expect(
      await screen.findByText("Imported statements — staged for reconciliation"),
    ).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId("finance-import-data").textContent ?? "[]")).toHaveLength(
      1,
    );
    const persistedKey = Object.keys(localStorage).find((key) =>
      key.includes("bank-statement-imports"),
    );
    if (persistedKey) localStorage.removeItem(persistedKey);
  });
});
