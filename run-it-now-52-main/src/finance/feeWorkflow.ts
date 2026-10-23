import { addDays, differenceInCalendarDays } from "date-fns";
import type {
  AdministrationDetailsSnapshot,
  FeePayment,
  FeeWorkflowPayment,
  Handoff,
  Installment,
  InstallmentAllocation,
  InstallmentStatus,
  Person,
  Student,
  StudentApplicationDetails,
} from "./types";
import {
  ADMINISTRATION_DETAILS_SENT_TEXT,
  ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
  ADMISSION_NO_RECEIVED_TEXT,
  DEMO_BILLING_SCENARIO_PERSON_IDS,
  DEMO_NEW_APPLICANTS,
  DEMO_APPLICANT_PAYMENTS,
  DEMO_ADMITTED_APPLICATIONS,
  DEMO_SCENARIO_HANDOFF_DATES,
  DEMO_SCENARIO_PAYMENT_SPECS,
  DEMO_SCENARIO_PEOPLE,
  HANDOFF_REQUIRES_PAID_INSTALLMENTS,
  MAX_REMINDERS,
  REMINDER_LEAD_DAYS,
  REQUIRE_APPLICATION_REVIEW,
  newDemoApplicants,
  personFromStudent,
} from "./feeWorkflowConfig";
import { TODAY, sum } from "./logic";

export interface FeeWorkflowState {
  persons: Person[];
  payments: FeeWorkflowPayment[];
  handoffs: Handoff[];
}

export interface PaymentNotificationPayload {
  personId: string;
  applicationId: string;
  name: string;
  contact: string;
  email: string;
  admissionNo: string;
  note: string;
  payments: {
    id: string;
    date: string;
    amount: number;
    installmentsCovered: { label: string; amount: number }[];
    remainingBalance: number;
  }[];
}

export function appearsInBilling(person: Person, payments: FeeWorkflowPayment[]): boolean {
  return person.billCreated === true || payments.some((payment) => payment.personId === person.id);
}

export function createNewFeeWorkflowPayment(
  payment: Omit<FeeWorkflowPayment, "id" | "adminNotified">,
  id: string,
): FeeWorkflowPayment {
  return { ...payment, id, adminNotified: false };
}

export function areAllPaymentsAdministrationNotified(payments: FeeWorkflowPayment[]): boolean {
  return payments.length > 0 && payments.every((payment) => payment.adminNotified);
}

export function markPaymentsAdministrationNotified(
  payments: FeeWorkflowPayment[],
  paymentIds: string[],
): FeeWorkflowPayment[] {
  const ids = new Set(paymentIds);
  let changed = false;
  const updated = payments.map((payment) => {
    if (!ids.has(payment.id) || payment.adminNotified) return payment;
    changed = true;
    return { ...payment, adminNotified: true };
  });
  return changed ? updated : payments;
}

function wasPaymentAdministrationNotified(payment: FeeWorkflowPayment, handoffs: Handoff[]) {
  return (
    payment.adminNotified ||
    handoffs.some(
      (handoff) =>
        handoff.personId === payment.personId &&
        handoff.target === "Administration" &&
        handoff.history.some(
          (entry) =>
            entry.referenceId === payment.id && entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
        ),
    )
  );
}

export function studentFromAdmittedPerson(person: Person, admissionNo: string): Student {
  return {
    id: person.id,
    applicationId: person.applicationId,
    name: person.name,
    regNo: admissionNo,
    admissionStatus: "Admitted",
    course: person.course,
    phone: person.contact,
    email: person.email,
    registeredOn: person.appliedOn,
    totalFee: sum(person.plan.map((installment) => installment.amountDue)),
    installments: person.plan.map((installment) => ({
      label: installment.label,
      due: installment.dueDate,
      amount: installment.amountDue,
    })),
    applicationDetails: person.applicationDetails,
  };
}

