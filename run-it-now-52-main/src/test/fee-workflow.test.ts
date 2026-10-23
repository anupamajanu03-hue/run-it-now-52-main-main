import { describe, expect, it } from "vitest";
import type {
  FeePayment,
  FeeWorkflowPayment,
  Handoff,
  Installment,
  Person,
  Student,
} from "@/finance/types";
import {
  allocatePayment,
  buildAdministrationDetailsPayload,
  buildPaymentNotificationPayload,
  appearsInBilling,
  isEligibleNow,
  recordAdministrationDetailsSent,
  buildPaymentConfirmationEmail,
  buildPaymentReminderEmail,
  feeWorkflowPaymentStatus,
  hasDuplicatePaymentReference,
  canSendToAdministration,
  classAccess,
  createDemoFeeWorkflow,
  createDemoBillingPayments,
  createDemoBillingStudents,
  followUpStatus,
  installmentFollowUpStatus,
  installmentDaysOverdue,
  isRecentlyPaidInstallment,
  mergeBillingPayments,
  installmentOutstanding,
  installmentPaid,
  installmentStatus,
  nextAction,
  personTotals,
  markPaymentConfirmationSent,
  markPaymentsAdministrationNotified,
  createNewFeeWorkflowPayment,
  studentFromAdmittedPerson,
  taskPriority,
  validateAdmissionNo,
} from "@/finance/feeWorkflow";
import {
  DEMO_FEE_PLANS,
  DEMO_BILLING_SCENARIO_PERSON_IDS,
  DEMO_SCENARIO_PEOPLE,
  DEMO_SCENARIO_PAYMENT_SPECS,
  ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
  HANDOFF_REQUIRES_PAID_INSTALLMENTS,
  MAX_REMINDERS,
  REMINDER_LEAD_DAYS,
  newDemoApplicants,
  buildPlan,
} from "@/finance/feeWorkflowConfig";
import { seedPayments, seedStudents } from "@/finance/data";
import { demoDate } from "@/finance/demoDates";
import { billStatus, installmentSchedule, nextDue, studentPaid, TODAY } from "@/finance/logic";

const plan: Installment[] = [
  {
    id: "i1",
    label: "Registration",
    amountDue: 100,
    dueDate: "2026-10-01",
    reminders: [],
    meetingNotes: [],
  },
  {
    id: "i2",
    label: "Instalment 1",
    amountDue: 100,
    dueDate: "2026-11-01",
    reminders: [],
    meetingNotes: [],
  },
];

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "Test Student",
    contact: "9845000000",
    email: "test.student@example.com",
    course: "Python",
    appliedOn: "2026-10-01",
    applicationId: "APP2026-001",
    applicationStatus: "Reviewed",
    plan,
    adminNotifiedOfClearance: false,
    ...overrides,
  };
}

function payment(installmentId: string, amount: number, date = "2026-10-02"): FeeWorkflowPayment {
  return {
    id: `pay-${installmentId}-${amount}`,
    personId: "p1",
    amount,
    date,
    method: "UPI",
    reference: "TXN-1",
    receiptNo: "RCP-1",
    allocations: [{ installmentId, amount }],
    adminNotified: false,
    confirmation: { status: "Sent (simulated)" },
  };
}

