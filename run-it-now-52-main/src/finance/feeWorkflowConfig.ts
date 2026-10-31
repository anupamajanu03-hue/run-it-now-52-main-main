import { addMonthsISO, canonicalAdmissionNo } from "./billing";
import { demoDate } from "./demoDates";
import { ADMISSION_FEE_LABEL } from "./labels";
import type {
  ApplicationStatus,
  FeeWorkflowPayment,
  Installment,
  Person,
  Student,
  StudentApplicationDetails,
} from "./types";

// Context: Sales sends the application form link from their own system; the submitted
// form arrives in Accounts. Finance & Accounts never sends form links.
// Fully paid installments needed before details go to Administration.
// Change to 0 if details should go after ANY payment.
export const HANDOFF_REQUIRES_PAID_INSTALLMENTS = 1;
// Set to false if Accounts does not review applications before recording payment.
export const REQUIRE_APPLICATION_REVIEW = true;
export const ADMINISTRATION_DETAILS_SENT_TEXT = "Details sent to Administration (simulated)";
export const ADMINISTRATION_PAYMENT_NOTIFIED_TEXT =
  "Payment notified to Administration (simulated)";
export const ADMISSION_NO_RECEIVED_TEXT = "Admission No. received from Administration (simulated)";
export const REMINDER_LEAD_DAYS = 7;
export const MAX_REMINDERS = 2;

// Demo only: class access is on hold when any installment is overdue. Enforcing this requires a future LMS integration.
export const DEMO_FEE_PLANS: Record<string, { label: string; amount: number }[]> = {
  Python: [
    { label: ADMISSION_FEE_LABEL, amount: 6000 },
    { label: "Instalment 1", amount: 5000 },
    { label: "Instalment 2", amount: 5000 },
  ],
  Tally: [
    { label: ADMISSION_FEE_LABEL, amount: 4000 },
    { label: "Instalment 1", amount: 4000 },
    { label: "Instalment 2", amount: 4000 },
  ],
  "Advanced Data Science": [
    { label: ADMISSION_FEE_LABEL, amount: 25000 },
    { label: "Instalment 1", amount: 25000 },
    { label: "Instalment 2", amount: 25000 },
  ],
};

export const DEMO_ADMITTED_APPLICATIONS = [
  { admissionNo: "ADM-2026-0104", applicationId: "APP2026-104" },
  { admissionNo: "ADM-2026-0105", applicationId: "APP2026-105" },
] as const;

export const DEMO_NEW_APPLICANTS = [
  {
    id: "APP-P-001",
    name: "Aarav Shah",
    contact: "9845000201",
    email: "aarav.shah@example.com",
    course: "Python",
    appliedOn: "2026-10-18",
    applicationId: "APP2026-001",
    applicationStatus: "Received",
  },
  {
    id: "APP-P-002",
    name: "Diya Nair",
    contact: "9845000202",
    email: "diya.nair@example.com",
    course: "Tally",
    appliedOn: "2026-10-12",
    applicationId: "APP2026-002",
    applicationStatus: "Reviewed",
  },
  {
    id: "APP-P-003",
    name: "Kabir Rao",
    contact: "9845000203",
    email: "kabir.rao@example.com",
    course: "Advanced Data Science",
    appliedOn: "2026-10-01",
    applicationId: "APP2026-003",
    applicationStatus: "Payment Recorded",
  },
] as const;

export const DEMO_APPLICANT_PAYMENTS: FeeWorkflowPayment[] = [
  {
    id: "APP-PAY-003",
    personId: "APP-P-003",
    amount: 25000,
    date: "2026-10-02",
    method: "UPI",
    reference: "APP-TXN-003",
    receiptNo: "APP-RCP-003",
    allocations: [{ installmentId: "APP-P-003-I01", amount: 25000 }],
    adminNotified: true,
    confirmation: { status: "Sent (simulated)", sentAt: "2026-10-02T10:00:00.000Z" },
  },
];