export function validateAdmissionNo(
  admissionNo: string,
  personId: string,
  persons: Person[],
  students: Student[],
): "valid" | "invalid" | "duplicate" {
  const normalized = admissionNo.trim();
  if (!/^ADM2026-\d{3}$/.test(normalized)) return "invalid";
  const duplicatePerson = persons.some(
    (person) =>
      person.id !== personId && person.admissionNo?.toLowerCase() === normalized.toLowerCase(),
  );
  const duplicateStudent = students.some(
    (student) =>
      student.id !== personId &&
      !!student.regNo &&
      student.regNo.toLowerCase() === normalized.toLowerCase(),
  );
  return duplicatePerson || duplicateStudent ? "duplicate" : "valid";
}

export function mergeBillingPayments(
  existing: FeePayment[],
  workflowPayments: FeeWorkflowPayment[],
  personId: string,
): FeePayment[] {
  const existingIds = new Set(existing.map((payment) => payment.id));
  const merged = [...existing];
  for (const payment of workflowPayments) {
    if (payment.personId !== personId || existingIds.has(payment.id)) continue;
    existingIds.add(payment.id);
    merged.push({
      id: payment.id,
      studentId: personId,
      date: payment.date,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      receiptNo: payment.receiptNo,
      allocations: payment.allocations,
    });
  }
  return merged;
}

export function feeWorkflowPaymentStatus(
  person: Person,
  payments: FeeWorkflowPayment[],
): Person["paymentStatus"] {
  const totals = personTotals(person, payments);
  if (totals.outstanding <= 0) return "Paid";
  return totals.paid > 0 ? "Partially paid" : "Unpaid";
}

export function installmentPaid(installmentId: string, payments: FeeWorkflowPayment[]): number {
  return sum(
    payments.flatMap((payment) =>
      payment.allocations
        .filter((allocation) => allocation.installmentId === installmentId)
        .map((allocation) => allocation.amount),
    ),
  );
}

export function installmentOutstanding(
  installment: Installment,
  payments: FeeWorkflowPayment[],
): number {
  return Math.max(0, installment.amountDue - installmentPaid(installment.id, payments));
}

export function installmentStatus(
  installment: Installment,
  payments: FeeWorkflowPayment[],
  today = TODAY,
): InstallmentStatus {
  const outstanding = installmentOutstanding(installment, payments);
  if (outstanding === 0) return "Paid";
  if (installment.dueDate < today) return "Overdue";
  if (outstanding < installment.amountDue) return "Partially Paid";
  return "Pending";
}

export function installmentDaysOverdue(installment: Installment, today = TODAY): number {
  if (installment.dueDate >= today) return 0;
  return differenceInCalendarDays(
    new Date(`${today}T00:00:00`),
    new Date(`${installment.dueDate}T00:00:00`),
  );
}

export type InstallmentFollowUpStatus =
  "Reminder Due" | "Reminder Sent" | "In-Person Follow-Up Required" | null;

export function installmentFollowUpStatus(
  installment: Installment,
  payments: FeeWorkflowPayment[],
  today = TODAY,
): InstallmentFollowUpStatus {
  if (installmentOutstanding(installment, payments) <= 0) return null;
  if (
    installmentStatus(installment, payments, today) === "Overdue" &&
    installment.reminders.length >= MAX_REMINDERS
  )
    return "In-Person Follow-Up Required";
  if (installment.reminders.length > 0) return "Reminder Sent";
  const reminderDueDate = addDays(new Date(`${today}T00:00:00`), REMINDER_LEAD_DAYS)
    .toISOString()
    .slice(0, 10);
  if (installment.dueDate <= reminderDueDate) return "Reminder Due";
  return null;
}

export function isRecentlyPaidInstallment(
  installment: Installment,
  payments: FeeWorkflowPayment[],
  today = TODAY,
  recentDays = 7,
): boolean {
  if (installmentOutstanding(installment, payments) > 0) return false;
  const cutoff = addDays(new Date(`${today}T00:00:00`), -recentDays)
    .toISOString()
    .slice(0, 10);
  return payments.some(
    (payment) =>
      payment.date >= cutoff &&
      payment.allocations.some(
        (allocation) => allocation.installmentId === installment.id && allocation.amount > 0,
      ),
  );
}

