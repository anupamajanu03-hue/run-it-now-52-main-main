import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Calculator, CheckCircle2, Plus, Scale, Wallet, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, PageHeader, SampleNote, SectionCard, SimpleSelect, StatCard, StatGrid, StatusBadge, tabSearch } from "@/components/finance/common";
import { useFinance } from "@/finance/store";
import { OPENING } from "@/finance/data";
import { TODAY, cashComparison, formatDate, formatINR, pettyDailyBalances } from "@/finance/logic";
import { cashCountTotal, type CashDenomination, type DenominationKind } from "@/finance/cashCount";
import { useEnterToNext } from "@/hooks/use-enter-to-next";

export const Route = createFileRoute("/petty-cash")({
  validateSearch: tabSearch,
  head: () => ({
    meta: [
      { title: "Petty Cash — Finance & Accounts" },
      { name: "description", content: "Track petty cash, count denominations and review discrepancies." },
      { property: "og:title", content: "Petty Cash — Finance & Accounts" },
      { property: "og:description", content: "Track petty cash, count denominations and review discrepancies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PettyCashPage,
});

const LABEL: Record<string, string> = { overview: "Cash Overview", count: "Denomination Counting", history: "Petty Cash History" };

function PettyCashPage() {
  const { tab = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { petty, balances, physicalCount } = useFinance();
  const [adding, setAdding] = useState(false);
  const [balanceDate, setBalanceDate] = useState(TODAY);
  const dailyBalances = useMemo(() => pettyDailyBalances(petty, OPENING.petty, TODAY), [petty]);
  const selectedBalance = dailyBalances.find((day) => day.date === balanceDate) ?? {
    date: balanceDate, opening: OPENING.petty, received: 0, expenses: 0, closing: OPENING.petty,
  };
  const cmp = physicalCount === null ? null : cashComparison(selectedBalance.closing, physicalCount);

  const withBalance = useMemo(() => {
    let bal = OPENING.petty;
    return [...petty].sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
      bal += e.kind === "received" ? e.amount : -e.amount;
      return { ...e, balance: bal };
    });
  }, [petty]);

  return (
    <>
      <PageHeader crumbs={["Petty Cash", LABEL[tab] ?? ""]} title="Petty Cash"
        actions={<Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Add petty cash entry</Button>} />
      <SampleNote />
      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v } })}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="count">Denomination count</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
          {tab === "overview" && (
            <div className="no-print flex items-center gap-2 whitespace-nowrap">
              <label htmlFor="petty-balance-date" className="text-xs font-medium text-muted-foreground">Balance date</label>
              <Input id="petty-balance-date" type="date" min={dailyBalances[0]?.date} max={TODAY} className="w-[160px]"
                value={balanceDate} onChange={(event) => setBalanceDate(event.target.value)} />
            </div>
          )}
        </div>
      </Tabs>

      {tab === "overview" && (
        <>
          <StatGrid className="mb-4">
            <StatCard label="Opening balance" icon={Wallet} color="blue" value={formatINR(selectedBalance.opening)} caption={formatDate(balanceDate)} />
            <StatCard label="Cash received" icon={ArrowDownCircle} color="green" value={formatINR(selectedBalance.received)} caption="On this date" />
            <StatCard label="Total expenses" icon={ArrowUpCircle} color="orange" value={formatINR(selectedBalance.expenses)} caption="On this date" />
            <StatCard label="Closing balance" icon={Scale} color="blue" value={formatINR(selectedBalance.closing)} caption={formatDate(balanceDate)} />
            <StatCard label="Physical count" icon={Calculator} color="purple"
              value={physicalCount === null ? null : formatINR(physicalCount)} empty="Not counted" caption={physicalCount === null ? "No count saved" : "Latest saved count"} />
            <StatCard label="Shortage / excess" icon={AlertCircle}
              color={cmp?.status === "Shortage" ? "red" : "gray"} tone={cmp?.status === "Shortage" ? "danger" : undefined}
              value={cmp ? formatINR(cmp.diff) : null} empty="—" caption={cmp?.status ?? "\u00A0"} />
          </StatGrid>
          <SectionCard title="Daily balances">
            <DailyBalancesTable rows={[...dailyBalances].reverse()} />
          </SectionCard>
          <SectionCard title="Recent petty cash transactions">
            <EntriesTable rows={withBalance.slice(-5).reverse()} />
          </SectionCard>
        </>
      )}
      {tab === "count" && <DenominationCounter />}
      {tab === "history" && (
        <SectionCard title="Petty cash history">
          <EntriesTable rows={[...withBalance].reverse()} />
        </SectionCard>
      )}
      {adding && <PettyDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function DailyBalancesTable({ rows }: { rows: ReturnType<typeof pettyDailyBalances> }) {
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Date</TableHead><TableHead className="text-right">Opening</TableHead>
        <TableHead className="text-right">Cash received</TableHead><TableHead className="text-right">Total expenses</TableHead>
        <TableHead className="text-right">Closing</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((day) => (
          <TableRow key={day.date}>
            <TableCell className="whitespace-nowrap">{formatDate(day.date)}</TableCell>
            <TableCell className="num text-right">{formatINR(day.opening)}</TableCell>
            <TableCell className="num text-right">{formatINR(day.received)}</TableCell>
            <TableCell className="num text-right">{formatINR(day.expenses)}</TableCell>
            <TableCell className="num text-right">{formatINR(day.closing)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EntriesTable({ rows }: { rows: { id: string; date: string; kind: string; category: string; description: string; reference: string; amount: number; balance: number }[] }) {
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Ledger Name</TableHead><TableHead>Description</TableHead><TableHead>Receipt No.</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
            <TableCell>{e.kind === "received" ? "Cash received" : "Cash paid"}</TableCell>
            <TableCell>{e.category}</TableCell><TableCell>{e.description}</TableCell>
            <TableCell className="num text-xs">{e.reference}</TableCell>
            <TableCell className={`num text-right ${e.kind === "received" ? "text-success" : "text-destructive"}`}>{e.kind === "received" ? "+" : "−"}{formatINR(e.amount)}</TableCell>
            <TableCell className="num text-right">{formatINR(e.balance)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DenominationCounter() {
  const { balances, cashCount, dispatchCashCount } = useFinance();
  const [newValue, setNewValue] = useState("");
  const [newKind, setNewKind] = useState<DenominationKind>("Note");
  const [quantityError, setQuantityError] = useState("");
  const savingCount = useRef(false);
  const onEnterKeyDown = useEnterToNext();
  const total = cashCountTotal(cashCount.denominations);
  const cmp = cashComparison(balances.pettyBook, total);
  const saveCount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingCount.current) return;
    savingCount.current = true;
    dispatchCashCount({ type: "save", bookBalance: balances.pettyBook });
    toast.success("Physical count saved for review");
    window.setTimeout(() => { savingCount.current = false; }, 0);
  };
  const addDenomination = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(newValue);
    if (!Number.isSafeInteger(value) || value <= 0) { toast.error("Enter a positive whole-number denomination"); return; }
    if (cashCount.denominations.some((d) => d.value === value && d.kind === newKind)) { toast.error("This denomination and type already exist"); return; }
    dispatchCashCount({ type: "add", value, kind: newKind });
    setNewValue("");
  };
  const row = ({ value: d, kind, quantity }: CashDenomination) => (
    <TableRow key={`${kind}${d}`}>
      <TableCell>₹{d} {kind === "Note" ? "notes" : "coins"}</TableCell>
      <TableCell className="w-32">
        <Input aria-label={`Quantity of ₹${d} ${kind === "Note" ? "notes" : "coins"}`} type="number" min="0" step="1" value={quantity || ""}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (!Number.isSafeInteger(next) || next < 0) { setQuantityError("Enter a non-negative whole-number quantity."); return; }
            setQuantityError("");
            dispatchCashCount({ type: "quantity", value: d, kind, quantity: next });
          }} />
      </TableCell>
      <TableCell className="num text-right">{formatINR(d * quantity)}</TableCell>
      <TableCell className="w-10">
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ₹${d} ${kind.toLowerCase()}`} title={`Remove ₹${d} ${kind.toLowerCase()}`} onClick={() => dispatchCashCount({ type: "remove", value: d, kind })}><X className="h-4 w-4" /></Button>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <SectionCard title="Count physical cash" className="lg:col-span-3">
        <form id="cash-count-form" onSubmit={saveCount} onKeyDown={onEnterKeyDown}>
          <Table>
            <TableHeader><TableRow><TableHead>Denomination</TableHead><TableHead>Quantity</TableHead><TableHead className="text-right">Value</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{cashCount.denominations.map(row)}</TableBody>
            <TableFooter><TableRow><TableCell colSpan={2}>Total physical cash</TableCell><TableCell className="num text-right">{formatINR(total)}</TableCell><TableCell /></TableRow></TableFooter>
          </Table>
        </form>
        {quantityError && <p role="alert" className="mt-2 text-xs text-destructive">{quantityError}</p>}
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={addDenomination} onKeyDown={onEnterKeyDown}>
          <Field label="Denomination (₹)" htmlFor="cash-denomination"><Input id="cash-denomination" type="number" min="1" step="1" placeholder="500" className="w-36" value={newValue} onChange={(e) => setNewValue(e.target.value)} /></Field>
          <div className="w-28"><Field label="Type" htmlFor="cash-kind"><SimpleSelect id="cash-kind" value={newKind} onChange={(value) => { if (value === "Note" || value === "Coin") setNewKind(value); }} options={["Note", "Coin"]} /></Field></div>
          <Button type="submit" variant="outline"><Plus className="mr-1 h-4 w-4" />Add Denomination</Button>
        </form>
      </SectionCard>
      <div className="space-y-4 lg:col-span-2">
        <SectionCard title="Comparison">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Book balance</dt><dd className="num">{formatINR(balances.pettyBook)}</dd></div>
            <div className="flex justify-between"><dt>Physical cash</dt><dd className="num">{formatINR(total)}</dd></div>
            <div className="flex justify-between border-t pt-2 font-medium"><dt>Difference</dt><dd className="num">{formatINR(cmp.diff)}</dd></div>
            <div className="flex justify-between"><dt>Status</dt><dd><StatusBadge status={cmp.status} /></dd></div>
          </dl>
        </SectionCard>
        {cmp.status === "Matched" ? (
          <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Cash matches the book</AlertTitle><AlertDescription>No discrepancy found.</AlertDescription></Alert>
        ) : (
          <Alert variant="destructive"><AlertTriangle className="h-4 w-4" />
            <AlertTitle>{cmp.status} of {formatINR(Math.abs(cmp.diff))}</AlertTitle>
            <AlertDescription>The book balance is not changed automatically. Investigate the difference and record a correcting entry if required.</AlertDescription>
          </Alert>
        )}
        <Button type="submit" form="cash-count-form" className="w-full">Save count</Button>
      </div>
    </div>
  );
}

function PettyDialog({ onClose }: { onClose: () => void }) {
  const { petty, payments, transactions, settings, addPetty } = useFinance();
  const [f, setF] = useState(() => ({ date: TODAY, kind: "Cash paid", category: "", to: "", amount: "", description: "", reference: nextPettyReceiptNo(petty, payments, transactions) }));
  const [err, setErr] = useState<Record<string, string>>({});
  const submitting = useRef(false);
  const onEnterKeyDown = useEnterToNext();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const ledgers = f.kind === "Cash received" ? settings.incomeCategories : settings.expenseCategories;
  const submit = () => {
    if (submitting.current) return;
    const e: Record<string, string> = {};
    if (!f.reference.trim()) e['reference'] = "Receipt number is required";
    if (!f.date) e['date'] = "Date is required";
    if (f.kind !== "Cash received" && f.kind !== "Cash paid") e['kind'] = "Choose a transaction type";
    if (!f.category) e['category'] = "Choose a ledger name";
    if (f.kind === "Cash paid" && !f.to.trim()) e['to'] = "Enter who the cash was paid to";
    if (!(Number(f.amount) > 0)) e['amount'] = "Enter an amount greater than zero";
    if (!f.description.trim()) e['description'] = "Description is required";
    setErr(e);
    if (Object.keys(e).length) return;
    submitting.current = true;
    const saved = addPetty({ date: f.date, kind: f.kind === "Cash received" ? "received" : "paid", category: f.category,
      amount: Number(f.amount), description: f.description.trim(), reference: f.reference.trim(),
      ...(f.kind === "Cash paid" ? { to: f.to.trim() } : {}) });
    if (saved !== true) {
      submitting.current = false;
      toast.error(`Insufficient petty cash balance. Available: ${formatINR(saved.available)}`);
      return;
    }
    toast.success("Petty cash entry added");
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[90vw] max-w-4xl flex-col overflow-hidden p-4 sm:max-h-[90vh] sm:p-6">
        <DialogHeader><DialogTitle>Add petty cash entry</DialogTitle></DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); submit(); }} onKeyDown={onEnterKeyDown} className="flex min-h-0 flex-col gap-3">
          <div className="grid min-w-0 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Receipt No." htmlFor="p-r" error={err['reference']}><Input id="p-r" value={f.reference} readOnly aria-readonly="true" tabIndex={-1} /></Field>
            <Field label="Date" htmlFor="p-d" error={err['date']}><Input id="p-d" type="date" value={f.date} onChange={(e) => set("date")(e.target.value)} autoFocus /></Field>
            <Field label="Transaction type" htmlFor="p-k" error={err['kind']}>
              <SimpleSelect id="p-k" value={f.kind} onChange={(value) => setF((current) => ({ ...current, kind: value, category: "", to: value === "Cash paid" ? current.to : "" }))} options={["Cash received", "Cash paid"]} />
            </Field>
            <Field label="Ledger Name" htmlFor="p-c" error={err['category']}><SimpleSelect id="p-c" value={f.category} onChange={set("category")} options={ledgers} /></Field>
            {f.kind === "Cash paid" && <Field label="To" htmlFor="p-to" error={err['to']}><Input id="p-to" value={f.to} onChange={(e) => set("to")(e.target.value)} /></Field>}
            <div className="sm:col-span-2 lg:col-span-4"><Field label="Description" htmlFor="p-ds" error={err['description']}>
              <Textarea id="p-ds" rows={2} value={f.description} onChange={(e) => set("description")(e.target.value)} />
            </Field></div>
            <Field label="Amount (₹)" htmlFor="p-a" error={err['amount']}><Input id="p-a" type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => set("amount")(e.target.value)} /></Field>
          </div>
          <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save entry</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function nextPettyReceiptNo(petty: { reference: string }[], payments: { reference: string; receiptNo: string }[], transactions: { reference: string; receiptNo?: string }[]) {
  const used = new Set([
    ...petty.map((entry) => entry.reference),
    ...payments.flatMap((payment) => [payment.reference, payment.receiptNo]),
    ...transactions.flatMap((transaction) => [transaction.reference, transaction.receiptNo ?? ""]),
  ]);
  const numbers = [...used].map((value) => /^PCV-(\d+)$/.exec(value)?.[1]).filter((value): value is string => !!value).map(Number);
  let next = Math.max(100, ...numbers) + 1;
  while (used.has(`PCV-${next}`)) next += 1;
  return `PCV-${next}`;
}