describe("installment-based fee workflow", () => {
  it("includes billed or paid applicants in Billing and previews only unnotified payments", () => {
    const billedPerson = person({ billCreated: true, admissionNo: "ADM2026-500" });
    const paid = { ...payment("i1", 40), adminNotified: true };
    const unpaid = {
      ...payment("i2", 25, "2026-10-03"),
      id: "pay-i2-unnotified",
      reference: "TXN-2",
      adminNotified: false,
    };
    expect(appearsInBilling(person(), [])).toBe(false);
    expect(appearsInBilling(person(), [paid])).toBe(true);
    expect(appearsInBilling(billedPerson, [])).toBe(true);
    const payload = buildPaymentNotificationPayload(billedPerson, [paid, unpaid]);
    expect(payload).toMatchObject({
      name: billedPerson.name,
      contact: billedPerson.contact,
      admissionNo: "ADM2026-500",
      note: "Tells Administration about the payment so the batch and classes can be created or updated (simulated)",
    });
    expect(payload.payments).toEqual([
      {
        id: "pay-i2-unnotified",
        date: "2026-10-03",
        amount: 25,
        installmentsCovered: [{ label: "Instalment 1", amount: 25 }],
        remainingBalance: 135,
      },
    ]);
  });

  it("builds configured plans with a full-payment fallback and rounded installment splits", () => {
    const full = buildPlan("full", "Python", "2026-10-22", []);
    expect(full).toHaveLength(1);
    expect(full[0]).toMatchObject({ label: "Full payment", amountDue: 16000 });

    const three = buildPlan("three", "Python", "2026-10-22", DEMO_FEE_PLANS.Python!, 3);
    expect(three.map(({ label, amountDue }) => [label, amountDue])).toEqual([
      ["Registration", 6000],
      ["Instalment 1", 3333],
      ["Instalment 2", 3333],
      ["Instalment 3", 3334],
    ]);
    expect(three.map(({ id }) => id)).toEqual(["three-I01", "three-I02", "three-I03", "three-I04"]);

    const four = buildPlan(
      "four",
      "Advanced Data Science",
      "2026-10-22",
      DEMO_FEE_PLANS["Advanced Data Science"]!,
      4,
    );
    expect(four.map(({ amountDue }) => amountDue)).toEqual([25000, 12500, 12500, 12500, 12500]);
    expect(four.map(({ label }) => label)).toEqual([
      "Registration",
      "Instalment 1",
      "Instalment 2",
      "Instalment 3",
      "Instalment 4",
    ]);
    expect(four.reduce((total, installment) => total + installment.amountDue, 0)).toBe(75000);

    const noRegistration = buildPlan(
      "no-registration",
      "Other course",
      "2026-10-22",
      [
        { label: "Tuition 1", amount: 10000 },
        { label: "Tuition 2", amount: 10000 },
      ],
      3,
    );
    expect(noRegistration.map(({ label }) => label)).toEqual([
      "Instalment 1",
      "Instalment 2",
      "Instalment 3",
    ]);
    expect(noRegistration.map(({ amountDue }) => amountDue)).toEqual([6666, 6666, 6668]);
  });

  it("generates demo dates relative to an injected today", () => {
    expect(demoDate(-1, "2026-10-22")).toBe("2026-10-21");
    expect(demoDate(4, "2026-10-22")).toBe("2026-10-26");
  });

  it("seeds exactly twelve scenarios with matching workflow, billing, allocation, and snapshot state", () => {
    const workflow = createDemoFeeWorkflow(seedStudents, seedPayments);
    const scenarios = workflow.persons.filter(
      (item) =>
        item.applicationId.startsWith("APP2026-1") &&
        Number(item.applicationId.slice("APP2026-".length)) >= 118 &&
        Number(item.applicationId.slice("APP2026-".length)) <= 129,
    );
    expect(scenarios).toHaveLength(12);
    expect(DEMO_SCENARIO_PEOPLE).toHaveLength(12);
    expect(scenarios.map((item) => item.appliedOn)).toEqual([
      demoDate(-1),
      demoDate(-2),
      demoDate(-3),
      demoDate(-5),
      demoDate(-7),
      demoDate(-10),
      demoDate(-30),
      demoDate(-60),
      demoDate(-70),
      demoDate(-30),
      demoDate(-8),
      demoDate(-4),
    ]);

    const expected = [
      ["Received", false, "Review Application", "On Hold", null],
      ["Received", false, "Review Application", "On Hold", null],
      ["Reviewed", false, "Record Payment", "On Hold", null],
      ["Payment Recorded", true, "Record Payment", "On Hold", null],
      ["Payment Recorded", true, "Send to Administration", null, null],
      ["Payment Recorded", true, "Enter Admission No.", null, null],
      ["Admitted", true, "Send Reminder", null, null],
      ["Admitted", true, "Send Reminder", "On Hold", "Reminder sent"],
      ["Admitted", true, "Arrange Meeting", "On Hold", "In-Person Follow-Up Required"],
      ["Admitted", true, "Notify Administration", "Payment Cleared", null],
      ["Admitted", true, null, null, null],
      ["Received", false, "Review Application", "On Hold", null],
    ] as const;
    const billingStudents = createDemoBillingStudents(workflow);
    const billingPayments = createDemoBillingPayments(seedPayments, workflow);
    expect(billingPayments.filter((payment) => payment.id === "APP-PAY-003")).toHaveLength(1);

    scenarios.forEach((scenario, index) => {
      const personPayments = workflow.payments.filter((item) => item.personId === scenario.id);
      const [status, appearsInBilling, action, access, followUp] = expected[index]!;
      expect(scenario.applicationStatus).toBe(status);
      expect(billingStudents.some((student) => student.id === scenario.id)).toBe(appearsInBilling);
      expect(nextAction(scenario, personPayments, workflow.handoffs)).toBe(action);
      expect(classAccess(scenario, personPayments)).toBe(access);
      expect(followUpStatus(scenario, personPayments)).toBe(followUp);

      if (scenario.id !== "APP-P-129") {
        const form = scenario.applicationDetails!;
        expect(
          [
            form.dateOfBirth,
            form.addressLine1,
            form.addressLine2,
            form.city,
            form.state,
            form.postalCode,
            form.guardianName,
            form.guardianRelationship,
            form.guardianPhone,
            form.guardianEmail,
            form.educationWorkExperience,
            form.leadSource,
            form.leadReference,
            form.coursePreference,
          ].every(Boolean),
        ).toBe(true);
        expect(form.installmentPreference).toBeGreaterThan(0);
        expect(Object.keys(form.documents ?? {})).toHaveLength(4);
        expect(form.declarationAccepted).toBe(true);
      }

      const totals = personTotals(scenario, personPayments);
      expect(totals.payable).toBe(
        scenario.plan.reduce((sum, installment) => sum + installment.amountDue, 0),
      );
      expect(totals.paid).toBe(personPayments.reduce((sum, payment) => sum + payment.amount, 0));
      expect(totals.outstanding).toBe(totals.payable - totals.paid);
      for (const payment of personPayments) {
        expect(payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0)).toBe(
          payment.amount,
        );
      }
    });

    expect(DEMO_SCENARIO_PAYMENT_SPECS).toHaveLength(9);
    expect(new Set(DEMO_SCENARIO_PEOPLE.map((item) => item.applicationId)).size).toBe(12);
    expect(new Set(DEMO_SCENARIO_PEOPLE.map((item) => item.email)).size).toBe(12);
    expect(new Set(DEMO_SCENARIO_PEOPLE.map((item) => item.contact)).size).toBe(12);
    expect(new Set(DEMO_SCENARIO_PAYMENT_SPECS.map((item) => item.reference)).size).toBe(9);
    expect(new Set(DEMO_SCENARIO_PAYMENT_SPECS.map((item) => item.receiptNo)).size).toBe(9);
    expect(
      DEMO_SCENARIO_PEOPLE.every(
        (scenario) =>
          !workflow.persons.some(
            (item) =>
              item.id !== scenario.id &&
              (item.applicationId === scenario.applicationId ||
                item.email === scenario.email ||
                item.contact === scenario.contact),
          ),
      ),
    ).toBe(true);
    expect(
      DEMO_SCENARIO_PAYMENT_SPECS.every(
        (spec) =>
          !seedPayments.some(
            (item) => item.reference === spec.reference || item.receiptNo === spec.receiptNo,
          ),
      ),
    ).toBe(true);
    expect(
      DEMO_SCENARIO_PEOPLE.filter((item) => item.id !== "APP-P-129").every((item) =>
        Object.values(item.applicationDetails?.documents ?? {}).some(Boolean),
      ),
    ).toBe(true);
    expect(
      DEMO_SCENARIO_PEOPLE.find((item) => item.id === "APP-P-129")?.applicationDetails,
    ).toMatchObject({
      dateOfBirth: "",
      guardianName: "",
      leadSource: "",
      addressLine1: "",
      declarationAccepted: false,
      documents: {
        identityProof: false,
        academicRecords: false,
        photograph: false,
        resume: false,
      },
    });
    expect(billingStudents).toHaveLength(DEMO_BILLING_SCENARIO_PERSON_IDS.length + 1);
    expect(billingStudents.some((student) => student.id === "APP-P-003")).toBe(true);
    expect(
      billingPayments.filter((item) => DEMO_BILLING_SCENARIO_PERSON_IDS.includes(item.studentId)),
    ).toHaveLength(9);
    const addedBilled = billingStudents
      .filter((student) => DEMO_BILLING_SCENARIO_PERSON_IDS.includes(student.id))
      .reduce((total, student) => total + student.totalFee, 0);
    const addedPaid = billingPayments
      .filter((item) => DEMO_BILLING_SCENARIO_PERSON_IDS.includes(item.studentId))
      .reduce((total, item) => total + item.amount, 0);
    expect(addedBilled).toBe(419000);
    expect(addedPaid).toBe(161000);
    const allBillingStudents = [...seedStudents, ...billingStudents];
    expect(allBillingStudents.slice(0, seedStudents.length)).toEqual(seedStudents);
    expect(billingPayments.slice(0, seedPayments.length)).toEqual(seedPayments);
    const totalBilled = allBillingStudents.reduce((total, student) => total + student.totalFee, 0);
    const totalPaid = billingPayments.reduce((total, item) => total + item.amount, 0);
    const rowOutstanding = allBillingStudents.reduce(
      (total, student) =>
        total + Math.max(0, student.totalFee - studentPaid(student.id, billingPayments)),
      0,
    );
    expect(totalBilled).toBe(
      allBillingStudents.reduce((total, student) => total + student.totalFee, 0),
    );
    expect(totalPaid).toBe(billingPayments.reduce((total, item) => total + item.amount, 0));
    expect(totalBilled - totalPaid).toBe(rowOutstanding);
    expect([totalBilled, totalPaid, rowOutstanding]).toEqual([1489000, 654000, 835000]);
    expect(scenarios[6]?.plan[1]?.dueDate).toBe(demoDate(4));
    expect(scenarios[7]?.plan[1]?.dueDate).toBe(demoDate(-12));
    expect(scenarios[7]?.plan[1]?.reminders).toHaveLength(1);
    expect(scenarios[8]?.plan[1]?.dueDate).toBe(demoDate(-25));
    expect(scenarios[8]?.plan[1]?.reminders).toHaveLength(MAX_REMINDERS);
    expect(scenarios[9]?.plan[1]?.dueDate).toBe(demoDate(-10));
    expect(workflow.payments.find((item) => item.reference === "TXN880608")?.date).toBe(
      demoDate(-3),
    );
    expect(scenarios[10]?.plan.map(({ label }) => label)).toEqual(["Registration", "Instalment 1"]);

    const snapshots = workflow.handoffs.flatMap((handoff) =>
      handoff.history
        .filter((event) => event.snapshot)
        .map((event) => ({ handoff, event, snapshot: event.snapshot! })),
    );
    expect(snapshots).toHaveLength(6);
    for (const { handoff, event, snapshot } of snapshots) {
      const scenario = scenarios.find((item) => item.id === handoff.personId)!;
      const sentDate = event.date.slice(0, 10);
      expect(snapshot.applicationForm).toEqual(scenario.applicationDetails);
      expect(snapshot.applicationForm?.educationWorkExperience).toBeTruthy();
      expect(snapshot).not.toHaveProperty("admissionNo");
      expect(snapshot.paymentSummary.payments.every((item) => item.date <= sentDate)).toBe(true);
      expect(snapshot.paymentSummary.totalPaid).toBe(
        snapshot.paymentSummary.payments.reduce((sum, item) => sum + item.amount, 0),
      );
      const paymentsAtSend = workflow.payments.filter(
        (item) => item.personId === scenario.id && item.date <= sentDate,
      );
      expect(snapshot.paymentSummary.totalPaid).toBe(
        paymentsAtSend.reduce((sum, item) => sum + item.amount, 0),
      );
      expect(snapshot.paymentSummary.installmentsPaid).toBe(
        scenario.plan.filter(
          (installment) =>
            installmentOutstanding(installment, paymentsAtSend) === 0 && installment.amountDue > 0,
        ).length,
      );
      expect(snapshot.paymentSummary.outstanding).toBe(
        scenario.plan.reduce((sum, item) => sum + item.amountDue, 0) -
          snapshot.paymentSummary.totalPaid,
      );
      expect(JSON.stringify(snapshot)).not.toContain(scenario.admissionNo ?? "no-admission");
    }
    expect(
      workflow.payments
        .filter((item) => scenarios.some((scenario) => scenario.id === item.personId))
        .filter((item) => item.reference !== "TXN880601" && item.reference !== "TXN880608")
        .every((item) => item.adminNotified),
    ).toBe(true);
    expect(workflow.payments.find((item) => item.reference === "TXN880608")?.adminNotified).toBe(
      false,
    );
    expect(
      workflow.payments.find((item) => item.reference === "TXN880608")?.confirmation.status,
    ).toBe("Not sent");
  });

  it("creates unnotified payments and marks selected payments notified only once", () => {
    const created = createNewFeeWorkflowPayment(
      {
        personId: "p1",
        amount: 100,
        date: "2026-10-22",
        method: "UPI",
        reference: "TXN-NEW",
        receiptNo: "RCP-NEW",
        allocations: [{ installmentId: "i1", amount: 100 }],
        confirmation: { status: "Not sent" },
      },
      "new-payment",
    );
    expect(created.adminNotified).toBe(false);

    const unchanged = payment("i1", 100);
    const notified = markPaymentsAdministrationNotified([created, unchanged], [created.id]);
    expect(notified[0]?.adminNotified).toBe(true);
    expect(notified[1]).toBe(unchanged);
    expect(markPaymentsAdministrationNotified(notified, [created.id])).toBe(notified);
  });

  it("keeps the editable demo plan totals and workflow defaults consistent", () => {
    expect(DEMO_FEE_PLANS.Python?.reduce((total, item) => total + item.amount, 0)).toBe(16000);
    expect(DEMO_FEE_PLANS.Tally?.reduce((total, item) => total + item.amount, 0)).toBe(12000);
    expect(
      DEMO_FEE_PLANS["Advanced Data Science"]?.reduce((total, item) => total + item.amount, 0),
    ).toBe(75000);
    expect([HANDOFF_REQUIRES_PAID_INSTALLMENTS, REMINDER_LEAD_DAYS, MAX_REMINDERS]).toEqual([
      1, 7, 2,
    ]);
    const applicants = newDemoApplicants();
    expect(applicants).toHaveLength(3);
    expect(applicants[0]?.plan.map((installment) => installment.dueDate)).toEqual([
      "2026-10-18",
      "2026-11-18",
      "2026-12-18",
    ]);
  });

  it("allocates a full payment to the oldest unpaid installment", () => {
    expect(allocatePayment(plan, [], 100)).toEqual([{ installmentId: "i1", amount: 100 }]);
  });

  it("allocates carry-over from a specific installment and detects newly eligible handoffs", () => {
    expect(allocatePayment(plan, [], 150, "i2")).toEqual([
      { installmentId: "i2", amount: 100 },
      { installmentId: "i1", amount: 50 },
    ]);

    const workflow = createDemoFeeWorkflow(seedStudents, seedPayments);
    const partialRegistration = workflow.persons.find((item) => item.id === "APP-P-121")!;
    const existingPayments = workflow.payments.filter(
      (item) => item.personId === partialRegistration.id,
    );
    expect(existingPayments[0]?.amount).toBe(10000);
    expect(isEligibleNow(partialRegistration, existingPayments, workflow.handoffs)).toBe(false);

    const completedRegistration: FeeWorkflowPayment = {
      id: "payment-registration-completed",
      personId: partialRegistration.id,
      amount: 15000,
      date: TODAY,
      method: "UPI",
      reference: "TXN-REG-COMPLETE",
      receiptNo: "RCP-REG-COMPLETE",
      allocations: allocatePayment(partialRegistration.plan, existingPayments, 15000),
      adminNotified: false,
      confirmation: { status: "Not sent" },
    };
    expect(
      isEligibleNow(
        partialRegistration,
        [...existingPayments, completedRegistration],
        workflow.handoffs,
      ),
    ).toBe(true);
  });

  it("allocates partial payments and carries excess into the next installment", () => {
    expect(allocatePayment(plan, [payment("i1", 40)], 60)).toEqual([
      { installmentId: "i1", amount: 60 },
    ]);
    expect(allocatePayment(plan, [], 150)).toEqual([
      { installmentId: "i1", amount: 100 },
      { installmentId: "i2", amount: 50 },
    ]);
  });

  it("allocates a payment toward a selected installment", () => {
    expect(allocatePayment(plan, [], 100, "i2")).toEqual([{ installmentId: "i2", amount: 100 }]);
  });

  it("uses recorded allocations in the admitted student installment schedule", () => {
    const student: Student = {
      id: "p1",
      name: "Test Student",
      regNo: "ADM-1",
      course: "Python",
      phone: "",
      registeredOn: "2026-10-01",
      totalFee: 200,
      installments: [
        { label: "Registration", due: "2026-10-01", amount: 100 },
        { label: "Instalment 1", due: "2026-11-01", amount: 100 },
      ],
    };
    const mirrored = {
      id: "pmt-1",
      studentId: "p1",
      date: "2026-10-02",
      amount: 100,
      method: "UPI" as const,
      reference: "R-1",
      receiptNo: "RCP-1",
      allocations: [{ installmentId: "p1-I02", amount: 100 }],
    };
    expect(installmentSchedule(student, 100, TODAY, [mirrored]).map((item) => item.paid)).toEqual([
      0, 100,
    ]);
  });

  it("rejects payments greater than the total outstanding balance", () => {
    expect(() => allocatePayment(plan, [], 201)).toThrow(RangeError);
  });

  it("calculates installment payment, outstanding and every status", () => {
    const paid = payment("i1", 100, "2026-09-30");
    const partial = payment("i2", 40, "2026-10-10");
    expect(installmentPaid("i1", [paid])).toBe(100);
    expect(installmentOutstanding(plan[1]!, [partial])).toBe(60);
    expect(installmentStatus(plan[0]!, [paid])).toBe("Paid");
    expect(installmentStatus(plan[1]!, [partial])).toBe("Partially Paid");
    expect(installmentStatus({ ...plan[1]!, dueDate: "2026-11-01" }, [])).toBe("Pending");
    expect(installmentStatus(plan[0]!, [])).toBe("Overdue");
  });

  it("derives person totals, next due installment and overdue days", () => {
    const totals = personTotals(person(), [payment("i1", 40, "2026-10-10")], "2026-10-20");
    expect(totals).toMatchObject({
      payable: 200,
      paid: 40,
      outstanding: 160,
      nextDueInstallment: plan[0],
      daysOverdue: 19,
    });
  });

  it("holds access for overdue balances and reports cleared late payments", () => {
    expect(classAccess(person(), [], TODAY)).toBe("On Hold");
    const latePaid = payment("i1", 100, "2026-10-03");
    expect(classAccess(person({ plan: [plan[0]!] }), [latePaid], TODAY)).toBe("Payment Cleared");
    expect(classAccess(person({ plan: [plan[1]!] }), [], TODAY)).toBeNull();
  });

  it("requires the configured first installment before administration handoff", () => {
    expect(canSendToAdministration(person(), [])).toBe(false);
    expect(canSendToAdministration(person(), [payment("i1", 100, "2026-09-30")])).toBe(true);
  });

  it("prioritizes application review before payment or reminders", () => {
    const applicant = person({ applicationStatus: "Received" });
    expect(nextAction(applicant, [])).toBe("Review Application");
  });

  it("skips application review when configured off", () => {
    const applicant = person({ applicationStatus: "Received" });
    expect(nextAction(applicant, [], [], TODAY, false)).toBe("Record Payment");
  });

  it("builds confirmation emails with two covered installments and admission status", () => {
    const applicant = person({ email: "s@example.com" });
    const paid = {
      ...payment("i1", 150),
      allocations: [
        { installmentId: "i1", amount: 100 },
        { installmentId: "i2", amount: 50 },
      ],
    };
    const message = buildPaymentConfirmationEmail(applicant, paid, [paid]);
    expect(message.to).toBe("s@example.com");
    expect(message.body).toContain("Test Student");
    expect(message.body).toContain("₹150.00");
    expect(message.body).toContain("Registration: ₹100.00");
    expect(message.body).toContain("Instalment 1: ₹50.00");
    expect(message.body).toContain("Admission No.: Pending");
    expect(
      buildPaymentConfirmationEmail({ ...applicant, admissionNo: "ADM-1" }, paid, [paid]).body,
    ).toContain("Admission No.: ADM-1");
  });

  it("keeps a submitted application, payment plan, and admitted Billing record on one stable ID", () => {
    const applicationDetails = {
      dateOfBirth: "2004-03-14",
      addressLine1: "10 Sample Road",
      addressLine2: "Flat 2",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      guardianName: "Parent Student",
      guardianRelationship: "Parent",
      guardianPhone: "9845000001",
      guardianEmail: "parent@example.com",
      educationWorkExperience: "BCom graduate; one year of office experience.",
      leadSource: "Website",
      leadReference: "WEB-001",
      coursePreference: "Python",
      installmentPreference: 2,
      documents: {
        identityProof: true,
        academicRecords: true,
        photograph: false,
        resume: true,
      },
      declarationAccepted: true,
    };
    const submitted: Person = {
      id: "APP-P-LIFECYCLE",
      applicationId: "APP2026-203",
      name: "Lifecycle Student",
      contact: "9845000000",
      email: "lifecycle@example.com",
      course: "Python",
      appliedOn: "2026-10-20",
      applicationStatus: "Received",
      admissionStatus: "Applicant",
      paymentStatus: "Unpaid",
      adminNotifiedOfClearance: false,
      plan: [
        { ...plan[0]!, id: "APP-P-LIFECYCLE-I01" },
        { ...plan[1]!, id: "APP-P-LIFECYCLE-I02" },
      ],
      applicationDetails,
    };
    const admitted: Person = {
      ...submitted,
      admissionNo: "ADM2026-203",
      admissionStatus: "Admitted",
      applicationStatus: "Admitted",
      paymentStatus: "Partially paid",
    };
    const billingStudent = studentFromAdmittedPerson(admitted, "ADM2026-203");

    expect(submitted.id).toBe(admitted.id);
    expect(submitted.applicationId).toBe(admitted.applicationId);
    expect(submitted.admissionStatus).toBe("Applicant");
    expect(submitted.applicationDetails).toEqual(applicationDetails);
    expect(billingStudent).toMatchObject({
      id: submitted.id,
      regNo: "ADM2026-203",
      email: "lifecycle@example.com",
      applicationDetails,
      totalFee: 200,
    });
    const initialPayment: FeeWorkflowPayment = {
      ...payment("i1", 100),
      personId: submitted.id,
      allocations: [{ installmentId: submitted.plan[0]!.id, amount: 100 }],
    };
    expect(feeWorkflowPaymentStatus(admitted, [initialPayment])).toBe("Partially paid");
    expect(admitted.admissionStatus).toBe("Admitted");
    expect(validateAdmissionNo("ADM2026-203", submitted.id, [admitted], [])).toBe("valid");
    expect(validateAdmissionNo("ADM2026-203", "another-person", [admitted], [])).toBe("duplicate");
    expect(validateAdmissionNo("ADM2026-20X", submitted.id, [], [])).toBe("invalid");
  });

  it("merges applicant payments into Billing once and creates complete simulated reminders", () => {
    const workflowPayment = payment("i1", 60);
    const billing: FeePayment[] = mergeBillingPayments(
      [],
      [workflowPayment, workflowPayment],
      "p1",
    );
    expect(billing).toHaveLength(1);
    expect(mergeBillingPayments(billing, [workflowPayment], "p1")).toEqual(billing);
    const reminder = buildPaymentReminderEmail(
      { name: "Test Student", email: "student@example.com", course: "Python" },
      "Instalment 1",
      60,
      "2026-11-01",
      "Sample Institute",
    );
    expect(reminder.to).toBe("student@example.com");
    expect(reminder.body).toContain("Test Student");
    expect(reminder.body).toContain("Instalment 1");
    expect(reminder.body).toContain("₹60.00");
    expect(reminder.body).toContain("01 Nov 2026");
    expect(reminder.body).toContain("payment methods");
    expect(reminder.body).toContain("simulated reminder");
    expect(reminder.body).toContain("Python");
  });

  it("derives installment reminder timing, overdue days, and recently paid visibility", () => {
    const dueSoon = { ...plan[0]!, dueDate: demoDate(4), reminders: [] };
    const overdue = { ...plan[0]!, dueDate: demoDate(-12), reminders: [] };
    const reminded = {
      ...overdue,
      reminders: [{ id: "rem-1", date: `${TODAY}T12:00:00.000Z`, text: "Reminder sent" }],
    };
    const atLimit = {
      ...reminded,
      reminders: Array.from({ length: MAX_REMINDERS }, (_, index) => ({
        id: `rem-${index + 1}`,
        date: `${TODAY}T12:00:00.000Z`,
        text: "Reminder sent",
      })),
    };
    expect(installmentFollowUpStatus(dueSoon, [], TODAY)).toBe("Reminder Due");
    expect(installmentFollowUpStatus(overdue, [], TODAY)).toBe("Reminder Due");
    expect(installmentFollowUpStatus(reminded, [], TODAY)).toBe("Reminder Sent");
    expect(installmentFollowUpStatus(atLimit, [], TODAY)).toBe("In-Person Follow-Up Required");
    expect(installmentDaysOverdue(overdue, TODAY)).toBe(12);
    expect(isRecentlyPaidInstallment(plan[0]!, [payment("i1", 100, demoDate(-3))], TODAY)).toBe(
      true,
    );
    expect(isRecentlyPaidInstallment(plan[0]!, [payment("i1", 100, demoDate(-10))], TODAY)).toBe(
      false,
    );
  });

  describe("Administration details snapshot", () => {
    const form = {
      dateOfBirth: "2004-02-01",
      addressLine1: "12 MG Road",
      addressLine2: "",
      city: "Pune",
      state: "MH",
      postalCode: "411001",
      guardianName: "R. Student",
      guardianRelationship: "Father",
      guardianPhone: "9800000000",
      guardianEmail: "g@example.com",
      educationWorkExperience: "BCom 2024",
      leadSource: "Referral",
      leadReference: "Friend",
      coursePreference: "Python",
      installmentPreference: 2,
      documents: { identityProof: true, academicRecords: true, photograph: false, resume: false },
      declarationAccepted: true,
    };
    const paid = {
      ...payment("i1", 150),
      allocations: [
        { installmentId: "i1", amount: 100 },
        { installmentId: "i2", amount: 50 },
      ],
    };

    it("contains every form section and the payment summary", () => {
      const payload = buildAdministrationDetailsPayload(person({ applicationDetails: form }), [
        paid,
      ]);
      expect(payload.applicationForm).toEqual(form);
      expect(payload.paymentSummary.totalPaid).toBe(150);
      expect(payload.paymentSummary.installmentsPaid).toBe(1);
      expect(payload.paymentSummary.outstanding).toBe(50);
      expect(payload.paymentSummary.payments[0]?.installmentsCovered).toEqual([
        { label: "Registration", amount: 100 },
        { label: "Instalment 1", amount: 50 },
      ]);
    });

    it("keeps missing values undefined", () => {
      const payload = buildAdministrationDetailsPayload(person({ applicationDetails: undefined }), [
        paid,
      ]);
      expect(payload.applicationForm).toBeUndefined();
    });

    it("never includes an Admission No.", () => {
      const payload = buildAdministrationDetailsPayload(person({ admissionNo: "ADM2026-999" }), [
        paid,
      ]);
      expect(JSON.stringify(payload)).not.toContain("ADM2026-999");
      expect(payload).not.toHaveProperty("admissionNo");
    });

    it("stores a snapshot that later payments do not change, sends once, and stops prompting", () => {
      const applicant = person({ applicationDetails: form });
      expect(isEligibleNow(applicant, [paid], [])).toBe(true);
      const once = recordAdministrationDetailsSent(
        [],
        applicant,
        [paid],
        "2026-10-03T10:00:00.000Z",
      );
      const later = { ...payment("i2", 50), id: "later" };
      const twice = recordAdministrationDetailsSent(
        once,
        applicant,
        [paid, later],
        "2026-10-04T10:00:00.000Z",
      );
      expect(twice).toBe(once);
      const events = twice.flatMap((h) => h.history.filter((e) => e.snapshot));
      expect(events).toHaveLength(1);
      expect(events[0]?.snapshot?.paymentSummary.totalPaid).toBe(150);
      form.city = "Changed";
      expect(events[0]?.snapshot?.applicationForm?.city).toBe("Pune");
      expect(isEligibleNow(applicant, [paid, later], twice)).toBe(false);
    });
  });

  it("rejects repeated references only for the same person", () => {
    const recorded = payment("i1", 100);
    expect(hasDuplicatePaymentReference("p1", " txn-1 ", [recorded])).toBe(true);
    expect(hasDuplicatePaymentReference("p2", "TXN-1", [recorded])).toBe(false);
    expect(hasDuplicatePaymentReference("p1", "", [recorded])).toBe(false);
  });

  it("marks confirmation sent and appends simulated history", () => {
    const sent = markPaymentConfirmationSent(
      { ...payment("i1", 100), confirmation: { status: "Not sent" } },
      "2026-10-20T10:00:00.000Z",
    );
    expect(sent.confirmation).toEqual({
      status: "Sent (simulated)",
      sentAt: "2026-10-20T10:00:00.000Z",
    });
    expect(sent.confirmationHistory).toEqual([
      { date: "2026-10-20T10:00:00.000Z", text: "Payment confirmation email sent (simulated)" },
    ]);
    expect(markPaymentConfirmationSent(sent, "2026-10-20T10:00:01.000Z")).toBe(sent);
  });

  it("asks unadmitted reviewed applicants to record the first payment", () => {
    expect(nextAction(person(), [])).toBe("Record Payment");
  });

  it("arranges a meeting when an overdue installment has reached the reminder limit", () => {
    const overduePerson = person({
      admissionNo: "ADM2026-001",
      plan: [
        plan[0]!,
        {
          ...plan[1]!,
          dueDate: "2026-10-19",
          reminders: [
            { date: "2026-10-10", text: "1" },
            { date: "2026-10-15", text: "2" },
          ],
        },
      ],
    });
    expect(nextAction(overduePerson, [payment("i1", 100, "2026-09-30")])).toBe("Arrange Meeting");
  });

  it("sends reminders for overdue installments before handoff, and soon-due installments", () => {
    const overduePerson = person({
      admissionNo: "ADM2026-001",
      plan: [plan[0]!, { ...plan[1]!, dueDate: "2026-10-19" }],
    });
    const paidFirst = payment("i1", 100, "2026-09-30");
    expect(nextAction(overduePerson, [paidFirst])).toBe("Send Reminder");
    expect(nextAction(overduePerson, [paidFirst])).not.toBe("Send to Administration");

    const dueSoonPerson = person({
      admissionNo: "ADM2026-001",
      plan: [plan[0]!, { ...plan[1]!, dueDate: "2026-10-25" }],
    });
    expect(nextAction(dueSoonPerson, [paidFirst])).toBe("Send Reminder");
  });

  it("sends an eligible person to Administration when no handoff exists", () => {
    const eligiblePerson = person({ admissionNo: "ADM2026-001" });
    const paidFirst = payment("i1", 100, "2026-09-30");
    expect(nextAction(eligiblePerson, [paidFirst])).toBe("Send to Administration");
  });

  it("requests an admission number for a sent handoff without one", () => {
    const applicant = person();
    const handoff: Handoff = {
      personId: applicant.id,
      target: "Administration",
      status: "Sent",
      history: [],
    };
    expect(nextAction(applicant, [payment("i1", 100, "2026-09-30")], [handoff])).toBe(
      "Enter Admission No.",
    );
  });

  it("notifies Administration after overdue installments are cleared", () => {
    const clearedPerson = person({
      admissionNo: "ADM2026-001",
      applicationStatus: "Admitted",
      plan: [plan[0]!],
    });
    const latePaid = payment("i1", 100, "2026-10-03");
    const completedHandoff: Handoff = {
      personId: clearedPerson.id,
      target: "Administration",
      status: "Completed",
      history: [],
    };
    expect(classAccess(clearedPerson, [latePaid], TODAY)).toBe("Payment Cleared");
    expect(nextAction(clearedPerson, [latePaid], [completedHandoff])).toBe("Notify Administration");
    expect(
      nextAction(clearedPerson, [{ ...latePaid, adminNotified: true }], [completedHandoff]),
    ).toBeNull();
    const onTimePaid = { ...latePaid, date: "2026-09-30" };
    expect(nextAction(clearedPerson, [onTimePaid], [completedHandoff])).toBeNull();
    expect(nextAction(person({ plan: [plan[0]!] }), [latePaid], [completedHandoff])).not.toBe(
      "Notify Administration",
    );

    const alreadyLogged = {
      ...completedHandoff,
      history: [
        {
          date: "2026-10-20",
          text: ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
          referenceId: latePaid.id,
        },
      ],
    };
    expect(nextAction(clearedPerson, [latePaid], [alreadyLogged])).toBeNull();
  });

  it("returns no action when no workflow condition applies and orders task priority", () => {
    const complete = person({
      admissionNo: "ADM2026-001",
      applicationStatus: "Admitted",
      adminNotifiedOfClearance: true,
      plan: [plan[1]!],
    });
    const completeHandoff: Handoff = {
      personId: complete.id,
      target: "Administration",
      status: "Completed",
      history: [],
    };
    expect(nextAction(complete, [payment("i2", 100, "2026-10-30")], [completeHandoff])).toBeNull();
    expect(taskPriority(person({ applicationStatus: "Received", plan: [plan[1]!] }), [])).toBe(3);
    expect(taskPriority(person({ admissionNo: "ADM2026-001" }), [])).toBe(1);
    expect(taskPriority(complete, [payment("i2", 100, "2026-10-30")], [completeHandoff])).toBe(4);
    const meetingPriority = person({
      plan: [
        {
          ...plan[0]!,
          reminders: [
            { date: "2026-10-10", text: "1" },
            { date: "2026-10-15", text: "2" },
          ],
        },
      ],
    });
    expect(taskPriority(meetingPriority, [])).toBe(0);
    const dueSoonPriority = person({
      plan: [{ ...plan[1]!, dueDate: "2026-10-25" }],
    });
    expect(taskPriority(dueSoonPriority, [])).toBe(2);
  });

  it("seeds existing Billing students with matching plans, totals, due dates and statuses", () => {
    const workflow = createDemoFeeWorkflow(seedStudents, seedPayments);
    expect(
      workflow.persons.filter(
        (item) => item.applicationId === "APP2026-104" || item.applicationId === "APP2026-105",
      ),
    ).toHaveLength(2);
    expect(workflow.persons.filter((item) => item.id.startsWith("APP-P-"))).toHaveLength(15);
    expect(
      workflow.payments
        .filter((payment) => !DEMO_SCENARIO_PEOPLE.some((person) => person.id === payment.personId))
        .every((payment) => payment.adminNotified),
    ).toBe(true);
    for (const student of seedStudents) {
      const seededPerson = workflow.persons.find((item) => item.id === student.id)!;
      const studentPayments = workflow.payments.filter((item) => item.personId === student.id);
      const totals = personTotals(seededPerson, studentPayments);
      expect(totals.payable).toBe(student.totalFee);
      expect(totals.paid).toBe(studentPaid(student.id, seedPayments));
      expect(totals.nextDueInstallment?.dueDate ?? null).toBe(nextDue(student, seedPayments));
      expect(
        totals.paid >= totals.payable
          ? "Paid"
          : totals.daysOverdue > 0
            ? "Overdue"
            : totals.paid > 0
              ? "Partially Paid"
              : "Pending",
      ).toBe(billStatus(student, seedPayments));
    }
  });
});