export function personTotals(person: Person, payments: FeeWorkflowPayment[], today = TODAY) {
  const payable = sum(person.plan.map((installment) => installment.amountDue));
  const paid = sum(person.plan.map((installment) => installmentPaid(installment.id, payments)));
  const outstanding = sum(
    person.plan.map((installment) => installmentOutstanding(installment, payments)),
  );
  const nextDueInstallment =
    person.plan.find((installment) => installmentOutstanding(installment, payments) > 0) ?? null;
  const daysOverdue = person.plan.reduce((maximum, installment) => {
    if (installmentOutstanding(installment, payments) <= 0 || installment.dueDate >= today)
      return maximum;
    return Math.max(
      maximum,
      differenceInCalendarDays(
        new Date(`${today}T00:00:00`),
        new Date(`${installment.dueDate}T00:00:00`),
      ),
    );
  }, 0);
  return { payable, paid, outstanding, nextDueInstallment, daysOverdue };
}

export function buildPaymentNotificationPayload(
  person: Person,
  payments: FeeWorkflowPayment[],
): PaymentNotificationPayload {
  const personPayments = payments
    .filter((payment) => payment.personId === person.id)
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const includedPayments = personPayments.filter((payment) => !payment.adminNotified);
  const note =
    "Tells Administration about the payment so the batch and classes can be created or updated (simulated)";
  return {
    personId: person.id,
    applicationId: person.applicationId,
    name: person.name,
    contact: person.contact,
    email: person.email,
    admissionNo: person.admissionNo ?? "",
    note,
    payments: includedPayments.map((payment) => {
      const throughPayment = personPayments.filter(
        (item) => item.date < payment.date || (item.date === payment.date && item.id <= payment.id),
      );
      return {
        id: payment.id,
        date: payment.date,
        amount: payment.amount,
        installmentsCovered: payment.allocations.map((allocation) => ({
          label:
            person.plan.find((installment) => installment.id === allocation.installmentId)?.label ??
            allocation.installmentId,
          amount: allocation.amount,
        })),
        remainingBalance: personTotals(person, throughPayment).outstanding,
      };
    }),
  };
}

export function allocatePayment(
  plan: Installment[],
  payments: FeeWorkflowPayment[],
  amount: number,
  targetInstallmentId?: string,
): InstallmentAllocation[] {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new RangeError("Payment amount must be greater than zero.");
  const outstanding = sum(plan.map((installment) => installmentOutstanding(installment, payments)));
  if (amount > outstanding) throw new RangeError("Payment amount exceeds the outstanding balance.");

  const targetIndex = targetInstallmentId
    ? plan.findIndex((installment) => installment.id === targetInstallmentId)
    : -1;
  if (targetInstallmentId && targetIndex < 0)
    throw new RangeError("Target installment was not found.");
  const order =
    targetIndex < 0 ? plan : [...plan.slice(targetIndex), ...plan.slice(0, targetIndex)];

  let remaining = amount;
  const allocations: InstallmentAllocation[] = [];
  for (const installment of order) {
    const due = installmentOutstanding(installment, payments);
    const allocated = Math.min(remaining, due);
    if (allocated > 0) allocations.push({ installmentId: installment.id, amount: allocated });
    remaining -= allocated;
    if (remaining === 0) break;
  }
  return allocations;
}

export function fullyPaidInstallmentCount(person: Person, payments: FeeWorkflowPayment[]): number {
  return person.plan.filter(
    (installment) =>
      installment.amountDue > 0 && installmentOutstanding(installment, payments) === 0,
  ).length;
}

export function canSendToAdministration(
  person: Person,
  payments: FeeWorkflowPayment[],
  requiredPaid = HANDOFF_REQUIRES_PAID_INSTALLMENTS,
): boolean {
  // Callers pass this person's payments.
  if (requiredPaid <= 0) return payments.some((payment) => payment.amount > 0);
  return fullyPaidInstallmentCount(person, payments) >= requiredPaid;
}

