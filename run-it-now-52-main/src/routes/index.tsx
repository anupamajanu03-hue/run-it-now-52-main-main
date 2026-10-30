import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownCircle, ArrowUpCircle, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange, PageHeader, SampleNote, SectionCard, StatCard, StatGrid, StatusBadge } from "@/components/finance/common";
import { useFinance, useLedgerEntries } from "@/finance/store";
import { studentCourse } from "@/finance/courses";
import { chartColors } from "@/finance/chartColors";
import {
  TODAY, billStatus, formatDate, formatINR, getNeedsAttention, inRange, installmentSchedule, outstanding,
  settlementStatus, studentPaid, sum,
} from "@/finance/logic";
import { AttentionItemLink } from "@/components/finance/AttentionItemLink";
import { useRecordPayment } from "@/components/finance/RecordPaymentContext";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Finance Dashboard — Finance & Accounts" },
      { name: "description", content: "Overview of fee collections, income, expenses, balances and pending settlements." },
      { property: "og:title", content: "Finance Dashboard — Finance & Accounts" },
      { property: "og:description", content: "Overview of fee collections, income, expenses, balances and pending settlements." },
    ],
  }),
  component: Dashboard,
});

function monthsBetween(from: string, to: string) {
  if (!from || !to || from > to) return [];
  const month = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const last = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  const months: { key: string; label: string }[] = [];
  while (month <= last) {
    const key = month.toISOString().slice(0, 7);
    months.push({ key, label: month.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }) });
    month.setUTCMonth(month.getUTCMonth() + 1);
  }
  return months;
}

const signedINR = (value: number) => value < 0 ? `−${formatINR(Math.abs(value))}` : formatINR(value);
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

