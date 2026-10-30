import type {
  FeePayment,
  InstallmentStatus,
  PaymentMethod,
  Settlement,
  SettlementStatus,
  Student,
  Transaction,
  PettyEntry,
} from "./types";
import { demoDate } from "./demoDates";

export const TODAY = demoDate(0);

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const formatINR = (n: number) => inr.format(Math.round(n));
export const formatDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface PettyDailyBalance {
  date: string;
  opening: number;
  received: number;
  expenses: number;
  closing: number;
}

export function pettyDailyBalances(entries: PettyEntry[], openingBalance: number, throughDate: string): PettyDailyBalance[] {
  if (!entries.length) return [];
  const startDate = entries.reduce((first, entry) => entry.date < first ? entry.date : first, entries[0]!.date);
  const byDate = new Map<string, PettyEntry[]>();
  entries.filter((entry) => entry.date <= throughDate).forEach((entry) => {
    const dayEntries = byDate.get(entry.date) ?? [];
    dayEntries.push(entry);
    byDate.set(entry.date, dayEntries);
  });
  const balances: PettyDailyBalance[] = [];
  let opening = openingBalance;
  const day = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${throughDate}T00:00:00Z`);
  while (day <= end) {
    const date = day.toISOString().slice(0, 10);
    const dayEntries = byDate.get(date) ?? [];
    const received = sum(dayEntries.filter((entry) => entry.kind === "received").map((entry) => entry.amount));
    const expenses = sum(dayEntries.filter((entry) => entry.kind === "paid").map((entry) => entry.amount));
    const closing = opening + received - expenses;
    balances.push({ date, opening, received, expenses, closing });
    opening = closing;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return balances;
}

export const studentPaid = (studentId: string, payments: FeePayment[]) =>
  sum(payments.filter((p) => p.studentId === studentId).map((p) => p.amount));

/** Outstanding = billed − recorded payments. No concessions exist in this module. */
export const outstanding = (s: Student, payments: FeePayment[]) =>
  Math.max(0, s.totalFee - studentPaid(s.id, payments));

export function installmentSchedule(s: Student, paid: number, today = TODAY, payments: FeePayment[] = []) {
  const explicit = new Map<string, number>();
  payments.filter((payment) => payment.studentId === s.id).forEach((payment) => {
    payment.allocations?.forEach((allocation) => explicit.set(
      allocation.installmentId,
      (explicit.get(allocation.installmentId) ?? 0) + allocation.amount,
    ));
  });
  const explicitlyAllocated = sum([...explicit.values()]);
  let remaining = Math.max(0, paid - explicitlyAllocated);
  return s.installments.map((inst, index) => {
    const installmentId = `${s.id}-I${String(index + 1).padStart(2, "0")}`;
    const allocated = explicit.get(installmentId) ?? 0;
    const carried = Math.min(Math.max(0, inst.amount - allocated), Math.max(0, remaining));
    const covered = Math.min(inst.amount, allocated + carried);
    remaining -= carried;
    let status: InstallmentStatus;
    if (covered >= inst.amount) status = "Paid";
    else if (inst.due < today) status = "Overdue";
    else if (covered > 0) status = "Partially Paid";
    else status = "Pending";
    return { ...inst, paid: covered, balance: inst.amount - covered, status };
  });
}

export function billStatus(s: Student, payments: FeePayment[], today = TODAY): InstallmentStatus {
  const paid = studentPaid(s.id, payments);
  if (paid >= s.totalFee) return "Paid";
  const sched = installmentSchedule(s, paid, today, payments);
  if (sched.some((i) => i.status === "Overdue")) return "Overdue";
  return paid > 0 ? "Partially Paid" : "Pending";
}

export function nextDue(s: Student, payments: FeePayment[], today = TODAY) {
  const sched = installmentSchedule(s, studentPaid(s.id, payments), today, payments);
  return sched.find((i) => i.status !== "Paid")?.due ?? null;
}

export const denominationTotal = (counts: Record<number, number>) =>
  sum(Object.entries(counts).map(([d, q]) => Number(d) * (Number(q) || 0)));

export function cashComparison(book: number, physical: number) {
  const diff = physical - book;
  return { diff, status: diff === 0 ? "Matched" : diff < 0 ? "Shortage" : "Excess" } as const;
}

export function settlementStatus(s: Pick<Settlement, "finalized" | "actual" | "recorded">): SettlementStatus {
  if (s.finalized) return "Finalized";
  if (s.actual === null) return "Pending Review";
  return s.actual === s.recorded ? "Matched" : "Difference Found";
}

export type AttentionItem =
  | { key: "overdue"; label: string; value: string }
  | { key: "settlements"; label: string; value: string }
  | { key: "petty"; label: string; value: string }
  | { key: "cash"; label: string; value: string }
  | { key: "bank"; label: string; value: string };

export function getNeedsAttention({
  students,
  payments,
  settlements,
  cashBalance,
  bankBalance,
  physicalCount,
}: {
  students: Student[];
  payments: FeePayment[];
  settlements: Settlement[];
  cashBalance: number;
  bankBalance: number;
  physicalCount: number | null;
}): AttentionItem[] {
  const installments = students.flatMap((student) =>
    installmentSchedule(student, studentPaid(student.id, payments), TODAY, payments).map((installment) => ({ ...installment, student })),
  );
  const overdue = installments.filter((installment) => installment.status === "Overdue" && installment.balance > 0);
  const differences = settlements.filter((settlement) => settlementStatus(settlement) === "Difference Found");
  const cashDifference = physicalCount === null ? null : cashComparison(cashBalance, physicalCount);
  const items: AttentionItem[] = [];

  if (overdue.length) {
    items.push({
      key: "overdue",
      label: `${overdue.length} overdue installment${overdue.length === 1 ? "" : "s"}`,
      value: formatINR(sum(overdue.map((installment) => installment.balance))),
    });
  }
  if (differences.length) {
    items.push({ key: "settlements", label: "Settlements with a difference", value: String(differences.length) });
  }
  if (cashDifference && cashDifference.diff !== 0) {
    items.push({
      key: "petty",
      label: `Petty cash ${cashDifference.status.toLowerCase()}`,
      value: formatINR(Math.abs(cashDifference.diff)),
    });
  }
  if (cashBalance < 0) {
    items.push({ key: "cash", label: "Negative cash balance", value: `−${formatINR(Math.abs(cashBalance))}` });
  }
  if (bankBalance < 0) {
    items.push({ key: "bank", label: "Negative bank balance", value: `−${formatINR(Math.abs(bankBalance))}` });
  }
  return items;
}

/** Recorded receipts for a date + method, drawn from existing records (never creates income). */
export function recordedFor(date: string, method: PaymentMethod, payments: FeePayment[], txns: Transaction[]) {
  const p = payments.filter((x) => x.date === date && x.method === method);
  const t = txns.filter((x) => x.type === "income" && x.date === date && x.method === method);
  return { count: p.length + t.length, total: sum(p.map((x) => x.amount)) + sum(t.map((x) => x.amount)) };
}

export const isCash = (m: PaymentMethod) => m === "Cash";
export const inRange = (d: string, from?: string, to?: string) => (!from || d >= from) && (!to || d <= to);

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
  "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n: number) => (n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`);
const threeDigits = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", n % 100 ? twoDigits(n % 100) : ""].filter(Boolean).join(" ");

/** Whole rupees in words using the Indian system (Thousand, Lakh, Crore), e.g. "Rupees One Lakh Forty Thousand Only". */
export function amountInWords(amount: number): string {
  let n = Math.floor(Math.max(0, amount));
  if (n === 0) return "Rupees Zero Only";
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  const parts: string[] = [
    crore ? `${crore >= 100 ? amountInWords(crore).replace(/^Rupees | Only$/g, "") : twoDigits(crore)} Crore` : "",
    lakh ? `${twoDigits(lakh)} Lakh` : "",
    thousand ? `${twoDigits(thousand)} Thousand` : "",
    n ? threeDigits(n) : "",
  ].filter(Boolean);
  return `Rupees ${parts.join(" ")} Only`;
}