export function hasAdministrationDetailsEvent(personId: string, handoffs: Handoff[]): boolean {
  return handoffs.some(
    (handoff) =>
      handoff.personId === personId &&
      handoff.target === "Administration" &&
      handoff.history.some((entry) => entry.text === ADMINISTRATION_DETAILS_SENT_TEXT),
  );
}

/** Eligible and no details event yet; used for prompts. */
export function isEligibleNow(
  person: Person,
  payments: FeeWorkflowPayment[],
  handoffs: Handoff[],
): boolean {
  return (
    canSendToAdministration(person, payments) && !hasAdministrationDetailsEvent(person.id, handoffs)
  );
}

function hadOverdueInstallment(person: Person, payments: FeeWorkflowPayment[]): boolean {
  return person.plan.some((installment) =>
    payments.some(
      (payment) =>
        payment.date > installment.dueDate &&
        payment.allocations.some(
          (allocation) => allocation.installmentId === installment.id && allocation.amount > 0,
        ),
    ),
  );
}

export function classAccess(
  person: Person,
  payments: FeeWorkflowPayment[] = [],
  today = TODAY,
): "On Hold" | "Payment Cleared" | null {
  if (
    person.plan.some((installment) => installmentStatus(installment, payments, today) === "Overdue")
  )
    return "On Hold";
  return hadOverdueInstallment(person, payments) ? "Payment Cleared" : null;
}

export type FeeFollowUpStatus = "Reminder sent" | "In-Person Follow-Up Required" | null;

export function followUpStatus(person: Person, payments: FeeWorkflowPayment[], today = TODAY) {
  const overdue = person.plan.filter(
    (installment) => installmentStatus(installment, payments, today) === "Overdue",
  );
  if (overdue.some((installment) => installment.reminders.length >= MAX_REMINDERS))
    return "In-Person Follow-Up Required";
  if (overdue.some((installment) => installment.reminders.length > 0)) return "Reminder sent";
  return null;
}

export type FeeNextAction =
  | "Review Application"
  | "Record Payment"
  | "Arrange Meeting"
  | "Send Reminder"
  | "Send to Administration"
  | "Enter Admission No."
  | "Notify Administration";

export function nextAction(
  person: Person,
  payments: FeeWorkflowPayment[],
  handoffs: Handoff[] = [],
  today = TODAY,
  requireApplicationReview = REQUIRE_APPLICATION_REVIEW,
): FeeNextAction | null {
  const firstInstallment = person.plan[0];
  const statuses = person.plan.map((installment) => ({
    installment,
    status: installmentStatus(installment, payments, today),
  }));
  const overdue = statuses.filter(({ status }) => status === "Overdue");
  const handoff = handoffs.find(
    (item) => item.personId === person.id && item.target === "Administration",
  );

  // Applicant steps come first; overdue follow-up outranks handoff steps.
  if (requireApplicationReview && person.applicationStatus === "Received")
    return "Review Application";
  if (
    !person.admissionNo &&
    firstInstallment &&
    installmentOutstanding(firstInstallment, payments) > 0
  )
    return "Record Payment";
  if (overdue.some(({ installment }) => installment.reminders.length >= MAX_REMINDERS))
    return "Arrange Meeting";
  const dueSoon = statuses.some(
    ({ installment, status }) =>
      installmentOutstanding(installment, payments) > 0 &&
      status !== "Paid" &&
      installment.dueDate >= today &&
      installment.dueDate <=
        addDays(new Date(`${today}T00:00:00`), REMINDER_LEAD_DAYS)
          .toISOString()
          .slice(0, 10) &&
      installment.reminders.length === 0,
  );
  if (overdue.length > 0 || dueSoon) return "Send Reminder";
  if (canSendToAdministration(person, payments) && !handoff) return "Send to Administration";
  if (
    (handoff?.status === "Sent" || handoff?.status === "Awaiting Admission No.") &&
    !person.admissionNo
  )
    return "Enter Admission No.";
  if (
    person.admissionNo &&
    classAccess(person, payments, today) === "Payment Cleared" &&
    person.plan.some((installment) =>
      payments.some(
        (payment) =>
          payment.date > installment.dueDate &&
          payment.allocations.some(
            (allocation) =>
              allocation.installmentId === installment.id &&
              allocation.amount > 0 &&
              !wasPaymentAdministrationNotified(payment, handoffs),
          ),
      ),
    )
  )
    return "Notify Administration";
  return null;
}

