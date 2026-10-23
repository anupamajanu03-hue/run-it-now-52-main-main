export const REPORT_GROUPS = [
  {
    label: "Income & expense",
    reports: [
      ["income-report", "Income Report"],
      ["expense-report", "Expense Report"],
      ["income-expenditure-summary", "Income & Expenditure Summary"],
    ],
  },
  {
    label: "Fee collection",
    reports: [
      ["student-fee-collection", "Student Fee Collection"],
      ["department-wise-enrolment-fees", "Department-wise Enrolment & Fees"],
      ["course-wise-enrolment-fees", "Course-wise Enrolment & Fees"],
    ],
  },
  { label: "Dues", reports: [["outstanding-overdue-fees", "Outstanding & Overdue Fees"]] },
  { label: "Settlements", reports: [["settlement-report", "Settlement Report"]] },
  {
    label: "Books & statements",
    reports: [
      ["cash-book", "Cash Book"],
      ["bank-book", "Bank Book"],
      ["balance-sheet", "Balance Sheet"],
      ["cash-flow-statement", "Cash Flow Statement"],
    ],
  },
] as const;

export type ReportKey = (typeof REPORT_GROUPS)[number]["reports"][number][0];
const REPORTS: ReadonlyArray<readonly [ReportKey, string]> = REPORT_GROUPS.flatMap(
  (group): ReadonlyArray<readonly [ReportKey, string]> => group.reports,
);
export const REPORT_NAMES = Object.fromEntries(REPORTS) as Record<ReportKey, string>;
const LEGACY_TAB_REPORT: Record<string, ReportKey> = {
  "income-expense": "income-report",
  fees: "student-fee-collection",
  outstanding: "outstanding-overdue-fees",
  settlement: "settlement-report",
  statements: "cash-book",
};
const REPORT_KEYS = new Set<string>(REPORTS.map(([key]) => key));

export function resolveReportKey(report?: string, tab?: string): ReportKey {
  if (report && REPORT_KEYS.has(report)) return report as ReportKey;
  if (tab && LEGACY_TAB_REPORT[tab]) return LEGACY_TAB_REPORT[tab];
  return "income-report";
}
