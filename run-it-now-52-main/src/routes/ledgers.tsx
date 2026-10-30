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
  const opening = bookStatement?.opening ?? (kind === "general"
    ? filtered.filter((e) => e.date < from).reduce((a, e) => a + signed(e), 0)
    : 0);
  const calculatedRows = bookStatement?.rows ?? filtered.filter((e) => inRange(e.date, from, to)).reduce<(LedgerEntry & { balance: number })[]>((result, entry) => {
    const previousBalance = result.at(-1)?.balance ?? opening;
    result.push({ ...entry, balance: previousBalance + signed(entry) });
    return result;
  }, []);
  const rows = calculatedRows.filter((e) =>
    !q || `${e.id} ${e.description} ${e.reference} ${"bankReference" in e ? e.bankReference ?? "" : ""} ${e.category}`.toLowerCase().includes(q.toLowerCase()),
  );
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
          <SearchBox value={q} onChange={setQ} placeholder="Search ledger name or entries" />
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
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Transaction ID</TableHead>
              {kind === "general" && <TableHead>Ledger Name</TableHead>}
              <TableHead>Particulars</TableHead>
              <TableHead>{kind === "bank" ? "Type" : kind === "cash" ? "Ledger Name" : "Payment Mode"}</TableHead>
              <TableHead>{kind === "general" ? "Reference" : "Receipt No."}</TableHead>
              <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} onRowClick={() => setViewing(e)} rowLabel={`View ledger entry: ${e.description}`}>
                  <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                  <TableCell className="max-w-36 break-all font-mono text-xs">{e.id}</TableCell>
                  {kind === "general" && <TableCell>{e.category}</TableCell>}
                  <TableCell>{e.description}</TableCell>
                  <TableCell>{kind === "bank" ? `${e.type === "income" ? "Deposit" : "Withdrawal"} · ${e.method}` : kind === "cash" ? e.category : e.method}</TableCell>
                  <TableCell className="num text-xs">
                    {kind === "general"
                      ? e.reference || "—"
                      : e.receiptNo || (e.source === "txn" ? e.reference : "") || "—"}
                  </TableCell>
                  <TableCell className="num text-right">{e.type === "income" ? formatINR(e.amount) : ""}</TableCell>
                  <TableCell className="num text-right">{e.type === "expense" ? formatINR(e.amount) : ""}</TableCell>
                  <TableCell className="num text-right font-medium">{formatINR(e.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ledger entry details</DialogTitle></DialogHeader>
          {viewing && <LedgerDetails entry={viewing} kind={kind} />}
          <DialogFooter><Button variant="outline" onClick={() => setViewing(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LedgerDetails({ entry, kind }: { entry: LedgerEntry & { balance: number }; kind: "cash" | "bank" | "general" }) {
  const fields: [string, string | undefined][] = [
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
    ["Account", kind === "cash" ? "Cash" : kind === "bank" ? "Bank" : undefined], ["Payment method", entry.method],
    ["Payment mode", "paymentMode" in entry ? entry.paymentMode : undefined], ["To", "to" in entry ? entry.to : undefined],
    ["Description", entry.description], ["Status", entry.status], ["Debit", entry.type === "expense" ? formatINR(entry.amount) : undefined],
    ["Credit", entry.type === "income" ? formatINR(entry.amount) : undefined], ["Balance after entry", formatINR(entry.balance)],
    ["Source", entry.source === "fee" ? "Fee Collection" : "Daily Transactions"],
  ];
  return <dl className="grid grid-cols-2 gap-3 text-sm">{fields.filter(([, value]) => value !== undefined && value !== "").map(([label, value]) =>
    <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>;
}