export function taskPriority(
  person: Person,
  payments: FeeWorkflowPayment[],
  _handoffs: Handoff[] = [],
  today = TODAY,
): number {
  const overdue = person.plan.filter(
    (installment) => installmentStatus(installment, payments, today) === "Overdue",
  );
  if (overdue.some((installment) => installment.reminders.length >= MAX_REMINDERS)) return 0;
  if (overdue.length > 0) return 1;
  const reminderDueDate = addDays(new Date(`${today}T00:00:00`), REMINDER_LEAD_DAYS)
    .toISOString()
    .slice(0, 10);
  if (
    person.plan.some(
      (installment) =>
        installmentOutstanding(installment, payments) > 0 &&
        installment.dueDate >= today &&
        installment.dueDate <= reminderDueDate,
    )
  )
    return 2;
  if (person.applicationStatus === "Received") return 3;
  return 4;
}

export function createDemoFeeWorkflow(
  students: Student[],
  payments: FeePayment[],
): FeeWorkflowState {
  const persons = [
    ...students.map((student, index) => personFromStudent(student, index)),
    ...newDemoApplicants(),
    ...DEMO_SCENARIO_PEOPLE,
  ];
  const workflowPayments: FeeWorkflowPayment[] = [];
  for (const payment of [...payments].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )) {
    const person = persons.find((candidate) => candidate.id === payment.studentId);
    if (!person) continue;
    workflowPayments.push({
      id: payment.id,
      personId: person.id,
      amount: payment.amount,
      date: payment.date,
      method: payment.method,
      reference: payment.reference,
      receiptNo: payment.receiptNo,
      adminNotified: true,
      confirmation: { status: "Sent (simulated)", sentAt: `${payment.date}T10:00:00.000Z` },
      allocations: allocatePayment(
        person.plan,
        workflowPayments.filter((item) => item.personId === person.id),
        payment.amount,
      ),
    });
  }
  const admittedApplicants = DEMO_ADMITTED_APPLICATIONS.map((applicant) =>
    persons.find((person) => person.admissionNo === applicant.admissionNo),
  );
  if (admittedApplicants.some((person) => !person)) {
    throw new Error("Demo admitted applicants must match seeded students.");
  }
  const allWorkflowPayments: FeeWorkflowPayment[] = [
    ...workflowPayments,
    ...DEMO_APPLICANT_PAYMENTS.map((payment) => ({ ...payment, adminNotified: true })),
  ];
  for (const spec of DEMO_SCENARIO_PAYMENT_SPECS) {
    const person = persons.find((candidate) => candidate.id === spec.personId);
    if (!person) throw new Error(`Missing demo scenario person ${spec.personId}.`);
    const personPayments = allWorkflowPayments.filter((payment) => payment.personId === person.id);
    allWorkflowPayments.push({
      id: `DEMO-PAY-${person.applicationId}-${spec.receiptNo}`,
      personId: person.id,
      amount: spec.amount,
      date: spec.date,
      method: "UPI",
      reference: spec.reference,
      receiptNo: spec.receiptNo,
      allocations: allocatePayment(person.plan, personPayments, spec.amount),
      confirmation: spec.confirmation,
      adminNotified: spec.adminNotified,
    });
  }
  const handoffs: Handoff[] = [];
  for (const [personId, dates] of Object.entries(DEMO_SCENARIO_HANDOFF_DATES)) {
    const person = persons.find((candidate) => candidate.id === personId);
    if (!person) throw new Error(`Missing demo handoff person ${personId}.`);
    const sent = recordAdministrationDetailsSent(
      handoffs,
      person,
      allWorkflowPayments,
      dates.detailsSent,
    );
    const handoff = sent.find((item) => item.personId === personId)!;
    if (dates.admissionReceived) {
      handoff.status = "Completed";
      handoff.history.push({
        date: dates.admissionReceived,
        text: ADMISSION_NO_RECEIVED_TEXT,
      });
    }
    handoffs.push(handoff);
  }
  return {
    persons: persons.map((person) => ({
      ...person,
      admissionStatus: person.admissionNo ? "Admitted" : "Applicant",
      adminNotifiedOfClearance: areAllPaymentsAdministrationNotified(
        allWorkflowPayments.filter((payment) => payment.personId === person.id),
      ),
      paymentStatus: feeWorkflowPaymentStatus(
        person,
        allWorkflowPayments.filter((payment) => payment.personId === person.id),
      ),
    })),
    payments: allWorkflowPayments,
    handoffs,
  };
}

