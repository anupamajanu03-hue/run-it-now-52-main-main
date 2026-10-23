import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Eye, Pencil, Plus, Check, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ConfirmDialog, DateRange, EmptyState, Field, FilterBar, FilterSelect, PageHeader, SampleNote, SearchBox,
  SectionCard, SimpleSelect, StatCard, StatGrid, StatusBadge, tabSearch,
} from "@/components/finance/common";
import { useFinance, useLedgerEntries, type LedgerEntry } from "@/finance/store";
import { TODAY, formatDate, formatINR, inRange, sum } from "@/finance/logic";
import {
  INCOME_PAYMENT_METHODS, PAYMENT_MODES,
  type PaymentMethod, type PaymentMode, type Transaction,
} from "@/finance/types";
import { useEnterToNext } from "@/hooks/use-enter-to-next";

export const Route = createFileRoute("/transactions")({
  validateSearch: (s: Record<string, unknown>): { tab?: string; add?: "income" | "expense" } => ({
    ...tabSearch(s),
    add: s.add === "income" || s.add === "expense" ? s.add : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Daily Transactions â€” Finance & Accounts" },
      { name: "description", content: "Record and review daily income and expense transactions." },
      { property: "og:title", content: "Daily Transactions â€” Finance & Accounts" },
      { property: "og:description", content: "Record and review daily income and expense transactions." },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { tab = "income", add } = Route.useSearch();
  const navigate = Route.useNavigate();
  const entries = useLedgerEntries();
  const { settings, approveTransaction, transactions } = useFinance();
  const [view, setView] = useState<"income" | "expense">(tab === "expense" ? "expense" : "income");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState(TODAY);
  const [cat, setCat] = useState("all");
  const [paymentMode, setPaymentMode] = useState("all");
  const [editing, setEditing] = useState<{ type: "income" | "expense"; txn?: Transaction | undefined } | null>(null);
  const [viewing, setViewing] = useState<LedgerEntry | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    if (add !== "income" && add !== "expense") return;
    setView(add);
    setEditing({ type: add });
    void navigate({ search: (previous) => ({ ...previous, add: undefined }), replace: true });
  }, [add, navigate]);

  const ranged = entries.filter((e) => inRange(e.date, from, to));
  const rows = ranged.filter((e) =>
    e.type === view &&
    (cat === "all" || e.category === cat) &&
    (paymentMode === "all" || ("paymentMode" in e && e.paymentMode === paymentMode)) &&
    (!q || `${e.description} ${e.reference}`.toLowerCase().includes(q.toLowerCase())));
  const selectedEntries = ranged.filter((e) => e.type === view);
  const total = sum(selectedEntries.map((e) => e.amount));
  const ledgerOptions = view === "income" ? settings.incomeCategories : settings.expenseCategories;

  return (
    <>
      <PageHeader crumbs={["Daily Transactions", view === "income" ? "Income" : "Expenses"]} title="Daily Transactions"
        center={<Tabs value={view} onValueChange={(v) => {
          if (v === "income" || v === "expense") { setView(v); setCat("all"); }
        }}>
          <TabsList className="grid h-9 w-full max-w-[300px] grid-cols-2">
            <TabsTrigger value="income" className="text-xs font-semibold tracking-wide">INCOME</TabsTrigger>
            <TabsTrigger value="expense" className="text-xs font-semibold tracking-wide">EXPENSES</TabsTrigger>
          </TabsList>
        </Tabs>}
        actions={<>
          {view === "income" ? (
            <Button size="sm" onClick={() => setEditing({ type: "income" })}><Plus className="mr-1 h-4 w-4" />Add Income</Button>
          ) : (
            <Button size="sm" onClick={() => setEditing({ type: "expense" })}><Plus className="mr-1 h-4 w-4" />Add Expense            </Button>
          )}
        </>} />
      <SampleNote />
      <StatGrid className="mb-4">
        <StatCard label={view === "income" ? "Total Income" : "Total Expenses"} value={formatINR(total)}
          tone={view === "income" ? "success" : "danger"}
          hint={view === "income" ? "Includes student fee payments" : undefined} />
        <StatCard label={view === "income" ? "Income Entries" : "Expense Entries"} value={String(selectedEntries.length)} />
      </StatGrid>
      <SectionCard>
        <FilterBar>
          <SearchBox value={q} onChange={setQ} placeholder="Search description, ledger name or reference" />
          <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <FilterSelect label="Ledger Name" allLabel="All ledger names" value={cat} onChange={setCat} options={ledgerOptions} />
          <FilterSelect label="Payment modes" value={paymentMode} onChange={setPaymentMode}
            options={[...PAYMENT_MODES]} all="All" />
        </FilterBar>
        {rows.length === 0 ? <EmptyState /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Ledger Name</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow
                  key={e.id}
                  onRowClick={() => setViewing(e)}
                  rowLabel={`View transaction: ${e.description}`}
                >
                  <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell>{e.category}</TableCell>
                  <TableCell className={`num whitespace-nowrap text-right font-medium ${e.type === "income" ? "text-success" : "text-destructive"}`}>
                    {e.type === "income" ? "+" : "âˆ’"}{formatINR(e.amount)}
                  </TableCell>
                  <TableCell>{e.method}</TableCell>
                  <TableCell className="num text-xs">{e.reference || "â€”"}</TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon" aria-label="View" onClick={() => setViewing(e)}><Eye className="h-4 w-4" /></Button>
                    {e.source === "txn" ? (
                      <Button variant="ghost" size="icon" aria-label="Edit"
                        onClick={() => setEditing({ type: e.type, txn: transactions.find((t) => t.id === e.id) })}><Pencil className="h-4 w-4" /></Button>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Button variant="ghost" size="icon" aria-label="Edit (not available)" disabled><Pencil className="h-4 w-4" /></Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Fee payments are managed from Student Fees, not here</TooltipContent>
                      </Tooltip>
                    )}
                    {e.source === "txn" && e.status === "Pending" && (
                      <Button variant="ghost" size="icon" aria-label="Approve" onClick={() => setApproving(e.id)}><Check className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {editing && <TxnDialog key={editing.txn?.id ?? editing.type} {...editing} onClose={() => setEditing(null)} />}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transaction details</DialogTitle></DialogHeader>
          {viewing && (<>
              <div className="print-area transaction-print rounded-md border bg-card p-5 text-sm">
                <p className="mb-1 text-center font-semibold">{settings.institution.name}</p>
                <h2 className="mb-4 border-b pb-3 text-center text-base font-semibold">Transaction details</h2>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Receipt No.", ("receiptNo" in viewing && viewing.receiptNo) || viewing.reference || "—"],
                    ["Date", formatDate(viewing.date)],
                    ["Type", viewing.type === "income" ? "Income" : "Expense"],
                    ["Ledger Name", viewing.category],
                    ...(("to" in viewing && viewing.to) ? [["To", viewing.to]] : []),
                    ["Description", viewing.description],
                    ["Payment Method", viewing.method],
                    ...(("paymentMode" in viewing && viewing.paymentMode) ? [["Payment Mode", viewing.paymentMode]] : []),
                    ["Amount", formatINR(viewing.amount)],
                    ["Status", viewing.status],
                    [
                      "Source",
                      viewing.source === "fee" ? "Student Fees (read-only here)" : "Manual entry",
                    ],
                  ].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
                </dl>
                <div className="mt-10 flex justify-end text-xs">
                  <span className="border-t px-8 pt-1">Authorised signature</span>
                </div>
              </div>
              <DialogFooter className="no-print">
                <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" />Print</Button>
                <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
              </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)} title="Approve transaction?"
        description="This marks the sample transaction as approved." confirmLabel="Approve"
        onConfirm={() => { if (approving) approveTransaction(approving); setApproving(null); toast.success("Transaction approved"); }} />
    </>
  );
}

function TxnDialog({ type, txn, onClose }: { type: "income" | "expense"; txn?: Transaction | undefined; onClose: () => void }) {
  const { settings, saveTransaction, payments, transactions } = useFinance();
  const submitting = useRef(false);
  const nextIncomeReceiptNo = () => {
    const used = new Set([
      ...payments.map((p) => p.receiptNo),
      ...transactions.flatMap((t) => [t.receiptNo, t.reference].filter((r): r is string => !!r)),
    ]);
    let next = settings.receipt.next;
    while (used.has(`${settings.receipt.prefix}${next}`)) next += 1;
    return `${settings.receipt.prefix}${next}`;
  };
  const nextExpenseReceiptNo = () => {
    const used = new Set([
      ...payments.map((p) => p.receiptNo),
      ...transactions.flatMap((t) => [t.receiptNo, t.reference].filter((r): r is string => !!r)),
    ]);
    let next = 1;
    while (used.has(`EXP-2026-${String(next).padStart(4, "0")}`)) next += 1;
    return `EXP-2026-${String(next).padStart(4, "0")}`;
  };
  const [f, setF] = useState(() => ({
    date: txn?.date ?? TODAY,
    amount: txn ? String(txn.amount) : "",
    category: txn?.category ?? "",
    method: (txn?.method ?? "") as PaymentMethod | "",
    description: txn?.description ?? "",
    receiptNo: txn?.receiptNo ?? txn?.reference ?? (type === "income" ? nextIncomeReceiptNo() : nextExpenseReceiptNo()),
    to: txn?.to ?? "",
    paymentMode: txn?.paymentMode ?? ("" as PaymentMode | ""),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const onEnterKeyDown = useEnterToNext();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const cats = type === "income" ? settings.incomeCategories : settings.expenseCategories;
  const methods = txn?.method === "Card" ? [...INCOME_PAYMENT_METHODS, "Card"] : INCOME_PAYMENT_METHODS;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const e: Record<string, string> = {};
    if (!f.date) e['date'] = "Date is required";
    if (!Number.isFinite(Number(f.amount)) || !(Number(f.amount) > 0)) e['amount'] = "Enter an amount greater than zero";
    if (!f.category) e['category'] = "Choose a category";
    if (!f.method) e['method'] = "Choose a payment method";
    if (type === "income" && !f.description.trim()) e['description'] = "Description is required";
    if (type === "expense" && !f.to.trim()) e['to'] = "Enter who was paid";
    if (!f.receiptNo.trim()) e['receiptNo'] = "Receipt number is required";
    if (type === "income") {
      if (!f.to.trim()) e['to'] = "To is required";
      if (!f.paymentMode) e['paymentMode'] = "Choose a payment mode";
      if (f.receiptNo && (payments.some((p) => p.receiptNo === f.receiptNo) ||
        transactions.some((t) => t.id !== txn?.id && (t.receiptNo === f.receiptNo || t.reference === f.receiptNo)))) {
        e['receiptNo'] = "Receipt number already exists";
      }
    } else {
      if (!f.paymentMode) e['paymentMode'] = "Choose a payment mode";
      if (f.receiptNo && (payments.some((p) => p.receiptNo === f.receiptNo) ||
        transactions.some((t) => t.id !== txn?.id && (t.reference === f.receiptNo || t.receiptNo === f.receiptNo)))) {
        e['receiptNo'] = "Receipt number already exists";
      }
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    submitting.current = true;
    const saved = saveTransaction({
      id: txn?.id, type, date: f.date, amount: Number(f.amount), category: f.category, method: f.method as PaymentMethod,
      description: f.description.trim(), reference: f.receiptNo.trim(), status: txn?.status ?? "Posted",
      receiptNo: type === "income" ? f.receiptNo.trim() : undefined,
      to: f.to.trim() || undefined,
      paymentMode: f.paymentMode as PaymentMode,
    });
    if (saved !== true) {
      submitting.current = false;
      if (saved === false) toast.error("Receipt number already exists");
      else {
        const label = saved.reason === "cash" ? "cash" : "bank";
        toast.error(`Insufficient ${label} balance. Available: ${formatINR(saved.available)}`);
      }
      return;
    }
    toast.success(txn ? "Transaction updated" : `${type === "income" ? "Income" : "Expense"} recorded`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[90vw] max-w-4xl flex-col overflow-hidden p-4 sm:max-h-[90vh] sm:p-6">
        <DialogHeader><DialogTitle>{txn ? "Edit" : "Add"} {type === "income" ? "income" : "expense"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} onKeyDown={onEnterKeyDown} className="flex min-h-0 flex-col gap-3">
          <div className="grid min-w-0 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Receipt No." htmlFor="t-receipt" error={errors['receiptNo']}>
              <Input id="t-receipt" value={f.receiptNo} readOnly aria-readonly="true" tabIndex={-1} />
            </Field>
            <Field label="Date" htmlFor="t-date" error={errors['date']}>
              <Input id="t-date" type="date" value={f.date} onChange={(e) => set("date")(e.target.value)} autoFocus />
            </Field>
            <Field label="Ledger Name" htmlFor="t-cat" error={errors['category']}>
              <SimpleSelect id="t-cat" value={cats.includes(f.category) ? f.category : ""}
                placeholder={f.category && !cats.includes(f.category) ? f.category : "Select"}
                onChange={set("category")} options={cats} />
            </Field>
            <Field label="To" htmlFor="t-to" error={errors['to']}>
              <Input id="t-to" value={f.to} onChange={(e) => set("to")(e.target.value)} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <Field label="Description" htmlFor="t-desc" error={errors['description']}>
                <Textarea id="t-desc" rows={2} value={f.description} onChange={(e) => set("description")(e.target.value)} />
              </Field>
            </div>
            <Field label="Payment Method" htmlFor="t-m" error={errors['method']}>
              <SimpleSelect id="t-m" value={f.method} onChange={set("method")} options={methods} />
            </Field>
            <Field label="Payment Mode" htmlFor="t-mode" error={errors['paymentMode']}>
              <SimpleSelect id="t-mode" value={f.paymentMode} onChange={set("paymentMode")}
                options={[...PAYMENT_MODES]} />
            </Field>
            <div className={type === "income" ? "sm:col-span-2 lg:col-span-2" : ""}>
              <Field label="Amount" htmlFor="t-amt" error={errors['amount']}>
                <Input id="t-amt" type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => set("amount")(e.target.value)} />
              </Field>
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{type === "income" && !txn ? "Save Income" : txn ? "Save changes" : "Save Expense"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
