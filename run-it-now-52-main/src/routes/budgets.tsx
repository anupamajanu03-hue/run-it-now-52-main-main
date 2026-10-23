import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, SampleNote, SectionCard, StatCard, StatGrid } from "@/components/finance/common";
import { useFinance } from "@/finance/store";
import { chartColors } from "@/finance/chartColors";
import { formatINR, sum } from "@/finance/logic";

export const Route = createFileRoute("/budgets")({
  head: () => ({ meta: [{ title: "Cash Flow — Finance & Accounts" }, { name: "description", content: "Monthly cash flow and balances." }] }),
  component: CashFlowPage,
});

function CashFlowPage() {
  const { payments, transactions, balances } = useFinance();
  const data = useMemo(() => {
    const months = new Map<string, { inflow: number; outflow: number }>();
    const bump = (date: string, key: "inflow" | "outflow", amount: number) => {
      const month = date.slice(0, 7);
      const row = months.get(month) ?? { inflow: 0, outflow: 0 };
      row[key] += amount;
      months.set(month, row);
    };
    payments.forEach((payment) => bump(payment.date, "inflow", payment.amount));
    transactions.forEach((transaction) => bump(transaction.date, transaction.type === "income" ? "inflow" : "outflow", transaction.amount));
    let running = 0;
    return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, row]) => {
      running += row.inflow - row.outflow;
      return { month: new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), ...row, projected: running };
    });
  }, [payments, transactions]);
  const inflows = sum(data.map((row) => row.inflow));
  const outflows = sum(data.map((row) => row.outflow));
  return <>
    <PageHeader crumbs={["Cash Flow"]} title="Cash Flow" description="Monthly recorded inflows and outflows." />
    <SampleNote />
    <StatGrid className="mb-4">
      <StatCard label="Cash balance" value={formatINR(balances.cash)} />
      <StatCard label="Bank balance" value={formatINR(balances.bank)} />
      <StatCard label="Net recorded flow" value={formatINR(inflows - outflows)} />
    </StatGrid>
    <SectionCard title="Monthly cash flow" subtitle="Inflows vs outflows by month" className="mb-4">
      <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}><CartesianGrid strokeDasharray="4 4" strokeOpacity={0.6} stroke="var(--border)" vertical={false} /><XAxis axisLine={false} dataKey="month" fontSize={12} tickLine={false} stroke="var(--muted-foreground)" /><YAxis axisLine={false} fontSize={12} tickLine={false} stroke="var(--muted-foreground)" tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => formatINR(Number(value))} /><Legend verticalAlign="bottom" iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} /><Bar dataKey="inflow" name="Inflows" fill={chartColors.inflows} radius={[6, 6, 0, 0]} /><Bar dataKey="outflow" name="Outflows" fill={chartColors.outflows} radius={[6, 6, 0, 0]} /></BarChart>
      </ResponsiveContainer></div>
    </SectionCard>
    <SectionCard title="Monthly summary"><Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Inflows</TableHead><TableHead className="text-right">Outflows</TableHead><TableHead className="text-right">Net</TableHead><TableHead className="text-right">Projected balance</TableHead></TableRow></TableHeader><TableBody>{data.map((row) => <TableRow key={row.month}><TableCell className="font-medium">{row.month}</TableCell><TableCell className="num text-right">{formatINR(row.inflow)}</TableCell><TableCell className="num text-right">{formatINR(row.outflow)}</TableCell><TableCell className="num text-right">{formatINR(row.inflow - row.outflow)}</TableCell><TableCell className="num text-right font-medium">{formatINR(row.projected)}</TableCell></TableRow>)}</TableBody></Table></SectionCard>
  </>;
}
