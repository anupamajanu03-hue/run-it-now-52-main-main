import type { BankStatementImport, ImportedBankStatementRow } from "./bankStatementImport";

export type StatementRowReview = "matched" | "acknowledged";

export interface BankReconciliationDecision {
  statementId: string;
  rowReviews: Record<string, StatementRowReview>;
  explanation: string;
  completedAt?: string | undefined;
}

export function statementClosing(statement: BankStatementImport) {
  const rowsWithBalance = statement.rows
    .filter((row) => row.balance !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  const closingRow = rowsWithBalance.at(-1);
  return closingRow ? { date: closingRow.date, balance: closingRow.balance as number } : null;
}

export function bankBalanceDifference(statementBalance: number, financeBalance: number) {
  return statementBalance - financeBalance;
}

export function reconciliationRowStatus(
  row: ImportedBankStatementRow,
  decision: BankReconciliationDecision | undefined,
) {
  return decision?.rowReviews[row.rowKey] ?? "unmatched";
}

export function canCompleteReconciliation(
  statement: BankStatementImport,
  bookBalance: number | null,
  decision: BankReconciliationDecision | undefined,
) {
  const closing = statementClosing(statement);
  if (!closing || bookBalance === null) return false;
  const allRowsReviewed = statement.rows.every((row) => {
    const status = reconciliationRowStatus(row, decision);
    return status === "matched" || status === "acknowledged";
  });
  if (!allRowsReviewed) return false;
  return closing.balance === bookBalance || !!decision?.explanation.trim();
}