export function createDemoBillingStudents(workflow: FeeWorkflowState): Student[] {
  const demoApplicantIds = new Set<string>(DEMO_NEW_APPLICANTS.map((applicant) => applicant.id));
  return workflow.persons
    .filter(
      (person) =>
        DEMO_BILLING_SCENARIO_PERSON_IDS.includes(person.id) ||
        (demoApplicantIds.has(person.id) && appearsInBilling(person, workflow.payments)),
    )
    .map((person) => ({
      id: person.id,
      applicationId: person.applicationId,
      name: person.name,
      regNo: person.admissionNo ?? "",
      admissionStatus: person.admissionNo ? "Admitted" : "Applicant",
      course: person.course,
      phone: person.contact,
      email: person.email,
      registeredOn: person.appliedOn,
      totalFee: sum(person.plan.map((installment) => installment.amountDue)),
      installments: person.plan.map((installment) => ({
        label: installment.label,
        due: installment.dueDate,
        amount: installment.amountDue,
      })),
      applicationDetails: person.applicationDetails,
    }));
}

export function createDemoBillingPayments(
  existing: FeePayment[],
  workflow: FeeWorkflowState,
): FeePayment[] {
  return workflow.persons
    .filter((person) => appearsInBilling(person, workflow.payments))
    .map((person) => person.id)
    .reduce(
      (payments, personId) => mergeBillingPayments(payments, workflow.payments, personId),
      existing,
    );
}

const inr = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);

export function buildPaymentConfirmationEmail(
  person: Person,
  payment: FeeWorkflowPayment,
  allPayments: FeeWorkflowPayment[],
): { to: string; subject: string; body: string } {
  const personPayments = allPayments.filter((item) => item.personId === person.id);
  const covered = payment.allocations.map((allocation) => {
    const installment = person.plan.find((item) => item.id === allocation.installmentId);
    return `${installment?.label ?? "Installment"}: ${inr(allocation.amount)}`;
  });
  const totals = personTotals(person, personPayments);
  const nextDue = totals.nextDueInstallment;
  const subject = `Payment confirmation - ${person.name} - ${payment.receiptNo}`;
  const body = [
    `Dear ${person.name},`,
    `We received ${inr(payment.amount)} by ${payment.method} on ${payment.date}.`,
    `Receipt no.: ${payment.receiptNo}`,
    `Installment(s) covered: ${covered.join(", ") || "None"}`,
    `Balance remaining: ${inr(totals.outstanding)}`,
    nextDue
      ? `Next installment due: ${nextDue.label}, ${inr(installmentOutstanding(nextDue, personPayments))} on ${nextDue.dueDate}`
      : "Next installment due: None",
    person.admissionNo ? `Admission No.: ${person.admissionNo}` : "Admission No.: Pending",
  ].join("\n");
  return { to: person.email, subject, body };
}

