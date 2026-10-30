import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DateRange, EmptyState, FilterBar, FilterSelect, PageHeader, SampleNote, SearchBox, SectionCard, StatCard, StatGrid, StatusBadge, tabSearch,
} from "@/components/finance/common";
import { buildBookStatement } from "@/finance/books";
import { useFinance, useLedgerEntries, type LedgerEntry } from "@/finance/store";
import { TODAY, formatDate, formatINR, inRange, isCash, sum } from "@/finance/logic";
import { BankStatementImport, ImportedStatementList } from "@/components/finance/BankStatementImport";

export const Route = createFileRoute("/ledgers")({
  validateSearch: tabSearch,
  beforeLoad: ({ search }) => {
    if (search.tab === "students") throw redirect({ to: "/fees", search: { tab: "billing" } });
  },
  head: () => ({
    meta: [
      { title: "Books & Ledgers — Finance & Accounts" },
      { name: "description", content: "Cash book, bank book, general ledger and student fee records." },
      { property: "og:title", content: "Books & Ledgers — Finance & Accounts" },
      { property: "og:description", content: "Cash book, bank book, general ledger and student fee records." },
    ],
  }),
  component: LedgersPage,
});

const LABEL: Record<string, string> = { cash: "Cash Book", bank: "Bank Book", general: "General Ledger" };

const bookReceiptNumber = (entry: LedgerEntry) =>
  entry.type === "income" ? entry.receiptNo || "—" : "—";

function bankPaymentReferences(entries: LedgerEntry[]) {
  const used = new Set(
    entries
      .filter((entry) => !isCash(entry.method))
      .map((entry) => ("bankReference" in entry ? entry.bankReference : entry.reference)?.trim().toLowerCase())
      .filter((reference): reference is string => !!reference),
  );
  const missing = entries
    .filter((entry) => !isCash(entry.method) && !used.has(
      ("bankReference" in entry ? entry.bankReference : entry.reference)?.trim().toLowerCase() ?? "",
    ))
    .sort((a, b) => a.id.localeCompare(b.id));
  let transferSequence = Math.max(218, ...[...used].map((reference) =>
    Number(reference.match(/^txn8802(\d+)$/)?.[1] ?? 0),
  )) + 1;
  let chequeSequence = Math.max(0, ...[...used].map((reference) =>
    Number(/^\d{6}$/.test(reference) ? reference : 0),
  )) + 1;
  let cardSequence = 1;
  let otherSequence = 1;
  const generated = new Map<string, string>();

  for (const entry of missing) {
    let reference: string;
    do {
      if (entry.method === "UPI" || entry.method === "Bank Transfer") {
        reference = `TXN8802${String(transferSequence++).padStart(2, "0")}`;
      } else if (entry.method === "Cheque") {
        reference = String(chequeSequence++).padStart(6, "0");
      } else if (entry.method === "Debit Card" || entry.method === "Credit Card" || entry.method === "Card") {
        reference = `C${String(cardSequence++).padStart(5, "0")}`;
      } else {
        reference = `R${String(otherSequence++).padStart(5, "0")}`;
      }
    } while (used.has(reference.toLowerCase()));
    used.add(reference.toLowerCase());
    generated.set(entry.id, reference);
  }
  return generated;
}

