import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  FilterBar,
  FilterSelect,
  PageHeader,
  SampleNote,
  SectionCard,
  downloadCSV,
} from "@/components/finance/common";
import { buildBookStatement } from "@/finance/books";
import { REPORT_GROUPS, REPORT_NAMES, resolveReportKey, type ReportKey } from "@/finance/reports";
import { useFinance, useLedgerEntries } from "@/finance/store";
import { OPENING } from "@/finance/data";
import { formatCourseDuration, studentCourse, studentDepartment } from "@/finance/courses";
import {
  TODAY,
  formatDate,
  formatINR,
  inRange,
  installmentSchedule,
  outstanding,
  settlementStatus,
  studentPaid,
  sum,
  pettyDailyBalances,
} from "@/finance/logic";
import type { Student } from "@/finance/types";
import { ADMISSION_NO_FULL, ADMISSION_NO_SHORT } from "@/finance/labels";

type ReportPeriod = "daily" | "monthly" | "custom";

function validateReportSearch(search: Record<string, unknown>): {
  report?: string | undefined;
  tab?: string | undefined;
} {
  return {
    report: typeof search.report === "string" ? search.report : undefined,
    tab: typeof search.tab === "string" ? search.tab : undefined,
  };
}

export const Route = createFileRoute("/reports")({
  validateSearch: validateReportSearch,
  head: () => ({
    meta: [
      { title: "Financial Reports — Finance & Accounts" },
      {
        name: "description",
        content: "Income, expense, fee collection, settlement and financial statement reports.",
      },
      { property: "og:title", content: "Financial Reports — Finance & Accounts" },
      {
        property: "og:description",
        content: "Income, expense, fee collection, settlement and financial statement reports.",
      },
    ],
  }),
  component: ReportsPage,
});

interface Report {
  columns: string[];
  rows: (string | number)[][];
  numericCols?: number[];
  exportColumns?: string[];
  printColumns?: string[];
  noData?: boolean;
  emptyMessage?: string;
  book?: boolean;
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber!, 0)).toISOString().slice(0, 10);
}

function reportDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ReportsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const report = resolveReportKey(search.report, search.tab);
  useEffect(() => {
    if (search.report !== report || search.tab !== undefined) {
      navigate({ search: { report }, replace: true });
    }
  }, [navigate, report, search.report, search.tab]);

  return (
    <>
      <PageHeader crumbs={["Financial Reports", REPORT_NAMES[report]]} title="Financial Reports" />
      <SampleNote>
        Illustrative prototype reports generated from sample data — not audited or production-ready
        financial statements.
      </SampleNote>
      <ReportPanel
        reportKey={report}
        onReportChange={(next) => navigate({ search: { report: next } })}
      />
    </>
  );
}

