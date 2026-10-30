import { useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, SimpleSelect } from "@/components/finance/common";
import {
  type BankStatementField,
  type BankStatementImport as BankStatementImportRecord,
  type BankStatementMapping,
  type ImportedBankStatementRow,
  parseBankStatementCsv,
  suggestBankStatementMapping,
  validateBankStatementRows,
} from "@/finance/bankStatementImport";
import { formatDate, formatINR } from "@/finance/logic";

const fieldLabels: Record<BankStatementField, string> = {
  date: "Date *",
  description: "Description / narration *",
  bankReference: "Bank reference / UTR (optional)",
  debit: "Debit (one amount column required)",
  credit: "Credit (one amount column required)",
  balance: "Running balance (optional)",
};

const fields: BankStatementField[] = [
  "date",
  "description",
  "bankReference",
  "debit",
  "credit",
  "balance",
];

export function BankStatementImport({
  imports,
  onImport,
  ready = true,
}: {
  imports: BankStatementImportRecord[];
  onImport: (statement: BankStatementImportRecord) => boolean;
  ready?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseBankStatementCsv> | null>(null);
  const [mapping, setMapping] = useState<BankStatementMapping | null>(null);
  const [fileError, setFileError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const priorRows = useMemo(() => imports.flatMap((statement) => statement.rows), [imports]);
  const validation =
    parsed && mapping
      ? validateBankStatementRows(parsed, mapping, priorRows)
      : { rows: [] as ImportedBankStatementRow[], errors: [] as string[], duplicateCount: 0 };

  const reset = () => {
    setOpen(false);
    setFileName("");
    setParsed(null);
    setMapping(null);
    setFileError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const selectFile = async (file: File | undefined) => {
    setFileError("");
    setParsed(null);
    setMapping(null);
    if (!file) return;
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError(
        "Unsupported file format. Select a CSV statement; XLSX and PDF are not supported.",
      );
      return;
    }
    try {
      const content =
        typeof file.text === "function"
          ? await file.text()
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                typeof reader.result === "string"
                  ? resolve(reader.result)
                  : reject(new Error("The selected file could not be decoded as text."));
              reader.onerror = () => reject(new Error("The selected CSV file could not be read."));
              reader.readAsText(file);
            });
      const result = parseBankStatementCsv(content);
      setParsed(result);
      setMapping(suggestBankStatementMapping(result.headers));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The CSV file could not be read.");
    }
  };

  const confirmImport = () => {
    if (!parsed || !mapping || validation.errors.length || !validation.rows.length) return;
    const dates = validation.rows.map((row) => row.date).sort();
    const statement: BankStatementImportRecord = {
      id: `BSI-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      fileName,
      importedAt: new Date().toISOString(),
      periodStart: dates[0]!,
      periodEnd: dates.at(-1)!,
      rows: validation.rows,
    };
    if (!onImport(statement)) {
      toast.error(
        "The statement could not be saved to this browser. Check local storage availability and try again.",
      );
      return;
    }
    toast.success(`${statement.rows.length} statement rows imported for reconciliation.`);
    reset();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!ready}
        onClick={() => setOpen(true)}
      >
        <Upload className="mr-1.5 h-4 w-4" />
        Import Bank Statement
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && reset()}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[94vw] max-w-5xl flex-col overflow-hidden p-4 sm:max-h-[90vh] sm:p-6">
          <DialogHeader>
            <DialogTitle>Import Bank Statement</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Import a downloaded CSV only. Rows are staged for reconciliation and do not create
              transactions or change balances.
            </p>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto">
            <Field label="Bank statement file (CSV)" htmlFor="bank-statement-file">
              <Input
                ref={inputRef}
                id="bank-statement-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void selectFile(event.target.files?.[0])}
              />
            </Field>
            {fileError && (
              <p role="alert" className="text-sm text-destructive">
                {fileError}
              </p>
            )}
            {parsed && mapping && (
              <>
                <section aria-label="Statement column mapping" className="space-y-3">
                  <h3 className="text-sm font-semibold">Map statement columns</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {fields.map((field) => (
                      <Field key={field} label={fieldLabels[field]} htmlFor={`bank-map-${field}`}>
                        <SimpleSelect
                          id={`bank-map-${field}`}
                          value={mapping[field]}
                          placeholder="Not mapped"
                          onChange={(value) =>
                            setMapping((current) =>
                              current ? { ...current, [field]: value } : current,
                            )
                          }
                          options={parsed.headers}
                        />
                      </Field>
                    ))}
                  </div>
                </section>
                <section aria-label="Statement preview" className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    Preview: {fileName} ({parsed.records.length} rows)
                  </h3>
                  {validation.errors.length > 0 && (
                    <div
                      role="alert"
                      className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                    >
                      <p className="mb-1 font-medium">Resolve these issues before importing:</p>
                      <ul className="list-inside list-disc space-y-0.5">
                        {validation.errors.slice(0, 8).map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                      {validation.errors.length > 8 && (
                        <p className="mt-1">And {validation.errors.length - 8} more issue(s).</p>
                      )}
                    </div>
                  )}
                  {validation.duplicateCount > 0 && (
                    <p className="text-sm text-destructive">
                      {validation.duplicateCount} duplicate row(s) detected; this import is blocked
                      to prevent double counting.
                    </p>
                  )}
                  <div className="max-h-64 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description / narration</TableHead>
                          <TableHead>Bank reference / UTR</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                          <TableHead className="text-right">Running balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validation.rows.map((row) => (
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
                            <TableCell className="num text-right">
                              {row.balance === undefined ? "—" : formatINR(row.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {validation.rows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              No valid rows to preview.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              </>
            )}
          </div>
          <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={reset}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmImport}
              disabled={!parsed || !validation.rows.length || validation.errors.length > 0}
            >
              Confirm import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ImportedStatementList({ imports }: { imports: BankStatementImportRecord[] }) {
  if (!imports.length) return null;
  return (
    <section aria-label="Imported statements" className="mb-4 space-y-2">
      <h3 className="text-sm font-semibold">Imported statements — staged for reconciliation</h3>
      {imports.map((statement) => (
        <details key={statement.id} className="overflow-hidden rounded-md border">
          <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">{statement.fileName}</span>
            <span>{formatDate(statement.importedAt.slice(0, 10))} imported</span>
            <span>
              Period: {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}
            </span>
            <span>{statement.rows.length} rows</span>
          </summary>
          <div className="max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description / narration</TableHead>
                  <TableHead>Bank reference / UTR</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Running balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.rows.map((row) => (
                  <TableRow key={row.rowKey}>
                    <TableCell>{formatDate(row.date)}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell className="font-mono text-xs">{row.bankReference || "—"}</TableCell>
                    <TableCell className="num text-right">
                      {row.debit ? formatINR(row.debit) : "—"}
                    </TableCell>
                    <TableCell className="num text-right">
                      {row.credit ? formatINR(row.credit) : "—"}
                    </TableCell>
                    <TableCell className="num text-right">
                      {row.balance === undefined ? "—" : formatINR(row.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      ))}
    </section>
  );
}