export function buildPlan(
  personId: string,
  course: string,
  appliedOn: string,
  installments: { label: string; amount: number }[],
  installmentCount?: number,
  dueDateOverrides: Record<number, string> = {},
): Installment[] {
  const configuredPlan = installments.length
    ? installments
    : (DEMO_FEE_PLANS[course] ?? [
        { label: ADMISSION_FEE_LABEL, amount: 10000 },
        { label: "Instalment 1", amount: 10000 },
      ]);
  if (installmentCount !== undefined && !Number.isInteger(installmentCount)) {
    throw new RangeError("Installment count must be a whole number.");
  }
  const count =
    installmentCount === undefined ? configuredPlan.length : Math.max(1, installmentCount);
  let plan = configuredPlan;

  if (installmentCount !== undefined) {
    const total = configuredPlan.reduce((sum, installment) => sum + installment.amount, 0);
    const admissionFee = configuredPlan.find(
      (installment) => installment.label === ADMISSION_FEE_LABEL,
    );
    const installmentTotal = total - (admissionFee?.amount ?? 0);
    const installmentAmount = Math.floor(installmentTotal / count);
    plan = [
      ...(admissionFee ? [admissionFee] : []),
      ...Array.from({ length: count }, (_, index) => ({
        label: `Instalment ${index + 1}`,
        amount:
          index === count - 1
            ? installmentTotal - installmentAmount * (count - 1)
            : installmentAmount,
      })),
    ];
  } else if (installments.length === 0) {
    plan = [
      {
        label: "Full payment",
        amount: configuredPlan.reduce((sum, installment) => sum + installment.amount, 0),
      },
    ];
  } else {
    let installmentIndex = 0;
    plan = configuredPlan.map((installment) =>
      installment.label === ADMISSION_FEE_LABEL
        ? installment
        : { ...installment, label: `Instalment ${++installmentIndex}` },
    );
  }

  return plan.map((installment, index) => ({
    id: `${personId}-I${String(index + 1).padStart(2, "0")}`,
    label: installment.label,
    amountDue: installment.amount,
    dueDate: dueDateOverrides[index] ?? addMonthsISO(appliedOn, index),
    reminders: [],
    meetingNotes: [],
  }));
}