export function buildPaymentReminderEmail(
  student: Pick<Student, "name" | "email" | "course">,
  installment: string,
  amountDue: number,
  dueDate: string,
  institution: string,
): { to: string; subject: string; body: string } {
  const date = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dueDate}T00:00:00Z`));
  const dueWording = dueDate < TODAY ? `which was due on ${date}` : `by ${date}`;
  return {
    to: student.email ?? "",
    subject: `Fee reminder - ${student.name} - ${installment}`,
    body: `Dear ${student.name}, ${institution} records ${inr(amountDue)} outstanding for ${installment} in ${student.course}, ${dueWording}. Please pay through the institute's accepted payment methods and share the transaction reference with Accounts. This is a simulated reminder; no email was sent.`,
  };
}

/** Complete frozen snapshot of what is sent to Administration. Never includes an Admission No. */
export function buildAdministrationDetailsPayload(
  person: Person,
  allPayments: FeeWorkflowPayment[],
  asOfDate?: string,
): AdministrationDetailsSnapshot {
  const payments = allPayments
    .filter(
      (item) =>
        item.personId === person.id &&
        (asOfDate === undefined || item.date <= asOfDate.slice(0, 10)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const totals = personTotals(person, payments);
  const snapshot: AdministrationDetailsSnapshot = {
    personId: person.id,
    applicationId: person.applicationId,
    name: person.name,
    contact: person.contact,
    email: person.email,
    course: person.course,
    appliedOn: person.appliedOn,
    applicationForm: person.applicationDetails,
    paymentSummary: {
      payments: payments.map((payment) => ({
        date: payment.date,
        amount: payment.amount,
        method: payment.method,
        receiptNo: payment.receiptNo,
        installmentsCovered: payment.allocations.map((allocation) => ({
          label:
            person.plan.find((item) => item.id === allocation.installmentId)?.label ??
            allocation.installmentId,
          amount: allocation.amount,
        })),
      })),
      totalPaid: sum(payments.map((payment) => payment.amount)),
      installmentsPaid: fullyPaidInstallmentCount(person, payments),
      outstanding: totals.outstanding,
    },
  };
  // Deep copy so later edits to the person or payments never change the stored snapshot.
  return structuredClone(snapshot);
}

/**
 * Records the "Details sent to Administration" event with its snapshot.
 * Idempotent: if the event already exists, handoffs are returned unchanged.
 */
export function recordAdministrationDetailsSent(
  handoffs: Handoff[],
  person: Person,
  payments: FeeWorkflowPayment[],
  sentAt: string,
): Handoff[] {
  if (hasAdministrationDetailsEvent(person.id, handoffs)) return handoffs;
  const existing = handoffs.find(
    (item) => item.personId === person.id && item.target === "Administration",
  );
  const updated: Handoff = {
    personId: person.id,
    target: "Administration",
    status: "Awaiting Admission No.",
    history: [
      ...(existing?.history ?? []),
      {
        date: sentAt,
        text: ADMINISTRATION_DETAILS_SENT_TEXT,
        snapshot: buildAdministrationDetailsPayload(person, payments, sentAt),
      },
    ],
  };
  return [...handoffs.filter((item) => item !== existing), updated];
}

export function hasDuplicatePaymentReference(
  personId: string,
  reference: string,
  payments: FeeWorkflowPayment[],
): boolean {
  const normalized = reference.trim().toLowerCase();
  return (
    !!normalized &&
    payments.some(
      (payment) =>
        payment.personId === personId && payment.reference.trim().toLowerCase() === normalized,
    )
  );
}

export function markPaymentConfirmationSent(
  payment: FeeWorkflowPayment,
  sentAt: string,
): FeeWorkflowPayment {
  if (payment.confirmation.status === "Sent (simulated)") return payment;
  return {
    ...payment,
    confirmation: { status: "Sent (simulated)", sentAt },
    confirmationHistory: [
      ...(payment.confirmationHistory ?? []),
      { date: sentAt, text: "Payment confirmation email sent (simulated)" },
    ],
  };
}