function LedgersPage() {
  const { tab = "cash" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const entries = useLedgerEntries();
  const { settings } = useFinance();
  const ledgerOptions = [...new Set([
    ...settings.incomeCategories,
    ...settings.expenseCategories,
    "Student Fees",
    ...entries.map((entry) => entry.category),
  ])].sort();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("2026-07-01");
  const [to, setTo] = useState(TODAY);
  const [account, setAccount] = useState("all");

  return (
    <>
      <PageHeader crumbs={["Books & Ledgers", LABEL[tab] ?? ""]} title={LABEL[tab] ?? "Books & Ledgers"} />
      <SampleNote>Each record appears once and is shown in every book it affects. Cash and bank balances are kept separate.</SampleNote>
      <Tabs value={tab} onValueChange={(v) => { navigate({ search: { tab: v } }); setAccount("all"); }} className="mb-4">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="cash">Cash Book</TabsTrigger><TabsTrigger value="bank">Bank Book</TabsTrigger>
          <TabsTrigger value="general">General Ledger</TabsTrigger>
        </TabsList>
      </Tabs>
      {(
        <Book kind={tab as "cash" | "bank" | "general"} entries={entries} q={q} setQ={setQ} from={from} to={to}
          setRange={(f, t) => { setFrom(f); setTo(t); }} account={account} setAccount={setAccount} ledgerOptions={ledgerOptions} />
      )}
    </>
  );
}

export function Book({ kind, entries, q, setQ, from, to, setRange, account, setAccount, ledgerOptions }: {
  kind: "cash" | "bank" | "general"; entries: LedgerEntry[]; q: string; setQ: (v: string) => void; from: string; to: string;
  setRange: (f: string, t: string) => void; account: string; setAccount: (v: string) => void; ledgerOptions: string[];
}) {
  const [viewing, setViewing] = useState<(LedgerEntry & { balance: number }) | null>(null);
  const { bankStatementImports, bankStatementImportsLoaded, addBankStatementImport } = useFinance();
  const scope = entries.filter((e) => kind === "general" || (kind === "cash" ? isCash(e.method) : !isCash(e.method)));
  const ledgers = kind === "general" ? ledgerOptions : [...new Set(scope.map((e) => e.category))].sort();
  const accounts = [...new Set(scope.map((e) => kind === "bank" ? e.method : e.category))].sort();
  const matchAcc = (e: LedgerEntry) => account === "all" || (kind === "bank" ? e.method : e.category) === account;
  const filtered = scope.filter(matchAcc).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const signed = (e: LedgerEntry) => (e.type === "income" ? e.amount : -e.amount);
  const bookStatement = kind === "general" ? null : buildBookStatement(entries, kind, from, to);
  const generatedPaymentReferences = kind === "bank" ? bankPaymentReferences(entries) : null;
  const paymentReference = (entry: LedgerEntry) =>
    ("bankReference" in entry ? entry.bankReference : entry.reference)?.trim() ||
    generatedPaymentReferences?.get(entry.id) ||
    "—";
  const opening = bookStatement?.opening ?? (kind === "general"
    ? filtered.filter((e) => e.date < from).reduce((a, e) => a + signed(e), 0)
    : 0);
  const calculatedRows = bookStatement?.rows ?? filtered.filter((e) => inRange(e.date, from, to)).reduce<(LedgerEntry & { balance: number })[]>((result, entry) => {
    const previousBalance = result.at(-1)?.balance ?? opening;
    result.push({ ...entry, balance: previousBalance + signed(entry) });
    return result;
  }, []);
  const rows = calculatedRows.filter((e) => {
    if (!q) return true;
    const searchable = kind === "general"
      ? `${e.id} ${e.description} ${e.reference} ${"bankReference" in e ? e.bankReference ?? "" : ""} ${e.category}`
      : `${e.description} ${e.category} ${bookReceiptNumber(e)} ${kind === "bank" ? paymentReference(e) : ""}`;
    return searchable.toLowerCase().includes(q.toLowerCase());
  });
  const closing = bookStatement?.closing ?? calculatedRows.at(-1)?.balance ?? opening;
  const generalSummary = kind === "general" ? ledgers.map((ledger) => {
    const ledgerEntries = scope.filter((entry) => entry.category === ledger);
    const openingBalance = sum(ledgerEntries.filter((entry) => entry.date < from).map(signed));
    const periodEntries = ledgerEntries.filter((entry) => inRange(entry.date, from, to));
    const debit = sum(periodEntries.filter((entry) => entry.type === "income").map((entry) => entry.amount));
    const credit = sum(periodEntries.filter((entry) => entry.type === "expense").map((entry) => entry.amount));
    return {
      ledger,
      entries: periodEntries,
      opening: openingBalance,
      debit,
      credit,
      closing: openingBalance + debit - credit,
    };
  }).filter((item) => !q || `${item.ledger} ${item.entries.map((entry) => `${entry.id} ${entry.description} ${entry.reference}`).join(" ")}`
    .toLowerCase().includes(q.toLowerCase())) : [];
  const allLedgerView = kind === "general" && account === "all";
  const generalTotals = kind === "general"
    ? scope.filter((entry) => inRange(entry.date, from, to))
    : [];
  const generalDebits = sum(generalTotals.filter((entry) => entry.type === "income").map((entry) => entry.amount));
  const generalCredits = sum(generalTotals.filter((entry) => entry.type === "expense").map((entry) => entry.amount));

  return (
    <>
      <StatGrid className="mb-4">
        {allLedgerView ? <>
          <StatCard label="Total Debit" value={formatINR(generalDebits)} hint="All ledger entries in range" />
          <StatCard label="Total Credit" value={formatINR(generalCredits)} hint="All ledger entries in range" />
          <StatCard label="Number of Entries" value={String(generalTotals.length)} />
        </> : <>
          <StatCard label="Opening balance" value={formatINR(opening)} hint={formatDate(from)} />
          <StatCard label="Closing balance" value={formatINR(closing)} hint={formatDate(to)} />
          <StatCard label="Entries" value={String(rows.length)} />
        </>}
      </StatGrid>
      <SectionCard>
        <FilterBar>
          <SearchBox value={q} onChange={setQ}
            placeholder={kind === "general" ? "Search ledger name or entries" : "Search particulars, ledger, receipt or reference"} />
          <DateRange from={from} to={to} onChange={setRange} />
          {kind === "general"
            ? <FilterSelect label="Ledgers" all="All" value={account} onChange={setAccount} options={ledgers} />
            : <FilterSelect label={kind === "bank" ? "Channels" : "Ledger Names"} value={account} onChange={setAccount} options={accounts} />}
          {kind === "bank" && (
            <BankStatementImport
              imports={bankStatementImports}
              onImport={addBankStatementImport}
              ready={bankStatementImportsLoaded}
            />
          )}
        </FilterBar>
        {kind === "bank" && <ImportedStatementList imports={bankStatementImports} />}
        {allLedgerView ? generalSummary.length === 0 ? <EmptyState /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ledger Name</TableHead><TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Total Debit</TableHead><TableHead className="text-right">Total Credit</TableHead>
              <TableHead className="text-right">Closing</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {generalSummary.map((item) => (
                <TableRow key={item.ledger} onRowClick={() => setAccount(item.ledger)} rowLabel={`View ${item.ledger} ledger entries`}>
                  <TableCell className="font-medium">{item.ledger}</TableCell>
                  <TableCell className="num text-right">{formatINR(item.opening)}</TableCell>
                  <TableCell className="num text-right">{formatINR(item.debit)}</TableCell>
                  <TableCell className="num text-right">{formatINR(item.credit)}</TableCell>
                  <TableCell className="num text-right font-medium">{formatINR(item.closing)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : rows.length === 0 ? <EmptyState /> : (
          <Table className={kind === "general" ? undefined : "table-fixed"}>
            {kind !== "general" && (
              <colgroup>
                {kind === "cash" ? <>
                  <col className="w-[96px]" />
                  <col className="w-[220px]" />
                  <col className="w-[180px]" />
                  <col className="w-[130px]" />
                  <col className="w-[130px]" />
                  <col className="w-[130px]" />
                  <col className="w-[150px]" />
                </> : <>
                  <col className="w-[96px]" />
                  <col className="w-[240px]" />
                  <col className="w-[140px]" />
                  <col className="w-[140px]" />
                  <col className="w-[180px]" />
                  <col className="w-[110px]" />
                  <col className="w-[110px]" />
                  <col className="w-[120px]" />
                </>}
              </colgroup>
            )}
            <TableHeader><TableRow>
              <TableHead className={kind === "general" ? undefined : "whitespace-nowrap"}>Date</TableHead>
              {kind === "general" && <TableHead>Transaction ID</TableHead>}
              {kind === "general" && <TableHead>Ledger Name</TableHead>}
              {kind !== "bank" && <TableHead className={kind === "general" ? undefined : "whitespace-nowrap"}>Particulars</TableHead>}
              {kind === "bank" && <TableHead className="whitespace-nowrap">Particulars</TableHead>}
              {kind === "cash" && <TableHead className="whitespace-nowrap">Ledger Name</TableHead>}
              {kind === "bank" && <TableHead className="whitespace-nowrap">Type</TableHead>}
              {kind === "general" && <TableHead>Payment Mode</TableHead>}
              {kind === "bank" && <TableHead className="whitespace-nowrap">Receipt No.</TableHead>}
              {kind === "bank" && <TableHead className="whitespace-nowrap">Payment ref.</TableHead>}
              {kind === "general" && <TableHead className={kind === "general" ? undefined : "whitespace-nowrap"}>{"Reference"}</TableHead>}
              <TableHead className={kind === "general" ? "text-right" : "whitespace-nowrap text-right"}>Debit</TableHead>
              <TableHead className={kind === "general" ? "text-right" : "whitespace-nowrap text-right"}>Credit</TableHead>
              <TableHead className={kind === "general" ? "text-right" : "whitespace-nowrap text-right"}>Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} onRowClick={() => setViewing(e)} rowLabel={`View ledger entry: ${e.description}`}>
                  <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                  {kind === "general" && <TableCell className="max-w-36 break-all font-mono text-xs">{e.id}</TableCell>}
                  {kind === "general" && <TableCell>{e.category}</TableCell>}
                  {kind === "bank" ? (
                    <>
                      <TableCell className="whitespace-normal break-words align-top">{e.description}</TableCell>
                      <TableCell className="whitespace-normal break-words align-top">{`${e.type === "income" ? "Deposit" : "Withdrawal"} · ${e.method}`}</TableCell>
                      <TableCell className="num whitespace-nowrap text-xs">{bookReceiptNumber(e)}</TableCell>
                      <TableCell className="num whitespace-normal break-all text-xs">{paymentReference(e)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className={kind === "general" ? undefined : "truncate"}>{e.description}</TableCell>
                      {kind !== "general" && <TableCell className="truncate">{e.category}</TableCell>}
                      {kind === "general" && <TableCell>{e.method}</TableCell>}
                      <TableCell className={kind === "general" ? "num text-xs" : "num whitespace-nowrap text-xs"}>
                        {kind === "general"
                          ? e.reference || "—"
                          : bookReceiptNumber(e)}
                      </TableCell>
                    </>
                  )}
                  {kind === "general" && <TableCell>{e.method}</TableCell>}
                  {kind === "general" && <TableCell className="num text-xs">{e.reference || "—"}</TableCell>}
                  <TableCell className={kind === "general" ? "num text-right" : "num whitespace-nowrap text-right"}>
                    {e.type === "income" ? formatINR(e.amount) : ""}
                  </TableCell>
                  <TableCell className={kind === "general" ? "num text-right" : "num whitespace-nowrap text-right"}>
                    {e.type === "expense" ? formatINR(e.amount) : ""}
                  </TableCell>
                  <TableCell className={kind === "general" ? "num text-right font-medium" : "num whitespace-nowrap text-right font-medium"}>
                    {formatINR(e.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ledger entry details</DialogTitle></DialogHeader>
          {viewing && (
            <LedgerDetails entry={viewing} kind={kind}
              paymentReference={kind === "bank" ? paymentReference(viewing) : undefined} />
          )}
          <DialogFooter><Button variant="outline" onClick={() => setViewing(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LedgerDetails({ entry, kind, paymentReference }: {
  entry: LedgerEntry & { balance: number };
  kind: "cash" | "bank" | "general";
  paymentReference?: string | undefined;
}) {
  const fields: [string, string | undefined][] = kind === "general" ? [
    ["Date", formatDate(entry.date)], ["Particulars", entry.description], ["Ledger Name", entry.category],
    ["Transaction ID", entry.id],
    ...(entry.source === "txn" && entry.bankReference
      ? [["Bank Reference / UTR No.", entry.bankReference] as [string, string]]
      : []),
    ["Type", entry.type === "income" ? "Income" : "Expense"],
    ["Reference", entry.source === "txn" ? entry.reference || undefined : undefined],
    ["Transaction reference", entry.source === "fee" ? entry.reference || undefined : undefined],
    [
      "Receipt No.",
      entry.receiptNo ?? (entry.source === "txn" ? entry.reference : undefined),
    ],
    ["Account", undefined], ["Payment method", entry.method],
    ["Payment mode", "paymentMode" in entry ? entry.paymentMode : undefined], ["To", "to" in entry ? entry.to : undefined],
    ["Description", entry.description], ["Status", entry.status], ["Debit", entry.type === "expense" ? formatINR(entry.amount) : undefined],
    ["Credit", entry.type === "income" ? formatINR(entry.amount) : undefined], ["Balance after entry", formatINR(entry.balance)],
    ["Source", entry.source === "fee" ? "Fee Collection" : "Daily Transactions"],
  ] : [
    ["Date", formatDate(entry.date)], ["Particulars", entry.description], ["Ledger Name", entry.category],
    ["Type", entry.type === "income" ? "Income" : "Expense"],
    ["Receipt No.", bookReceiptNumber(entry)],
    ["Payment ref.", kind === "bank" ? paymentReference || "—" : undefined],
    ["Account", kind === "cash" ? "Cash" : "Bank"], ["Payment method", entry.method],
    ["Payment mode", "paymentMode" in entry ? entry.paymentMode : undefined], ["To", "to" in entry ? entry.to : undefined],
    ["Description", entry.description], ["Status", entry.status],
    ["Debit", entry.type === "expense" ? formatINR(entry.amount) : undefined],
    ["Credit", entry.type === "income" ? formatINR(entry.amount) : undefined],
    ["Balance after entry", formatINR(entry.balance)],
    ["Source", entry.source === "fee" ? "Fee Collection" : "Daily Transactions"],
  ];
  return <dl className="grid grid-cols-2 gap-3 text-sm">{fields.filter(([, value]) => value !== undefined && value !== "").map(([label, value]) =>
    <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>;
}
