/** Pure helpers for creating a student bill. There is no discount or concession: billed = full course fee. */

import type { FeePayment, PaymentMethod, Student } from "./types";
import { installmentSchedule, studentPaid, sum, TODAY } from "./logic";

const pad = (n: number) => String(n).padStart(2, "0");

export const PAYMENT_REFERENCE_METHODS = ["UPI", "Bank Transfer", "Cheque"] as const;
export type PaymentReferenceMethod = (typeof PAYMENT_REFERENCE_METHODS)[number];

export function getPaymentReferenceRule(method: PaymentMethod | "") {
  switch (method) {
    case "UPI":
      return {
        method: "UPI",
        label: "UPI transaction ID",
        helperText: "From the payment app or SMS",
      } as const;
    case "Bank Transfer":
      return {
        method: "Bank Transfer",
        label: "Bank reference / UTR no.",
        helperText: "NEFT, RTGS or IMPS reference",
      } as const;
    case "Cheque":
      return {
        method: "Cheque",
        label: "Cheque no.",
        helperText: "The 6-digit number printed on the cheque",
      } as const;
    default:
      return null;
  }
}

export function getPaymentReferenceState({
  method,
  reference,
  personId,
  recordedPayments,
}: {
  method: PaymentMethod | "";
  reference: string;
  personId?: string;
  recordedPayments?: Array<{
    personId?: string | null;
    method: PaymentMethod;
    reference: string;
  }>;
}) {
  const rule = getPaymentReferenceRule(method);
  const normalizedReference = reference.trim();
  if (!rule) {
    return {
      rule: null,
      helperText: "",
      label: "",
      error: "",
      normalizedReference: "",
      isValid: true,
    };
  }

  let error = "";
  if (!normalizedReference) {
    error = `${rule.label} is required.`;
  } else if (rule.method === "Cheque" && !/^\d{6}$/.test(normalizedReference)) {
    error = "Cheque no. must be a 6-digit number.";
  } else if (
    recordedPayments &&
    recordedPayments.some(
      (payment) =>
        payment.method !== "Cash" &&
        payment.reference.trim().toLowerCase() === normalizedReference.toLowerCase(),
    )
  ) {
    error = "This reference is already used for another payment.";
  }

  return {
    rule,
    helperText: rule.helperText,
    label: rule.label,
    error,
    normalizedReference,
    isValid: !error,
  };
}

/** Adds whole months to an ISO date, clamping to the last day of the target month. Timezone-safe. */
export function addMonthsISO(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = (m - 1) + months;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`;
}

/** Even split, last installment absorbs rounding; due dates one month apart. */
export function monthlyInstallments(total: number, count: number, firstDue: string) {
  const n = Math.min(12, Math.max(1, Math.floor(count)));
  const per = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    label: `Instalment ${i + 1}`,
    due: addMonthsISO(firstDue, i),
    amount: i === n - 1 ? total - per * (n - 1) : per,
  }));
}

export function normalizeAdmissionNo(value: string) {
  return value.replace(/[-\s]/g, "").toUpperCase();
}

export type FeeVerificationStatus =
  | "Fee Paid"
  | "Partially Paid"
  | "Fee Payment Pending"
  | "Not found";

export interface FeeVerificationInstallment {
  label: string;
  due: string;
  amount: number;
  paid: number;
  outstanding: number;
}

export interface FeeVerificationResult {
  status: FeeVerificationStatus;
  required: number;
  paid: number;
  outstanding: number;
  installments: FeeVerificationInstallment[];
  remark?: string;
}

export function verifyFeeForMonth(
  student: { admissionNo: string },
  feeMonth: string,
  bills: Student[],
  payments: FeePayment[],
): FeeVerificationResult {
  const month = feeMonth.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!month) throw new RangeError(`Invalid fee month: ${feeMonth}`);

  const lastDay = new Date(Date.UTC(Number(month[1]), Number(month[2]), 0))
    .toISOString()
    .slice(0, 10);
  const bill = bills.find(
    (candidate) =>
      candidate.regNo &&
      normalizeAdmissionNo(candidate.regNo) === normalizeAdmissionNo(student.admissionNo),
  );
  if (!bill || bill.installments.length === 0) {
    return {
      status: "Not found",
      required: 0,
      paid: 0,
      outstanding: 0,
      installments: [],
    };
  }

  const schedule = installmentSchedule(
    bill,
    studentPaid(bill.id, payments),
    TODAY,
    payments,
  );
  const installments = schedule
    .filter((installment) => installment.due <= lastDay)
    .map((installment) => ({
      label: installment.label,
      due: installment.due,
      amount: installment.amount,
      paid: installment.paid,
      outstanding: installment.balance,
    }));
  const required = sum(installments.map((installment) => installment.amount));
  const paid = sum(installments.map((installment) => installment.paid));
  const outstanding = required - paid;
  const status =
    outstanding === 0
      ? "Fee Paid"
      : paid > 0
        ? "Partially Paid"
        : "Fee Payment Pending";

  return {
    status,
    required,
    paid,
    outstanding,
    installments,
    ...(installments.length === 0 ? { remark: `No installment due up to ${feeMonth}` } : {}),
  };
}

export function canonicalAdmissionNo(value: string) {
  const compact = normalizeAdmissionNo(value);
  const match = compact.match(/^ADM2026(\d{1,4})$/);
  return match ? `ADM-2026-${match[1]!.padStart(4, "0")}` : value.trim();
}

/** Next free ADM-2026-xxxx number, above the highest one already used. */
export function nextAdmissionNo(existing: string[], prefix = "ADM-2026-") {
  const compactPrefix = normalizeAdmissionNo(prefix);
  const used = existing
    .map((value) => normalizeAdmissionNo(value))
    .filter((value) => value.startsWith(compactPrefix))
    .map((value) => Number(value.slice(compactPrefix.length)))
    .filter(Number.isFinite);
  const next = Math.max(100, ...used) + 1;
  return canonicalAdmissionNo(`${prefix}${String(next).padStart(4, "0")}`);
}

export function isValidPhone(phone: string) {
  return /^\d{10}$/.test(phone.replace(/\s/g, "").replace(/^\+91/, ""));
}
