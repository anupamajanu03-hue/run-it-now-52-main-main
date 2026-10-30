import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, SectionCard, SimpleSelect, StatCard, StatGrid } from "@/components/finance/common";
import { buildBookStatement } from "@/finance/books";
import {
  bankBalanceDifference,
  canCompleteReconciliation,
  reconciliationRowStatus,
  statementClosing,
  type BankReconciliationDecision,
} from "@/finance/bankReconciliation";
import type { BankStatementImport } from "@/finance/bankStatementImport";
import { formatDate, formatINR } from "@/finance/logic";
import type { LedgerEntry } from "@/finance/store";

const rowReviewOptions = [
  "Unreviewed",
  "Matched to recorded transaction",
  "Needs review — acknowledged",
];

export function BankStatementReconciliation({
  imports,
  entries,
  decisions,
  ready,
  onSaveDecision,
}: {
  imports: BankStatementImport[];
  entries: LedgerEntry[];
  decisions: Record<string, BankReconciliationDecision>;
  ready: boolean;
  onSaveDecision: (decision: BankReconciliationDecision) => boolean;
}) {
  const [selectedId, setSelectedId] = useState("");
  const statement = imports.find((item) => item.id === selectedId) ?? imports[0];
  const decision = statement ? decisions[statement.id] : undefined;
  const closing = statement ? statementClosing(statement) : null;
  const book = closing
    ? buildBookStatement(entries, "bank", closing.date, closing.date).closing
    : null;
  const difference = closing && book !== null ? bankBalanceDifference(closing.balance, book) : null;
  const complete = !!statement && !!decision?.completedAt;
  const canComplete = !!statement && canCompleteReconciliation(statement, book, decision);

  const save = (next: BankReconciliationDecision) => {
    if (!onSaveDecision(next)) {
      toast.error(
        "Could not save this review to browser storage. Check local storage availability.",
      );
      return false;
    }
    return true;
  };

  const updateRow = (rowKey: string, value: string) => {
    if (!statement || complete) return;
    const rowReviews = { ...(decision?.rowReviews ?? {}) };
    if (value === "Unreviewed") delete rowReviews[rowKey];
    else rowReviews[rowKey] = value === rowReviewOptions[1] ? "matched" : "acknowledged";
    save({
      statementId: statement.id,
      rowReviews,
      explanation: decision?.explanation ?? "",
    });
  };

  const updateExplanation = (explanation: string) => {
    if (!statement || complete) return;
    save({
      statementId: statement.id,
      rowReviews: decision?.rowReviews ?? {},
      explanation,
    });
  };

  const markReviewed = () => {
    if (!statement || !canComplete) return;
    if (
      save({
        statementId: statement.id,
        rowReviews: decision?.rowReviews ?? {},
        explanation: decision?.explanation ?? "",
        completedAt: new Date().toISOString(),
      })
    ) {
      toast.success(
        difference === 0
          ? "Bank reconciliation reviewed; balances match."
          : "Bank reconciliation reviewed with the difference acknowledged.",
      );
    }
  };

  return (
    <SectionCard title="Bank statement reconciliation — separate from cash settlement">
      <p className="mb-4 text-sm text-muted-foreground">
        Compare the Finance Bank Book balance with the closing balance from a statement downloaded
        separately from your bank. There is no automatic bank feed; the imported balance is only
        current through the uploaded statement date.
      </p>
      {!ready ? (
        <p className="text-sm text-muted-foreground">
          Loading saved statement imports and reconciliation reviews…
        </p>
      ) : imports.length === 0 ? (
        <Alert>
          <AlertTitle>No imported bank statements</AlertTitle>
          <AlertDescription>
            Import a CSV in Books &amp; Ledgers → Bank Book before starting reconciliation. Cash
            settlements remain separate.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          <Field label="Imported bank statement" htmlFor="bank-reconcile-statement">
            <select
              id="bank-reconcile-statement"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={statement?.id ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {imports.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fileName} · {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
                </option>
              ))}
            </select>
          </Field>
          {statement && (
            <>
              <p className="text-xs text-muted-foreground">
                {statement.fileName} · imported {formatDate(statement.importedAt.slice(0, 10))} ·
                statement period {formatDate(statement.periodStart)} –{" "}
                {formatDate(statement.periodEnd)}
              </p>
              {!closing ? (
                <Alert variant="destructive">
                  <AlertTitle>Statement closing balance unavailable</AlertTitle>
                  <AlertDescription>
                    This statement has no mapped running balance. Import a statement with a closing
                    balance before comparing account balances.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <StatGrid>
                    <StatCard
                      label="Finance Bank Book"
                      value={formatINR(book ?? 0)}
                      hint={`As of ${formatDate(closing.date)}`}
                    />
                    <StatCard
                      label="Statement closing balance"
                      value={formatINR(closing.balance)}
                      hint={`As of ${formatDate(closing.date)}`}
                    />
                    <StatCard
                      label="Difference (statement − Finance)"
                      value={difference === null ? "—" : formatINR(difference)}
                      tone={difference !== 0 ? "danger" : "success"}
                      hint={
                        difference === null
                          ? undefined
                          : difference > 0
                            ? "Statement balance is higher"
                            : difference < 0
                              ? "Finance balance is higher"
                              : "Balances agree"
                      }
                    />
                  </StatGrid>
                  <p className="text-xs text-muted-foreground">
                    Difference = imported statement closing balance − Finance Bank Book closing
                    balance. Both balances are compared as of {formatDate(closing.date)}; neither
                    value is adjusted.
                  </p>
                  {complete ? (
                    <Alert>
                      <AlertTitle>
                        {difference === 0
                          ? "Reconciliation reviewed — balances match"
                          : "Reconciliation reviewed — difference acknowledged"}
                      </AlertTitle>
                      <AlertDescription>
                        Reviewed{" "}
                        {decision?.completedAt ? formatDate(decision.completedAt.slice(0, 10)) : ""}
                        .{decision?.explanation ? ` Explanation: ${decision.explanation}` : ""}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      {difference !== 0 && (
                        <Field
                          label="Explanation for unresolved balance difference (required)"
                          htmlFor="bank-reconcile-explanation"
                        >
                          <Textarea
                            id="bank-reconcile-explanation"
                            rows={2}
                            value={decision?.explanation ?? ""}
                            onChange={(event) => updateExplanation(event.target.value)}
                            placeholder="Describe the discrepancy and why it is being acknowledged."
                          />
                        </Field>
                      )}
                      <div>
                        <h3 className="mb-1 text-sm font-semibold">
                          Statement rows requiring review
                        </h3>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Each row starts unmatched. Review it against Finance records, then mark it
                          matched or explicitly acknowledge that it still needs review. This does
                          not create transactions.
                        </p>
                        <div className="max-h-80 overflow-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Description / narration</TableHead>
                                <TableHead>Bank reference / UTR</TableHead>
                                <TableHead className="text-right">Debit</TableHead>
                                <TableHead className="text-right">Credit</TableHead>
                                <TableHead>Review status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {statement.rows.map((row) => {
                                const status = reconciliationRowStatus(row, decision);
                                const selected =
                                  status === "matched"
                                    ? (rowReviewOptions[1] ?? "Matched to recorded transaction")
                                    : status === "acknowledged"
                                      ? (rowReviewOptions[2] ?? "Needs review — acknowledged")
                                      : (rowReviewOptions[0] ?? "Unreviewed");
                                return (
                                  <TableRow key={row.rowKey}>
                                    <TableCell className="whitespace-nowrap">
                                      {formatDate(row.date)}
                                    </TableCell>
                                    <TableCell>{row.description}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                      {row.bankReference || "—"}
                                    </TableCell>
                                    <TableCell className="num text-right">
                                      {row.debit ? formatINR(row.debit) : "—"}
                                    </TableCell>
                                    <TableCell className="num text-right">
                                      {row.credit ? formatINR(row.credit) : "—"}
                                    </TableCell>
                                    <TableCell className="min-w-52">
                                      <SimpleSelect
                                        value={selected}
                                        onChange={(value) => updateRow(row.rowKey, value)}
                                        options={rowReviewOptions}
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          {
                            statement.rows.filter(
                              (row) => reconciliationRowStatus(row, decision) === "unmatched",
                            ).length
                          }{" "}
                          unmatched row(s) remain.
                        </p>
                        <Button
                          type="button"
                          disabled={!ready || !canComplete}
                          onClick={markReviewed}
                        >
                          Mark reconciliation reviewed
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