function completeDemoForm(
  index: number,
  course: string,
  installmentPreference: number,
): StudentApplicationDetails {
  const educationRows = [
    "Education 1: B.Com, Demo City University, 2022-2025.",
    ...(index % 2 === 0
      ? ["Education 2: Accounts Intern, Sample Ledger Services, 2025-2026."]
      : []),
  ];
  const leadSources = [
    ["Website", "web-form"],
    ["Referral", "ref-demo"],
    ["College fair", "fair-demo"],
    ["Social media", "social-demo"],
    ["Walk-in", "walk-in-demo"],
    ["Alumni referral", "alumni-demo"],
  ] as const;
  const [leadSource, leadReference] = leadSources[index % leadSources.length]!;

  return {
    dateOfBirth: `200${index % 5}-0${(index % 8) + 1}-14`,
    passportPhoto: index === 2 ? undefined : { fileName: "passport-photo.png", previewUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#e5e7eb"/><circle cx="32" cy="24" r="12" fill="#9ca3af"/><path d="M10 62c2-15 10-22 22-22s20 7 22 22" fill="#9ca3af"/></svg>')}` },
    addressLine1: `Flat ${index + 1}, Sample Nagar`,
    addressLine2: `Block ${String.fromCharCode(65 + (index % 5))}`,
    city: "Demo City",
    state: "Karnataka",
    postalCode: `5600${String(index + 1).padStart(2, "0")}`,
    guardianName: `Guardian ${index + 1} Nair`,
    guardianRelationship: index % 2 === 0 ? "Parent" : "Guardian",
    guardianPhone: `91000000${String(index + 1).padStart(2, "0")}`,
    guardianEmail: `guardian${index + 1}@example.com`,
    educationWorkExperience: educationRows.join("\n"),
    leadSource,
    leadReference: `${leadReference}-${index + 1}`,
    coursePreference: course,
    installmentPreference,
    documents: (["ID proof", "Address proof", "Latest marksheet", "TC"] as const).map((type, documentIndex) => {
      const provided = (index + documentIndex) % 3 !== 0;
      const fileName = ["id-proof.pdf", "address-proof.pdf", "latest-marksheet.pdf", "tc.pdf"][documentIndex]!;
      return { type, provided, ...(provided ? { fileName } : {}) };
    }),
    documentsEnclosed: (["ID proof", "Address proof", "Latest marksheet", "TC"] as const)
      .filter((_, documentIndex) => (index + documentIndex) % 3 !== 0)
      .map((type) => type),
    declarationAccepted: true,
  };
}

const scenarioDefinitions: {
  id: number;
  name: string;
  course: string;
  appliedOffset: number;
  installments: number;
  status: ApplicationStatus;
  admissionNo?: string;
  sparse?: boolean;
  dueDateOverrides?: Record<number, string>;
}[] = [
  {
    id: 118,
    name: "Aditi Nair",
    course: "Python",
    appliedOffset: -1,
    installments: 3,
    status: "Received",
  },
  {
    id: 119,
    name: "Rohan Iyer",
    course: "Python",
    appliedOffset: -2,
    installments: 1,
    status: "Received",
  },
  {
    id: 120,
    name: "Meera Kulkarni",
    course: "Tally",
    appliedOffset: -3,
    installments: 3,
    status: "Reviewed",
  },
  {
    id: 121,
    name: "Ishaan Rao",
    course: "Advanced Data Science",
    appliedOffset: -5,
    installments: 3,
    status: "Payment Recorded",
  },
  {
    id: 122,
    name: "Kavya Menon",
    course: "Python",
    appliedOffset: -7,
    installments: 3,
    status: "Payment Recorded",
  },
  {
    id: 123,
    name: "Arjun Shah",
    course: "Tally",
    appliedOffset: -10,
    installments: 3,
    status: "Payment Recorded",
  },
  {
    id: 124,
    name: "Nisha Desai",
    course: "Advanced Data Science",
    appliedOffset: -30,
    installments: 4,
    status: "Admitted",
    admissionNo: "ADM-2026-0118",
    dueDateOverrides: { 1: demoDate(4) },
  },
  {
    id: 125,
    name: "Dev Patel",
    course: "Advanced Data Science",
    appliedOffset: -60,
    installments: 4,
    status: "Admitted",
    admissionNo: "ADM-2026-0119",
    dueDateOverrides: { 1: demoDate(-12) },
  },
  {
    id: 126,
    name: "Anaya Joshi",
    course: "Advanced Data Science",
    appliedOffset: -70,
    installments: 4,
    status: "Admitted",
    admissionNo: "ADM-2026-0120",
    dueDateOverrides: { 1: demoDate(-25) },
  },
  {
    id: 127,
    name: "Vivek Bhat",
    course: "Advanced Data Science",
    appliedOffset: -30,
    installments: 4,
    status: "Admitted",
    admissionNo: "ADM-2026-0121",
    dueDateOverrides: { 1: demoDate(-10) },
  },
  {
    id: 128,
    name: "Pooja Rao",
    course: "Python",
    appliedOffset: -8,
    installments: 1,
    status: "Admitted",
    admissionNo: "ADM-2026-0122",
  },
  {
    id: 129,
    name: "Sameer Shetty",
    course: "Python",
    appliedOffset: -4,
    installments: 3,
    status: "Received",
    sparse: true,
  },
];

export const DEMO_SCENARIO_PEOPLE: Person[] = scenarioDefinitions.map((scenario, index) => {
  const id = `APP-P-${scenario.id}`;
  const appliedOn = demoDate(scenario.appliedOffset);
  const plan = buildPlan(
    id,
    scenario.course,
    appliedOn,
    DEMO_FEE_PLANS[scenario.course]!,
    scenario.installments,
    scenario.dueDateOverrides,
  );
  const applicationDetails = scenario.sparse
    ? {
        dateOfBirth: "",
        passportPhoto: { fileName: "passport-photo.png", previewUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#e5e7eb"/><circle cx="32" cy="24" r="12" fill="#9ca3af"/><path d="M10 62c2-15 10-22 22-22s20 7 22 22" fill="#9ca3af"/></svg>')}` },
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        guardianName: "",
        guardianRelationship: "",
        guardianPhone: "",
        guardianEmail: "",
        educationWorkExperience: "",
        leadSource: "",
        leadReference: "",
        coursePreference: scenario.course,
        installmentPreference: scenario.installments,
        documents: (["ID proof", "Address proof", "Latest marksheet", "TC"] as const).map((type) => ({ type, provided: false })),
        documentsEnclosed: [],
        declarationAccepted: false,
      }
    : completeDemoForm(index, scenario.course, scenario.installments);

  return {
    id,
    name: scenario.name,
    contact: `90000000${String(index + 1).padStart(2, "0")}`,
    email: `${scenario.name.toLowerCase().replaceAll(" ", ".")}@example.com`,
    course: scenario.course,
    appliedOn,
    applicationId: `APP2026-${scenario.id}`,
    ...(scenario.admissionNo ? { admissionNo: scenario.admissionNo } : {}),
    applicationStatus: scenario.status,
    ...(scenario.status !== "Received"
      ? { accountantVerifiedAt: `${demoDate(scenario.appliedOffset + 2)}T10:00:00.000Z` }
      : {}),
    admissionStatus: scenario.admissionNo ? "Admitted" : "Applicant",
    plan:
      scenario.id === 125
        ? plan.map((installment, installmentIndex) =>
            installmentIndex === 1
              ? {
                  ...installment,
                  reminders: [{ date: demoDate(-3), text: "Fee reminder sent (simulated)" }],
                }
              : installment,
          )
        : scenario.id === 126
          ? plan.map((installment, installmentIndex) =>
              installmentIndex === 1
                ? {
                    ...installment,
                    reminders: [
                      { date: demoDate(-14), text: "Fee reminder sent (simulated)" },
                      { date: demoDate(-7), text: "Fee reminder sent (simulated)" },
                    ],
                  }
                : installment,
            )
          : plan,
    adminNotifiedOfClearance: scenario.id !== 127,
    applicationDetails,
  };
});

export interface DemoScenarioPaymentSpec {
  personId: string;
  amount: number;
  date: string;
  reference: string;
  receiptNo: string;
  confirmation: FeeWorkflowPayment["confirmation"];
  adminNotified: boolean;
}

export const DEMO_SCENARIO_PAYMENT_SPECS: DemoScenarioPaymentSpec[] = [
  {
    personId: "APP-P-121",
    amount: 10000,
    date: demoDate(-2),
    reference: "TXN880601",
    receiptNo: "RCP-2026-1048",
    confirmation: { status: "Not sent" },
    adminNotified: false,
  },
  {
    personId: "APP-P-122",
    amount: 6000,
    date: demoDate(-7),
    reference: "TXN880602",
    receiptNo: "RCP-2026-1049",
    confirmation: { status: "Sent (simulated)", sentAt: `${demoDate(-7)}T10:00:00.000Z` },
    adminNotified: true,
  },
  {
    personId: "APP-P-123",
    amount: 4000,
    date: demoDate(-10),
    reference: "TXN880603",
    receiptNo: "RCP-2026-1050",
    confirmation: { status: "Sent (simulated)", sentAt: `${demoDate(-10)}T10:00:00.000Z` },
    adminNotified: true,
  },
  {
    personId: "APP-P-124",
    amount: 25000,
    date: demoDate(-30),
    reference: "TXN880604",
    receiptNo: "RCP-2026-1051",
    confirmation: { status: "Sent (simulated)", sentAt: `${demoDate(-30)}T10:00:00.000Z` },
    adminNotified: true,
  },
  {
    personId: "APP-P-125",
    amount: 25000,
    date: demoDate(-60),
    reference: "TXN880605",
    receiptNo: "RCP-2026-1052",
    confirmation: { status: "Sent (simulated)", sentAt: `${demoDate(-60)}T10:00:00.000Z` },
    adminNotified: true,
  },
  {
    personId: "APP-P-126",
    amount: 25000,
    date: demoDate(-70),
    reference: "TXN880606",
    receiptNo: "RCP-2026-1053",
    confirmation: { status: "Sent (simulated)", sentAt: `${demoDate(-70)}T10:00:00.000Z` },
    adminNotified: true,
  },
  {
    personId: "APP-P-127",
    amount: 25000,
    date: demoDate(-30),
    reference: "TXN880607",
    receiptNo: "RCP-2026-1054",
    confirmation: { status: "Sent (simulated)", sentAt: `${demoDate(-30)}T10:00:00.000Z` },
    adminNotified: true,
  },
  {
    personId: "APP-P-127",
    amount: 25000,
    date: demoDate(-3),
    reference: "TXN880608",
    receiptNo: "RCP-2026-1055",
    confirmation: { status: "Not sent" },
    adminNotified: false,
  },
  {
    personId: "APP-P-128",
    amount: 16000,
    date: demoDate(-8),
    reference: "TXN880609",
    receiptNo: "RCP-2026-1056",
    confirmation: { status: "Sent (simulated)", sentAt: `${demoDate(-8)}T10:00:00.000Z` },
    adminNotified: true,
  },
];

export const DEMO_SCENARIO_HANDOFF_DATES: Record<
  string,
  { detailsSent: string; admissionReceived?: string }
> = {
  "APP-P-123": { detailsSent: `${demoDate(-8)}T10:00:00.000Z` },
  "APP-P-124": {
    detailsSent: `${demoDate(-28)}T10:00:00.000Z`,
    admissionReceived: `${demoDate(-27)}T10:00:00.000Z`,
  },
  "APP-P-125": {
    detailsSent: `${demoDate(-58)}T10:00:00.000Z`,
    admissionReceived: `${demoDate(-57)}T10:00:00.000Z`,
  },
  "APP-P-126": {
    detailsSent: `${demoDate(-68)}T10:00:00.000Z`,
    admissionReceived: `${demoDate(-67)}T10:00:00.000Z`,
  },
  "APP-P-127": {
    detailsSent: `${demoDate(-28)}T10:00:00.000Z`,
    admissionReceived: `${demoDate(-27)}T10:00:00.000Z`,
  },
  "APP-P-128": {
    detailsSent: `${demoDate(-6)}T10:00:00.000Z`,
    admissionReceived: `${demoDate(-5)}T10:00:00.000Z`,
  },
};

export const DEMO_BILLING_SCENARIO_PERSON_IDS = DEMO_SCENARIO_PEOPLE.slice(3, 11).map(
  (person) => person.id,
);

export function personFromStudent(student: Student, index: number): Person {
  const admissionNo = student.regNo ? canonicalAdmissionNo(student.regNo) : "";
  const seededApplicant = DEMO_ADMITTED_APPLICATIONS.find(
    (item) => canonicalAdmissionNo(item.admissionNo) === admissionNo,
  );
  const admissionSequence = admissionNo.split("-").at(-1)?.replace(/^0+/, "");
  const applicationId =
    student.applicationId ??
    seededApplicant?.applicationId ??
    `APP2026-${admissionSequence || String(index + 1).padStart(3, "0")}`;
  return {
    id: student.id,
    name: student.name,
    contact: student.phone,
    email: student.email ?? `${student.id.toLowerCase()}@example.com`,
    course: student.course,
    appliedOn: student.registeredOn,
    applicationId,
    admissionNo: admissionNo || undefined,
    applicationStatus: student.regNo ? "Admitted" : "Received",
    admissionStatus: student.regNo ? "Admitted" : "Applicant",
    ...(student.regNo ? { accountantVerifiedAt: `${student.registeredOn}T10:00:00.000Z` } : {}),
    plan: student.installments.map((installment, installmentIndex) => ({
      id: `${student.id}-I${String(installmentIndex + 1).padStart(2, "0")}`,
      label: installment.label,
      amountDue: installment.amount,
      dueDate: installment.due,
      reminders: [],
      meetingNotes: [],
    })),
    adminNotifiedOfClearance: false,
    applicationDetails: student.applicationDetails,
  };
}

export function newDemoApplicants(): Person[] {
  return DEMO_NEW_APPLICANTS.map((applicant, index) => ({
    ...applicant,
    ...(applicant.applicationStatus !== "Received"
      ? { accountantVerifiedAt: `${applicant.appliedOn}T10:00:00.000Z` }
      : {}),
    admissionStatus: "Applicant" as const,
    plan: buildPlan(
      applicant.id,
      applicant.course,
      applicant.appliedOn,
      DEMO_FEE_PLANS[applicant.course] ?? [
        { label: ADMISSION_FEE_LABEL, amount: 10000 },
        { label: "Instalment 1", amount: 10000 },
      ],
    ),
    adminNotifiedOfClearance: false,
    applicationDetails: completeDemoForm(index + 10, applicant.course, 2),
  }));
}