function Dashboard() {
  const { payments, transactions, students, balances, settlements, settings, physicalCount, courseCatalog } = useFinance();
  const { open: openRecordPayment } = useRecordPayment();
  const entries = useLedgerEntries();
  const [from, setFrom] = useState(settings.financialYear.start);
  const [to, setTo] = useState(TODAY);
  const [quickRange, setQuickRange] = useState("year");

  const inR = entries.filter((e) => inRange(e.date, from, to));
  const fee = sum(payments.filter((p) => inRange(p.date, from, to)).map((p) => p.amount));
  const other = sum(transactions.filter((t) => t.type === "income" && t.category !== "Student Fees" && inRange(t.date, from, to)).map((t) => t.amount));
  const exp = sum(transactions.filter((t) => t.type === "expense" && inRange(t.date, from, to)).map((t) => t.amount));
  const totalOutstanding = sum(students.map((s) => outstanding(s, payments)));

  const reportStudents = students.filter((student) => inRange(student.registeredOn, from, to));
  const courseSummary = courseCatalog.courses.map((course) => {
    const members = reportStudents.filter((student) => studentCourse(student, courseCatalog)?.id === course.id);
    const memberIds = new Set(members.map((student) => student.id));
    const billed = sum(members.map((student) => student.totalFee));
    const collected = sum(payments.filter((payment) => memberIds.has(payment.studentId) && inRange(payment.date, from, to)).map((payment) => payment.amount));
    const outstandingAtEnd = sum(members.map((student) => Math.max(0, student.totalFee - sum(payments.filter((payment) => payment.studentId === student.id && payment.date <= to).map((payment) => payment.amount)))));
    return { name: course.name, enrolments: members.length, billed, collected, outstanding: outstandingAtEnd };
  }).filter((row) => row.enrolments > 0);

  const chart = useMemo(() => monthsBetween(from, to).map(({ key, label }) => {
    const month = inR.filter((e) => e.date.startsWith(key));
    return {
      month: label,
      Income: sum(month.filter((e) => e.type === "income").map((e) => e.amount)),
      Expenses: sum(month.filter((e) => e.type === "expense").map((e) => e.amount)),
    };
  }), [inR, from, to]);

  const overdue = students.filter((s) => billStatus(s, payments) === "Overdue");
  const pending = settlements.filter((s) => !s.finalized);
  const installments = students.flatMap((student) =>
    installmentSchedule(student, studentPaid(student.id, payments), TODAY, payments).map((installment) => ({ ...installment, student })));
  const upcoming = installments
    .filter((i) => i.balance > 0 && i.due > TODAY && i.due <= addDays(TODAY, 7))
    .sort((a, b) => a.due.localeCompare(b.due));
  const attentionItems = getNeedsAttention({
    students,
    payments,
    settlements,
    cashBalance: balances.cash,
    bankBalance: balances.bank,
    physicalCount,
  });

  return (
    <>
      <PageHeader crumbs={["Dashboard"]} title="Finance Dashboard" description="Overview for the selected period."
        actions={<DateRange from={from} to={to}
          onChange={(f, t) => { setFrom(f); setTo(t); setQuickRange("custom"); }}
          quickRange={quickRange}
          onQuickRangeChange={(range) => {
            setQuickRange(range);
            if (range === "today") { setFrom(TODAY); setTo(TODAY); }
            else if (range === "month") { setFrom(`${TODAY.slice(0, 7)}-01`); setTo(TODAY); }
            else if (range === "year") { setFrom(settings.financialYear.start); setTo(TODAY); }
          }} />} />
      <SampleNote />

      <div className="mb-4 flex flex-wrap gap-2 no-print">
        <Button asChild size="sm"><Link to="/transactions" search={{ tab: "income", add: "income" }}><ArrowDownCircle className="mr-1.5 h-4 w-4" />Add Income</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to="/transactions" search={{ tab: "expense", add: "expense" }}><ArrowUpCircle className="mr-1.5 h-4 w-4" />Add Expense</Link></Button>
        <Button size="sm" variant="outline" onClick={() => openRecordPayment()}>
          <span className="mr-1.5">₹</span>Collect Fees
        </Button>
        <Button asChild size="sm" variant="outline"><Link to="/settlements" search={{ tab: "overview" }}><Scale className="mr-1.5 h-4 w-4" />Review Settlements</Link></Button>
      </div>

      <StatGrid className="dashboard-stat-grid mb-4">
        <StatCard label="Total income" value={formatINR(fee + other)} hint="Fees and other income" compact />
        <StatCard label="Total expenses" value={formatINR(exp)} hint="Expenses paid in period" compact />
        <StatCard label="Petty cash balance" value={signedINR(balances.pettyBook)} hint="Current petty cash book balance" compact />
        <StatCard label="Outstanding fees" value={formatINR(totalOutstanding)} tone="danger" hint="As of today" compact />
        <StatCard label="Bank balance" value={signedINR(balances.bank)} hint="All bank accounts" compact />
      </StatGrid>

      <div className="dashboard-panels mb-6">
        <SectionCard title="Income vs expenses" subtitle="Monthly totals for the selected period" className="dashboard-income-card">
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.6} stroke="var(--border)" vertical={false} />
                <XAxis axisLine={false} tickLine={false} dataKey="month" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => Math.abs(v) >= 100000
                  ? `${v < 0 ? "−" : ""}₹${Number((Math.abs(v) / 100000).toFixed(1))}L`
                  : Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}₹${Math.round(Math.abs(v) / 1000)}k` : `${v < 0 ? "−" : ""}₹${v}`}
                  tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={56} />
                <Tooltip formatter={(v: number) => formatINR(v)} contentStyle={{ backgroundColor: "var(--popover)", borderColor: "var(--border)", color: "var(--popover-foreground)" }} labelStyle={{ color: "var(--muted-foreground)" }} cursor={{ fill: "var(--muted)" }} />
                <Legend verticalAlign="bottom" iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="Income" fill={chartColors.income} radius={[6, 6, 0, 0]} />
                <Bar dataKey="Expenses" fill={chartColors.expenses} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="Pending settlements" action={<Link to="/settlements" search={{ tab: "overview" }} className="text-xs text-primary">View all</Link>} className="dashboard-summary-card p-4">
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">All settlements finalized.</p> : (
            <ul className="space-y-2 text-sm">
              {pending.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span>{formatDate(s.date)} · {s.method}</span><StatusBadge status={settlementStatus(s)} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Overdue fees" action={<Link to="/fees" search={{ tab: "billing", todayFilter: "overdue" }} className="text-xs text-primary">View</Link>} className="dashboard-summary-card p-4">
          <p className="num text-lg font-semibold text-destructive">{formatINR(sum(overdue.map((s) => outstanding(s, payments))))}</p>
          <p className="text-xs text-muted-foreground">{overdue.length} students with overdue installments</p>
        </SectionCard>
      </div>

      <div className="mb-6">
        <SectionCard title="Course-wise enrolments & fees">
          <Table>
            <TableHeader><TableRow><TableHead>Course</TableHead><TableHead className="text-right">Enrolments</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Collected</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader>
            <TableBody>{courseSummary.map((row) => <TableRow key={row.name}><TableCell>{row.name}</TableCell><TableCell className="num text-right">{row.enrolments}</TableCell><TableCell className="num text-right">{formatINR(row.billed)}</TableCell><TableCell className="num text-right">{formatINR(row.collected)}</TableCell><TableCell className="num text-right">{formatINR(row.outstanding)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </SectionCard>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Needs attention">
          {attentionItems.length === 0
            ? <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
            : <ul className="space-y-2 text-sm">{attentionItems.map((item) => (
              <li key={item.key}>
                <AttentionItemLink item={item} className="flex justify-between gap-2 hover:text-primary" />
              </li>
            ))}</ul>}
        </SectionCard>
        <SectionCard title="Upcoming dues" action={<Link to="/fees" search={{ tab: "billing", todayFilter: "dueSoon" }} className="text-xs text-primary">Due soon</Link>}>
          {upcoming.length === 0
            ? <p className="text-sm text-muted-foreground">No installments due in the next 7 days.</p>
            : <>
              <p className="mb-2 text-sm"><span className="font-medium">{upcoming.length}</span> due · <span className="num font-medium">{formatINR(sum(upcoming.map((i) => i.balance)))}</span></p>
              <ul className="space-y-2 text-xs">
                {upcoming.slice(0, 5).map((i) => (
                  <li key={`${i.student.id}-${i.label}`} className="flex justify-between gap-2">
                    <span>{i.student.name} · {formatDate(i.due)}</span><span className="num">{formatINR(i.balance)}</span>
                  </li>
                ))}
              </ul>
            </>}
        </SectionCard>
      </div>

      <SectionCard title="Recent transactions" action={<Link to="/transactions" className="text-xs text-primary">Daily transactions</Link>}>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Ledger Name</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {inR.slice(0, 8).map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                <TableCell>{e.description}</TableCell>
                <TableCell>{e.category}</TableCell>
                <TableCell>{e.method}</TableCell>
                <TableCell className={`num text-right font-medium ${e.type === "income" ? "text-success" : "text-destructive"}`}>
                  {e.type === "income" ? "+" : "−"}{formatINR(e.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </>
  );
}
