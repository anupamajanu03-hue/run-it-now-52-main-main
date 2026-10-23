import { installmentSchedule } from "./logic";
import type { FeePayment, Student } from "./types";

/** Figures as they stood right after one payment: balance and next due date. */
export function receiptFigures(s: Student, payment: FeePayment, payments: FeePayment[]) {
  const ordered = payments
    .filter((p) => p.studentId === s.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.receiptNo.localeCompare(b.receiptNo, undefined, { numeric: true }));
  const idx = ordered.findIndex((p) => p.id === payment.id);
  const upTo = (idx === -1 ? [...ordered, payment] : ordered.slice(0, idx + 1)).reduce((t, p) => t + p.amount, 0);
  const balance = Math.max(0, s.totalFee - upTo);
  const next = installmentSchedule(s, upTo, undefined, ordered.slice(0, idx + 1)).find((i) => i.paid < i.amount);
  return { balance, nextDue: balance > 0 && next ? next.due : null };
}