function ReportPanel({
  reportKey,
  onReportChange,
}: {
  reportKey: ReportKey;
  onReportChange: (report: ReportKey) => void;
}) {
  const { students, payments, transactions, settlements, settings, courseCatalog, petty } =
    useFinance();
  const ledgerEntries = useLedgerEntries();
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [day, setDay] = useState(TODAY);
  const [month, setMonth] = useState(TODAY.slice(0, 7));
  const [customFrom, setCustomFrom] = useState(settings.financialYear.start);
  const [customTo, setCustomTo] = useState(TODAY);
  const [course, setCourse] = useState("all");
  const [department, setDepartment] = useState("all");
  const [generated, setGenerated] = useState(false);

  const from = period === "daily" ? day : period === "monthly" ? `${month}-01` : customFrom;
  const to = period === "daily" ? day : period === "monthly" ? lastDayOfMonth(month) : customTo;
  const asOn = period === "daily" ? day : period === "monthly" ? to : customTo;
  const asOnReport = reportKey === "balance-sheet" || reportKey === "outstanding-overdue-fees";
  const periodLine = asOnReport
    ? `As on: ${reportDateLabel(asOn)}`
    : period === "daily"
      ? `Date: ${reportDateLabel(day)}`
      : period === "monthly"
        ? `Month: ${new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
        : `Period: ${reportDateLabel(customFrom)} to ${reportDateLabel(customTo)}`;

  const studentMatches = (student: Student | undefined) => {
    if (!student) return false;
    const selected = studentCourse(student, courseCatalog);
    return (
      (department === "all" || studentDepartment(student, courseCatalog) === department) &&
      (course === "all" || (selected?.name ?? student.course) === course)
    );
  };
  const byId = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const courses = [...new Set(courseCatalog.courses.map((item) => item.name))];
  const showDepartment = [
    "income-report",
    "expense-report",
    "student-fee-collection",
    "department-wise-enrolment-fees",
    "course-wise-enrolment-fees",
    "outstanding-overdue-fees",
  ].includes(reportKey);
  const showCourse = [
    "income-report",
    "student-fee-collection",
    "department-wise-enrolment-fees",
    "course-wise-enrolment-fees",
    "outstanding-overdue-fees",
  ].includes(reportKey);

  const reportData: Report = (() => {
    const money = formatINR;
    const addTotal = (rows: (string | number)[][], total: (string | number)[]) => [...rows, total];
    switch (reportKey) {
      case "income-report":
      case "expense-report": {
        const want = reportKey === "income-report" ? "income" : "expense";
        const tx = transactions.filter(
          (transaction) => transaction.type === want && inRange(transaction.date, from, to),
        );
        const fees =
          want === "income"
            ? payments
                .filter(
                  (payment) =>
                    inRange(payment.date, from, to) && studentMatches(byId.get(payment.studentId)),
                )
                .map((payment) => ({
                  date: payment.date,
                  description: `Fee payment – ${byId.get(payment.studentId)?.name ?? payment.studentId}`,
                  category: "Student Fees",
                  method: payment.method,
                  reference: payment.reference || payment.receiptNo,
                  amount: payment.amount,
                }))
            : [];
        const entries = [...tx, ...fees].sort((a, b) => a.date.localeCompare(b.date));
        const rows = entries.map((entry) => [
          formatDate(entry.date),
          entry.description,
          entry.category,
          entry.method,
          entry.reference || "—",
          money(entry.amount),
        ]);
        return {
          columns: ["Date", "Description", "Category", "Method", "Reference", "Amount"],
          rows: entries.length
            ? addTotal(rows, [
                "Total",
                "",
                "",
                "",
                "",
                money(sum(entries.map((entry) => entry.amount))),
              ])
            : rows,
          numericCols: [5],
          noData: entries.length === 0,
        };
      }
      case "income-expenditure-summary": {
        const months = new Map<string, { income: number; expense: number }>();
        const bump = (date: string, key: "income" | "expense", amount: number) => {
          const id = date.slice(0, 7);
          const current = months.get(id) ?? { income: 0, expense: 0 };
          current[key] += amount;
          months.set(id, current);
        };
        payments
          .filter((payment) => inRange(payment.date, from, to))
          .forEach((payment) => bump(payment.date, "income", payment.amount));
        transactions
          .filter((transaction) => inRange(transaction.date, from, to))
          .forEach((transaction) => bump(transaction.date, transaction.type, transaction.amount));
        const values = [...months.entries()].sort(([a], [b]) => a.localeCompare(b));
        const income = sum(values.map(([, value]) => value.income));
        const expense = sum(values.map(([, value]) => value.expense));
        const rows = values.map(([id, value]) => [
          new Date(`${id}-01T00:00:00`).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          }),
          money(value.income),
          money(value.expense),
          money(value.income - value.expense),
        ]);
        return {
          columns: ["Month", "Income", "Expenditure", "Net"],
          rows: values.length
            ? addTotal(rows, ["Total", money(income), money(expense), money(income - expense)])
            : rows,
          numericCols: [1, 2, 3],
          noData: values.length === 0,
        };
      }
      case "student-fee-collection": {
        const entries = payments
          .filter(
            (payment) =>
              inRange(payment.date, from, to) && studentMatches(byId.get(payment.studentId)),
          )
          .sort((a, b) => a.date.localeCompare(b.date));
        const rows = entries.map((payment) => {
          const student = byId.get(payment.studentId);
          const linkedCourse = student ? studentCourse(student, courseCatalog) : undefined;
          return [
            formatDate(payment.date),
            payment.receiptNo,
            student?.name ?? payment.studentId,
            student ? studentDepartment(student, courseCatalog) : "—",
            linkedCourse?.name ?? student?.course ?? "—",
            student?.track ?? "—",
            student?.duration ? `${student.duration.value} ${student.duration.unit}` : "—",
            payment.method,
            money(payment.amount),
          ];
        });
        return {
          columns: [
            "Date",
            "Receipt",
            "Student",
            "Department",
            "Course",
            "Track",
            "Duration",
            "Method",
            "Amount",
          ],
          rows: entries.length
            ? addTotal(rows, [
                "Total",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                money(sum(entries.map((payment) => payment.amount))),
              ])
            : rows,
          numericCols: [8],
          noData: entries.length === 0,
        };
      }
      case "department-wise-enrolment-fees": {
        const values = courseCatalog.departments.map((name) => {
          const group = students.filter(
            (student) =>
              inRange(student.registeredOn, from, to) &&
              studentMatches(student) &&
              studentDepartment(student, courseCatalog) === name,
          );
          const ids = new Set(group.map((student) => student.id));
          const billed = sum(group.map((student) => student.totalFee));
          const collected = sum(
            payments
              .filter((payment) => ids.has(payment.studentId) && inRange(payment.date, from, to))
              .map((payment) => payment.amount),
          );
          const due = sum(
            group.map((student) =>
              Math.max(
                0,
                student.totalFee -
                  sum(
                    payments
                      .filter((payment) => payment.studentId === student.id && payment.date <= to)
                      .map((payment) => payment.amount),
                  ),
              ),
            ),
          );
          return { name, enrolments: group.length, billed, collected, due };
        });
        const totals = values.reduce(
          (result, value) => ({
            enrolments: result.enrolments + value.enrolments,
            billed: result.billed + value.billed,
            collected: result.collected + value.collected,
            due: result.due + value.due,
          }),
          { enrolments: 0, billed: 0, collected: 0, due: 0 },
        );
        return {
          columns: ["Department", "Enrolments", "Billed", "Collected", "Outstanding"],
          rows: addTotal(
            values.map((value) => [
              value.name,
              value.enrolments,
              money(value.billed),
              money(value.collected),
              money(value.due),
            ]),
            [
              "Total",
              totals.enrolments,
              money(totals.billed),
              money(totals.collected),
              money(totals.due),
            ],
          ),
          numericCols: [1, 2, 3, 4],
        };
      }
      case "course-wise-enrolment-fees": {
        const values = courseCatalog.courses.map((item) => {
          const group = students.filter(
            (student) =>
              inRange(student.registeredOn, from, to) &&
              studentMatches(student) &&
              studentCourse(student, courseCatalog)?.id === item.id,
          );
          const ids = new Set(group.map((student) => student.id));
          const billed = sum(group.map((student) => student.totalFee));
          const collected = sum(
            payments
              .filter((payment) => ids.has(payment.studentId) && inRange(payment.date, from, to))
              .map((payment) => payment.amount),
          );
          const due = sum(
            group.map((student) =>
              Math.max(
                0,
                student.totalFee -
                  sum(
                    payments
                      .filter((payment) => payment.studentId === student.id && payment.date <= to)
                      .map((payment) => payment.amount),
                  ),
              ),
            ),
          );
          return {
            department: item.department,
            name: item.name,
            enrolments: group.length,
            billed,
            collected,
            due,
          };
        });
        const totals = values.reduce(
          (result, value) => ({
            enrolments: result.enrolments + value.enrolments,
            billed: result.billed + value.billed,
            collected: result.collected + value.collected,
            due: result.due + value.due,
          }),
          { enrolments: 0, billed: 0, collected: 0, due: 0 },
        );
        return {
          columns: ["Department", "Course", "Enrolments", "Billed", "Collected", "Outstanding"],
          rows: addTotal(
            values.map((value) => [
              value.department,
              value.name,
              value.enrolments,
              money(value.billed),
              money(value.collected),
              money(value.due),
            ]),
            [
              "Total",
              "",
              totals.enrolments,
              money(totals.billed),
              money(totals.collected),
              money(totals.due),
            ],
          ),
          numericCols: [2, 3, 4, 5],
        };
      }
      case "outstanding-overdue-fees": {
        const paymentsAsOn = payments.filter((payment) => payment.date <= asOn);
        const values = students
          .filter((student) => studentMatches(student))
          .map((student) => {
            const paid = studentPaid(student.id, paymentsAsOn);
            const due = Math.max(0, student.totalFee - paid);
            const overdue = installmentSchedule(student, paid, asOn, paymentsAsOn).some(
              (installment) => installment.status === "Overdue" && installment.balance > 0,
            );
            return { student, paid, due, overdue };
          })
          .filter((value) => value.due > 0);
        const rows = values.map(({ student, paid, due, overdue }) => {
          const linkedCourse = studentCourse(student, courseCatalog);
          return [
            student.name,
            student.regNo,
            studentDepartment(student, courseCatalog),
            linkedCourse?.name ?? student.course,
            student.track ?? "—",
            student.duration ? formatCourseDuration(student.duration) : "—",
            money(student.totalFee),
            money(paid),
            money(due),
            overdue ? "Yes" : "No",
          ];
        });
        return {
          columns: [
            "Student",
            ADMISSION_NO_SHORT,
            "Department",
            "Course",
            "Track",
            "Duration",
            "Billed",
            "Paid",
            "Outstanding",
            "Overdue",
          ],
          exportColumns: [
            "Student",
            ADMISSION_NO_FULL,
            "Department",
            "Course",
            "Track",
            "Duration",
            "Billed",
            "Paid",
            "Outstanding",
            "Overdue",
          ],
          printColumns: [
            "Student",
            ADMISSION_NO_FULL,
            "Department",
            "Course",
            "Track",
            "Duration",
            "Billed",
            "Paid",
            "Outstanding",
            "Overdue",
          ],
          rows: values.length
            ? addTotal(rows, [
                "Total",
                "",
                "",
                "",
                "",
                "",
                money(sum(values.map(({ student }) => student.totalFee))),
                money(sum(values.map((value) => value.paid))),
                money(sum(values.map((value) => value.due))),
                "",
              ])
            : rows,
          numericCols: [6, 7, 8],
          noData: values.length === 0,
        };
      }
      case "settlement-report": {
        const values = settlements
          .filter((settlement) => inRange(settlement.date, from, to))
          .sort((a, b) => a.date.localeCompare(b.date));
        const recorded = sum(values.map((value) => value.recorded));
        const actualValues = values.filter((value) => value.actual !== null);
        const actual = sum(actualValues.map((value) => value.actual ?? 0));
        const difference = sum(actualValues.map((value) => (value.actual ?? 0) - value.recorded));
        const rows = values.map((settlement) => [
          formatDate(settlement.date),
          settlement.method,
          settlement.count,
          money(settlement.recorded),
          settlement.actual === null ? "—" : money(settlement.actual),
          settlement.actual === null ? "—" : money(settlement.actual - settlement.recorded),
          settlementStatus(settlement),
        ]);
        return {
          columns: ["Date", "Method", "Receipts", "Recorded", "Actual", "Difference", "Status"],
          rows: values.length
            ? addTotal(rows, [
                "Total",
                "",
                sum(values.map((value) => value.count)),
                money(recorded),
                money(actual),
                money(difference),
                "",
              ])
            : rows,
          numericCols: [2, 3, 4, 5],
          noData: values.length === 0,
        };
      }
      case "cash-book":
      case "bank-book": {
        const kind = reportKey === "cash-book" ? "cash" : "bank";
        const book = buildBookStatement(ledgerEntries, kind, from, to);
        const isCashBook = kind === "cash";
        const rows = [
          ["", "Opening balance", "", "—", "—", "—", money(book.opening)],
          ...book.rows.map((entry) => [
            formatDate(entry.date),
            entry.description,
            entry.category,
            entry.receiptNo || entry.reference || "—",
            entry.type === "income" ? money(entry.amount) : "—",
            entry.type === "expense" ? money(entry.amount) : "—",
            money(entry.balance),
          ]),
          ["", "Total", "", "—", money(book.totalReceived), money(book.totalPaid), "—"],
          ["", "Closing balance", "", "—", "—", "—", money(book.closing)],
        ];
        return {
          columns: [
            "Date",
            "Particulars",
            "Ledger Name",
            "Receipt No.",
            `${isCashBook ? "Cash" : "Bank"} Received (₹)`,
            `${isCashBook ? "Cash" : "Bank"} Paid (₹)`,
            "Balance (₹)",
          ],
          rows,
          numericCols: [4, 5, 6],
          book: true,
          noData: book.rows.length === 0,
          emptyMessage: `No ${kind} entries in the selected period.`,
        };
      }
      case "balance-sheet": {
        const cash = buildBookStatement(ledgerEntries, "cash", "0000-01-01", asOn).closing;
        const bank = buildBookStatement(ledgerEntries, "bank", "0000-01-01", asOn).closing;
        const pettyBalance =
          pettyDailyBalances(petty, OPENING.petty, asOn).at(-1)?.closing ?? OPENING.petty;
        const paymentsAsOn = payments.filter((payment) => payment.date <= asOn);
        const feeOutstanding = sum(students.map((student) => outstanding(student, paymentsAsOn)));
        return {
          columns: ["Item", "Amount"],
          rows: [
            ["Cash in hand", money(cash)],
            ["Bank balance", money(bank)],
            ["Petty cash", money(pettyBalance)],
            ["Outstanding student fees (receivable)", money(feeOutstanding)],
            ["Total assets (illustrative)", money(cash + bank + pettyBalance + feeOutstanding)],
          ],
          numericCols: [1],
        };
      }
      case "cash-flow-statement": {
        const income =
          sum(
            payments
              .filter((payment) => inRange(payment.date, from, to))
              .map((payment) => payment.amount),
          ) +
          sum(
            transactions
              .filter(
                (transaction) =>
                  transaction.type === "income" && inRange(transaction.date, from, to),
              )
              .map((transaction) => transaction.amount),
          );
        const expense = sum(
          transactions
            .filter(
              (transaction) =>
                transaction.type === "expense" && inRange(transaction.date, from, to),
            )
            .map((transaction) => transaction.amount),
        );
        const cash = buildBookStatement(ledgerEntries, "cash", "0000-01-01", to).closing;
        const bank = buildBookStatement(ledgerEntries, "bank", "0000-01-01", to).closing;
        return {
          columns: ["Item", "Amount"],
          rows: [
            ["Total inflows (fees + income)", money(income)],
            ["Total outflows (expenses)", money(expense)],
            ["Net cash flow for period", money(income - expense)],
            ["Closing cash balance", money(cash)],
            ["Closing bank balance", money(bank)],
          ],
          numericCols: [1],
        };
      }
    }
  })();

  const filename = [settings.institution.name, REPORT_NAMES[reportKey], periodLine]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const csvRows = reportData.rows.map((row) => row.map(String));

  return (
    <SectionCard>
      <FilterBar>
        <Select
          value={reportKey}
          onValueChange={(value) => {
            onReportChange(value as ReportKey);
            setGenerated(false);
          }}
        >
          <SelectTrigger aria-label="Report" className="w-full sm:w-[280px]">
            <SelectValue placeholder="Report" />
          </SelectTrigger>
          <SelectContent>
            {REPORT_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.reports.map(([key, name]) => (
                  <SelectItem key={key} value={key}>
                    {name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={period}
          onValueChange={(value) => {
            setPeriod(value as ReportPeriod);
            setGenerated(false);
          }}
        >
          <SelectTrigger aria-label="Period" className="w-full sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
        {period === "daily" && (
          <Input
            aria-label="Date"
            type="date"
            className="w-[160px]"
            value={day}
            onChange={(event) => {
              setDay(event.target.value);
              setGenerated(false);
            }}
          />
        )}
        {period === "monthly" && (
          <Input
            aria-label="Month"
            type="month"
            className="w-[160px]"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setGenerated(false);
            }}
          />
        )}
        {period === "custom" && (
          <>
            <Input
              aria-label="From date"
              type="date"
              className="w-[160px]"
              value={customFrom}
              onChange={(event) => {
                setCustomFrom(event.target.value);
                setGenerated(false);
              }}
            />
            <Input
              aria-label="To date"
              type="date"
              className="w-[160px]"
              value={customTo}
              onChange={(event) => {
                setCustomTo(event.target.value);
                setGenerated(false);
              }}
            />
          </>
        )}
        {showDepartment && (
          <FilterSelect
            label="Department"
            value={department}
            onChange={(value) => {
              setDepartment(value);
              setGenerated(false);
            }}
            options={courseCatalog.departments}
          />
        )}
        {showCourse && (
          <FilterSelect
            label="Course"
            value={course}
            onChange={(value) => {
              setCourse(value);
              setGenerated(false);
            }}
            options={courses}
          />
        )}
        <Button onClick={() => setGenerated(true)}>Generate report</Button>
        {generated && (
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1 h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCSV(filename, reportData.exportColumns ?? reportData.columns, csvRows)
              }
            >
              <Download className="mr-1 h-4 w-4" />
              Export CSV
            </Button>
          </>
        )}
      </FilterBar>
      {!generated ? (
        <EmptyState message="Choose a period and generate the selected report." />
      ) : (
        <div
          className={`print-area financial-report-print${reportData.book ? " financial-report-book" : ""}`}
        >
          <header className="financial-report-header">
            <p className="font-semibold">{settings.institution.name}</p>
            <h2 className="text-lg font-bold">{REPORT_NAMES[reportKey]}</h2>
            <p>{periodLine}</p>
          </header>
          {(reportKey === "balance-sheet" || reportKey === "cash-flow-statement") && (
            <p className="mb-3 text-center text-xs text-muted-foreground">
              Illustrative preview only — not audited or production-ready.
            </p>
          )}
          {reportData.noData && !reportData.book ? (
            <EmptyState
              message={reportData.emptyMessage ?? "No data for this report in the selected period."}
            />
          ) : (
            <>
              {reportData.noData && reportData.book && (
                <p className="mb-2 text-sm text-muted-foreground">{reportData.emptyMessage}</p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    {reportData.columns.map((column, index) => (
                      <TableHead
                        key={column}
                        className={reportData.numericCols?.includes(index) ? "text-right" : ""}
                      >
                        <span className="print:hidden">{column}</span>
                        {reportData.printColumns?.[index] && (
                          <span className="hidden print:inline">
                            {reportData.printColumns[index]}
                          </span>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell
                          key={cellIndex}
                          className={[
                            reportData.numericCols?.includes(cellIndex) ? "num text-right" : "",
                            reportData.book && cellIndex === 1
                              ? "whitespace-normal break-words"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {reportData.book && (
                <div className="financial-report-signatures">
                  <div>Prepared by</div>
                  <div>Authorised signature</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
