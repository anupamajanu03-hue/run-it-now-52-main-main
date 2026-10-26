import {
  type Context,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cashCountReducer, initialCashCount } from "./cashCount";
import { canonicalAdmissionNo } from "./billing";
import { seedCourseCatalog, SEED_DEPARTMENTS } from "./courses";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  OPENING,
  PETTY_CATEGORIES,
  seedPetty,
  seedPayments,
  seedSettlements,
  seedStudents,
  seedTransactions,
} from "./data";
import { isCash, pettyDailyBalances, sum, TODAY } from "./logic";
import type {
  CourseCatalog,
  FeePayment,
  FeeReminder,
  FeeWorkflowPayment,
  Handoff,
  InstallmentReminder,
  Person,
  PettyEntry,
  Settlement,
  Student,
  Transaction,
} from "./types";
import {
  ADMISSION_NO_RECEIVED_TEXT,
  ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
} from "./feeWorkflowConfig";
import {
  areAllPaymentsAdministrationNotified,
  allocatePayment,
  createDemoBillingPayments,
  createDemoBillingStudents,
  createDemoFeeWorkflow,
  createNewFeeWorkflowPayment,
  feeWorkflowPaymentStatus,
  markPaymentsAdministrationNotified,
  mergeBillingPayments,
  recordAdministrationDetailsSent,
  studentFromAdmittedPerson,
  validateAdmissionNo,
} from "./feeWorkflow";
import { personFromStudent } from "./feeWorkflowConfig";
import type { FeeWorkflowState } from "./feeWorkflow";

const COURSE_CATALOG_STORAGE_KEY = "finance-course-catalog-v2";

const INITIAL_FEE_WORKFLOW = createDemoFeeWorkflow(seedStudents, seedPayments);
const INITIAL_DEMO_STUDENTS = createDemoBillingStudents(INITIAL_FEE_WORKFLOW);
const INITIAL_BILLING_PAYMENTS = createDemoBillingPayments(seedPayments, INITIAL_FEE_WORKFLOW);

export interface FinanceSettings {
  institution: { name: string; address: string; phone: string; email: string; gstin: string };
  financialYear: { label: string; start: string; end: string };
  incomeCategories: string[];
  expenseCategories: string[];
  accountCategories: string[];
  pettyCategories: string[];
  paymentMethods: Record<string, boolean>;
  receipt: { prefix: string; next: number; footer: string };
  currency: { code: string; symbol: string; grouping: string };
}

const defaultSettings: FinanceSettings = {
  institution: {
    name: "Sample Institute of Higher Studies",
    address: "12 College Road, Bengaluru 560001",
    phone: "+91 80 4000 1234",
    email: "accounts@sample-institute.edu.in",
    gstin: "29ABCDE1234F1Z5",
  },
  financialYear: { label: "FY 2026-27", start: "2026-04-01", end: "2027-03-31" },
  incomeCategories: INCOME_CATEGORIES,
  expenseCategories: EXPENSE_CATEGORIES,
  accountCategories: ["Assets", "Liabilities", "Income", "Expenses", "Equity"],
  pettyCategories: PETTY_CATEGORIES,
  paymentMethods: {
    Cash: true,
    UPI: true,
    "Bank Transfer": true,
    Cheque: true,
  },
  receipt: {
    prefix: "RCP-2026-",
    next:
      Math.max(
        1000,
        ...seedTransactions.map((transaction) =>
          Number(transaction.receiptNo?.split("-").at(-1) ?? 0),
        ),
        ...INITIAL_BILLING_PAYMENTS.map((payment) =>
          Number(payment.receiptNo.split("-").at(-1) ?? 0),
        ),
      ) + 1,
    footer: "This is a computer-generated receipt.",
  },
  currency: { code: "INR", symbol: "₹", grouping: "Indian (12,34,567)" },
};

const uid = (p: string) =>
  `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

type BalanceGuardError = { reason: "cash" | "bank" | "petty"; available: number };
type TransactionSaveResult = true | false | BalanceGuardError;

function useFinanceState() {
  const [students, setStudents] = useState<Student[]>(() => [
    ...seedStudents,
    ...INITIAL_DEMO_STUDENTS,
  ]);
  const [payments, setPayments] = useState<FeePayment[]>(INITIAL_BILLING_PAYMENTS);
  const [feeWorkflow, setFeeWorkflow] = useState<FeeWorkflowState>(INITIAL_FEE_WORKFLOW);
  const workflowPaymentRequests = useRef(new Map<string, FeeWorkflowPayment>());
  const [reminders, setReminders] = useState<FeeReminder[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>(seedTransactions);
  const [petty, setPetty] = useState<PettyEntry[]>(seedPetty);
  const [cashCount, dispatchCashCount] = useReducer(cashCountReducer, initialCashCount);
  const physicalCount = cashCount.saved.at(-1)?.total ?? null;
  const [settlements, setSettlements] = useState<Settlement[]>(seedSettlements);
  const [settings, setSettings] = useState<FinanceSettings>(defaultSettings);
  const [courseCatalog, setCourseCatalog] = useState<CourseCatalog>(seedCourseCatalog);
  const [courseCatalogLoaded, setCourseCatalogLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COURSE_CATALOG_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as CourseCatalog).courses) &&
          Array.isArray((parsed as CourseCatalog).history)
        ) {
          const oldCatalog = parsed as CourseCatalog & { departments?: string[] };
          setCourseCatalog({
            courses: oldCatalog.courses.map((course) => {
              const fallback = seedCourseCatalog.courses.find(
                (seed) => seed.id === course.id || seed.name === course.name,
              );
              const oldDepartment = course.department as string | undefined;
              return {
                ...course,
                department: SEED_DEPARTMENTS.includes(oldDepartment ?? "")
                  ? oldDepartment!
                  : (fallback?.department ?? SEED_DEPARTMENTS[0]!),
              };
            }),
            history: oldCatalog.history,
            departments: SEED_DEPARTMENTS,
          });
        }
      }
    } catch {
      // Keep the bundled catalog if browser storage is unavailable or malformed.
    }
    setCourseCatalogLoaded(true);
  }, []);

  useEffect(() => {
    if (!courseCatalogLoaded) return;
    try {
      window.localStorage.setItem(COURSE_CATALOG_STORAGE_KEY, JSON.stringify(courseCatalog));
    } catch {
      // The current session remains usable if browser storage is unavailable.
    }
  }, [courseCatalog, courseCatalogLoaded]);

  const balances = useMemo(() => {
    const cashIn =
      sum(payments.filter((p) => isCash(p.method)).map((p) => p.amount)) +
      sum(transactions.filter((t) => t.type === "income" && isCash(t.method)).map((t) => t.amount));
    const cashOut = sum(
      transactions.filter((t) => t.type === "expense" && isCash(t.method)).map((t) => t.amount),
    );
    const bankIn =
      sum(payments.filter((p) => !isCash(p.method)).map((p) => p.amount)) +
      sum(
        transactions.filter((t) => t.type === "income" && !isCash(t.method)).map((t) => t.amount),
      );
    const bankOut = sum(
      transactions.filter((t) => t.type === "expense" && !isCash(t.method)).map((t) => t.amount),
    );
    const pettyBook =
      pettyDailyBalances(petty, OPENING.petty, TODAY).at(-1)?.closing ?? OPENING.petty;
    return {
      cash: OPENING.cash + cashIn - cashOut,
      bank: OPENING.bank + bankIn - bankOut,
      pettyBook,
    };
  }, [payments, transactions, petty]);

  return {
    students,
    payments,
    reminders,
    transactions,
    petty,
    physicalCount,
    settlements,
    feeWorkflow,
    updateFeeWorkflowPerson: (person: Person) =>
      setFeeWorkflow((current) => ({
        ...current,
        persons: current.persons.map((item) => (item.id === person.id ? person : item)),
      })),
    addFeeWorkflowPayment: (payment: Omit<FeeWorkflowPayment, "id" | "adminNotified">) => {
      const requestKey = `${payment.personId}|${payment.receiptNo}`;
      const existing = feeWorkflow.payments.find(
        (item) => item.personId === payment.personId && item.receiptNo === payment.receiptNo,
      );
      if (existing) return existing;
      const pending = workflowPaymentRequests.current.get(requestKey);
      if (pending) return pending;
      const created = createNewFeeWorkflowPayment(
        {
          ...payment,
          confirmation: { status: "Not sent" as const },
        },
        uid("FWP-"),
      );
      workflowPaymentRequests.current.set(requestKey, created);
      setFeeWorkflow((current) => {
        if (
          current.payments.some(
            (item) => item.id === created.id || item.receiptNo === created.receiptNo,
          )
        )
          return current;
        const payments = [...current.payments, created];
        return {
          ...current,
          payments,
          persons: current.persons.map((person) =>
            person.id !== created.personId
              ? person
              : {
                  ...person,
                  adminNotifiedOfClearance: areAllPaymentsAdministrationNotified(
                    payments.filter((item) => item.personId === person.id),
                  ),
                },
          ),
        };
      });
      return created;
    },
    recordFeeWorkflowPayment: (payment: Omit<FeeWorkflowPayment, "id" | "adminNotified">) => {
      const requestKey = `${payment.personId}|${payment.receiptNo}`;
      const existing = feeWorkflow.payments.find(
        (item) => item.personId === payment.personId && item.receiptNo === payment.receiptNo,
      );
      if (existing) return existing;
      const pending = workflowPaymentRequests.current.get(requestKey);
      if (pending) return pending;
      const created = createNewFeeWorkflowPayment(
        {
          ...payment,
          confirmation: { status: "Not sent" as const },
        },
        uid("FWP-"),
      );
      workflowPaymentRequests.current.set(requestKey, created);
      const person = feeWorkflow.persons.find((item) => item.id === payment.personId);
      const nextPayments = [...feeWorkflow.payments, created];
      setFeeWorkflow((current) =>
        current.payments.some(
          (item) => item.id === created.id || item.receiptNo === created.receiptNo,
        )
          ? current
          : {
              ...current,
              payments: [...current.payments, created],
              persons: current.persons.map((item) =>
                item.id !== payment.personId || !person
                  ? item
                  : {
                      ...item,
                      paymentStatus: feeWorkflowPaymentStatus(
                        item,
                        nextPayments.filter((entry) => entry.personId === item.id),
                      ),
                      adminNotifiedOfClearance: areAllPaymentsAdministrationNotified(
                        nextPayments.filter((entry) => entry.personId === item.id),
                      ),
                      applicationStatus:
                        item.admissionStatus === "Admitted" || item.admissionNo
                          ? item.applicationStatus
                          : "Payment Recorded",
                    },
              ),
            },
      );
      const student = students.find((item) => item.id === payment.personId);
      if (!student && person) {
        setStudents((current) =>
          current.some((item) => item.id === person.id)
            ? current
            : [
                ...current,
                {
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
                },
              ],
        );
      }
      setPayments((current) =>
        current.some((item) => item.id === created.id)
          ? current
          : [
              ...current,
              {
                id: created.id,
                studentId: payment.personId,
                date: created.date,
                amount: created.amount,
                method: created.method,
                reference: created.reference,
                receiptNo: created.receiptNo,
                allocations: created.allocations,
              },
            ],
      );
      setSettings((current) => ({
        ...current,
        receipt: { ...current.receipt, next: current.receipt.next + 1 },
      }));
      return created;
    },
    updateFeeWorkflowPayment: (payment: FeeWorkflowPayment) =>
      setFeeWorkflow((current) => ({
        ...current,
        payments: current.payments.map((item) =>
          item.id !== payment.id || item.confirmation.status === "Sent (simulated)"
            ? item
            : payment,
        ),
      })),
    recordFeeWorkflowPaymentConfirmation: (payment: FeeWorkflowPayment) =>
      setFeeWorkflow((current) => ({
        ...current,
        payments: current.payments.map((item) =>
          item.id !== payment.id
            ? item
            : {
                ...item,
                confirmation: payment.confirmation,
                confirmationHistory: payment.confirmationHistory,
              },
        ),
      })),
    notifyFeeWorkflowPayments: (paymentIds: string[]) =>
      setFeeWorkflow((current) => {
        const payments = markPaymentsAdministrationNotified(current.payments, paymentIds);
        if (payments === current.payments) return current;
        return {
          ...current,
          payments,
          persons: current.persons.map((person) => {
            const adminNotifiedOfClearance = areAllPaymentsAdministrationNotified(
              payments.filter((payment) => payment.personId === person.id),
            );
            return person.adminNotifiedOfClearance === adminNotifiedOfClearance
              ? person
              : { ...person, adminNotifiedOfClearance };
          }),
        };
      }),
    sendFeeWorkflowDetailsToAdministration: (personId: string) =>
      setFeeWorkflow((current) => {
        const person = current.persons.find((item) => item.id === personId);
        if (!person) return current;
        const handoffs = recordAdministrationDetailsSent(
          current.handoffs,
          person,
          current.payments,
          new Date().toISOString(),
        );
        return handoffs === current.handoffs ? current : { ...current, handoffs };
      }),
    saveFeeWorkflowHandoff: (handoff: Handoff) =>
      setFeeWorkflow((current) => {
        const existing = current.handoffs.find(
          (item) => item.personId === handoff.personId && item.target === handoff.target,
        );
        const history = [...(existing?.history ?? [])];
        const paymentNotificationRefs = new Set(
          history
            .filter(
              (entry) => entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT && !!entry.referenceId,
            )
            .map((entry) => entry.referenceId!),
        );
        const keys = new Set(
          history.map((entry) => `${entry.referenceId ?? ""}|${entry.date}|${entry.text}`),
        );
        for (const entry of handoff.history) {
          const key = `${entry.referenceId ?? ""}|${entry.date}|${entry.text}`;
          if (
            entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT &&
            entry.referenceId &&
            paymentNotificationRefs.has(entry.referenceId)
          )
            continue;
          if (!keys.has(key)) {
            history.push(entry);
            keys.add(key);
            if (entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT && entry.referenceId)
              paymentNotificationRefs.add(entry.referenceId);
          }
        }
        const saved = { ...handoff, history };
        const notifiedPaymentIds = (handoff.target === "Administration" ? history : [])
          .filter(
            (entry) => entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT && !!entry.referenceId,
          )
          .map((entry) => entry.referenceId!)
          .filter((id) =>
            current.payments.some(
              (payment) => payment.id === id && payment.personId === handoff.personId,
            ),
          );
        const payments = markPaymentsAdministrationNotified(current.payments, notifiedPaymentIds);
        return {
          ...current,
          payments,
          persons: current.persons.map((person) => {
            const adminNotifiedOfClearance = areAllPaymentsAdministrationNotified(
              payments.filter((payment) => payment.personId === person.id),
            );
            return person.adminNotifiedOfClearance === adminNotifiedOfClearance
              ? person
              : { ...person, adminNotifiedOfClearance };
          }),
          handoffs: [
            ...current.handoffs.filter(
              (item) => item.personId !== handoff.personId || item.target !== handoff.target,
            ),
            saved,
          ],
        };
      }),
    receiveFeeWorkflowAdmissionNo: (
      personId: string,
      admissionNo: string,
    ): true | "invalid" | "duplicate" | "missing" | "not-awaiting" => {
      const validation = validateAdmissionNo(admissionNo, personId, feeWorkflow.persons, students);
      if (validation !== "valid") return validation;
      const normalized = canonicalAdmissionNo(admissionNo);
      const person = feeWorkflow.persons.find((item) => item.id === personId);
      if (!person) return "missing";
      const administrationHandoff = feeWorkflow.handoffs.find(
        (item) =>
          item.personId === personId &&
          item.target === "Administration" &&
          item.status === "Awaiting Admission No.",
      );
      if (!administrationHandoff) return "not-awaiting";

      const date = new Date().toISOString();
      const admittedPerson: Person = {
        ...person,
        admissionNo: normalized,
        applicationStatus: "Admitted",
        admissionStatus: "Admitted",
        paymentStatus: feeWorkflowPaymentStatus(
          person,
          feeWorkflow.payments.filter((payment) => payment.personId === personId),
        ),
      };
      const student = studentFromAdmittedPerson(admittedPerson, normalized);

      setFeeWorkflow((current) => ({
        ...current,
        persons: current.persons.map((item) => (item.id === personId ? admittedPerson : item)),
        handoffs: current.handoffs.map((item) => {
          if (item.personId !== personId) return item;
          if (item.target === "Administration") {
            return {
              ...item,
              status: "Completed",
              history: [...item.history, { date, text: ADMISSION_NO_RECEIVED_TEXT }],
            };
          }
          if (item.target === "Sales") {
            return {
              ...item,
              status: "Completed",
              history: [...item.history, { date, text: "Application completed (simulated)" }],
            };
          }
          return item;
        }),
      }));
      setStudents((current) =>
        current.some((item) => item.id === student.id)
          ? current.map((item) => (item.id === student.id ? student : item))
          : [...current, student],
      );
      setPayments((current) => mergeBillingPayments(current, feeWorkflow.payments, personId));
      return true;
    },
    logInstallmentReminder: (
      personId: string,
      installmentId: string,
      reminder: InstallmentReminder,
    ) =>
      setFeeWorkflow((current) => ({
        ...current,
        persons: current.persons.map((person) =>
          person.id !== personId
            ? person
            : {
                ...person,
                plan: person.plan.map((installment) =>
                  installment.id !== installmentId
                    ? installment
                    : reminder.id &&
                        installment.reminders.some((existing) => existing.id === reminder.id)
                      ? installment
                      : {
                          ...installment,
                          reminders: [...installment.reminders, reminder],
                        },
                ),
              },
        ),
      })),
    addInstallmentMeetingNote: (personId: string, installmentId: string, note: string) =>
      setFeeWorkflow((current) => ({
        ...current,
        persons: current.persons.map((person) =>
          person.id !== personId
            ? person
            : {
                ...person,
                plan: person.plan.map((installment) =>
                  installment.id !== installmentId
                    ? installment
                    : {
                        ...installment,
                        meetingNotes: [...installment.meetingNotes, note],
                      },
                ),
              },
        ),
      })),
    settings,
    courseCatalog,
    setCourseCatalog,
    balances,
    logReminder: (reminder: Omit<FeeReminder, "id">) => {
      setReminders((current) =>
        current.some(
          (item) =>
            item.studentId === reminder.studentId &&
            item.sentAt.slice(0, 10) === reminder.sentAt.slice(0, 10),
        )
          ? current
          : [...current, { ...reminder, id: uid("REM-") }],
      );
    },
    addStudent: (s: Omit<Student, "id">) => {
      const normalizeContact = (value: string) => {
        const digits = value.replace(/\D/g, "");
        return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
      };
      const matchedPerson =
        feeWorkflow.persons.find(
          (person) => !!s.applicationId && person.applicationId === s.applicationId.trim(),
        ) ??
        feeWorkflow.persons.find(
          (person) => normalizeContact(person.contact) === normalizeContact(s.phone),
        );
      if (matchedPerson) {
        const existingStudent =
          students.find((student) => student.id === matchedPerson.id) ??
          students.find(
            (student) => !!s.applicationId && student.applicationId === s.applicationId.trim(),
          ) ??
          students.find((student) => normalizeContact(student.phone) === normalizeContact(s.phone));
        const linkedStudent: Student = existingStudent ?? {
          id: matchedPerson.id,
          applicationId: matchedPerson.applicationId,
          name: matchedPerson.name,
          regNo: matchedPerson.admissionNo ?? "",
          admissionStatus: matchedPerson.admissionNo ? "Admitted" : "Applicant",
          course: matchedPerson.course,
          phone: matchedPerson.contact,
          email: matchedPerson.email,
          registeredOn: matchedPerson.appliedOn,
          totalFee: sum(matchedPerson.plan.map((installment) => installment.amountDue)),
          installments: matchedPerson.plan.map((installment) => ({
            label: installment.label,
            due: installment.dueDate,
            amount: installment.amountDue,
          })),
          applicationDetails: matchedPerson.applicationDetails,
        };
        if (!existingStudent)
          setStudents((current) =>
            current.some((student) => student.id === linkedStudent.id)
              ? current
              : [...current, linkedStudent],
          );
        setFeeWorkflow((current) => ({
          ...current,
          persons: current.persons.map((person) =>
            person.id === matchedPerson.id ? { ...person, billCreated: true } : person,
          ),
        }));
        return linkedStudent;
      }
      const st = { ...s, id: uid("S") };
      setStudents((x) => [...x, st]);
      const person = { ...personFromStudent(st, feeWorkflow.persons.length), billCreated: true };
      setFeeWorkflow((current) =>
        current.persons.some((item) => item.id === person.id)
          ? current
          : { ...current, persons: [...current.persons, person] },
      );
      return st;
    },
    addPayment: (p: Omit<FeePayment, "id" | "receiptNo">) => {
      const receiptNo = `${settings.receipt.prefix}${settings.receipt.next}`;
      const existing = payments.find((payment) => payment.receiptNo === receiptNo);
      if (existing) return existing;
      const pay: FeePayment = {
        ...p,
        id: uid("P"),
        receiptNo,
      };
      setPayments((x) => (x.some((payment) => payment.id === pay.id) ? x : [...x, pay]));
      const person = feeWorkflow.persons.find((item) => item.id === p.studentId);
      if (person) {
        const workflowPayment = createNewFeeWorkflowPayment(
          {
            personId: person.id,
            amount: pay.amount,
            date: pay.date,
            method: pay.method,
            reference: pay.reference,
            receiptNo: pay.receiptNo,
            allocations: allocatePayment(
              person.plan,
              feeWorkflow.payments.filter((item) => item.personId === person.id),
              pay.amount,
            ),
            confirmation: { status: "Not sent" },
          },
          pay.id,
        );
        const nextPayments = [...feeWorkflow.payments, workflowPayment];
        setFeeWorkflow((current) => {
          if (current.payments.some((item) => item.id === workflowPayment.id)) return current;
          const currentPerson = current.persons.find((item) => item.id === person.id);
          if (!currentPerson) return current;
          const currentPayments = [...current.payments, workflowPayment];
          return {
            ...current,
            payments: currentPayments,
            persons: current.persons.map((item) =>
              item.id !== person.id
                ? item
                : {
                    ...item,
                    paymentStatus: feeWorkflowPaymentStatus(
                      item,
                      currentPayments.filter((entry) => entry.personId === item.id),
                    ),
                    adminNotifiedOfClearance: areAllPaymentsAdministrationNotified(
                      currentPayments.filter((entry) => entry.personId === item.id),
                    ),
                    applicationStatus:
                      item.admissionStatus === "Admitted" || item.admissionNo
                        ? item.applicationStatus
                        : "Payment Recorded",
                  },
            ),
          };
        });
      }
      setSettings((s) => ({ ...s, receipt: { ...s.receipt, next: s.receipt.next + 1 } }));
      return pay;
    },
    saveTransaction: (
      t: Omit<Transaction, "id"> & { id?: string | undefined },
    ): TransactionSaveResult => {
      const receiptNumbers = [t.receiptNo, t.reference].filter((r): r is string => !!r);
      if (
        receiptNumbers.some(
          (receiptNo) =>
            payments.some((p) => p.receiptNo === receiptNo) ||
            transactions.some(
              (o) => o.id !== t.id && (o.receiptNo === receiptNo || o.reference === receiptNo),
            ),
        )
      ) {
        return false;
      }
      if (t.type === "expense") {
        const isCashMethod = isCash(t.method);
        const opening = isCashMethod ? OPENING.cash : OPENING.bank;
        const movements = [
          ...payments
            .filter((payment) => isCash(payment.method) === isCashMethod)
            .map((payment) => ({ date: payment.date, amount: payment.amount, id: payment.id })),
          ...transactions
            .filter(
              (transaction) =>
                transaction.id !== t.id && isCash(transaction.method) === isCashMethod,
            )
            .map((transaction) => ({
              date: transaction.date,
              amount: transaction.type === "income" ? transaction.amount : -transaction.amount,
              id: transaction.id,
            })),
          { date: t.date, amount: t.amount, id: "\uffff-new" },
        ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        let balance = opening;
        let available = opening;
        let insufficient = false;
        movements.forEach((movement) => {
          if (movement.id === "\uffff-new") {
            available = balance;
            balance -= movement.amount;
            if (balance < 0) insufficient = true;
          } else {
            balance += movement.amount;
            if (balance < 0) insufficient = true;
          }
        });
        if (insufficient) return { reason: isCashMethod ? "cash" : "bank", available };
      }
      if (t.id)
        setTransactions((x) => x.map((o) => (o.id === t.id ? ({ ...o, ...t } as Transaction) : o)));
      else {
        setTransactions((x) => [...x, { ...t, id: uid("T") }]);
        if (t.type === "income" && t.receiptNo) {
          setSettings((s) => ({ ...s, receipt: { ...s.receipt, next: s.receipt.next + 1 } }));
        }
      }
      return true;
    },
    approveTransaction: (id: string) =>
      setTransactions((x) => x.map((o) => (o.id === id ? { ...o, status: "Approved" } : o))),
    addPetty: (e: Omit<PettyEntry, "id">): true | BalanceGuardError => {
      if (e.kind === "paid") {
        const candidate = [...petty, { ...e, id: "\uffff-new" }];
        const throughDate = e.date > TODAY ? e.date : TODAY;
        const daily = pettyDailyBalances(candidate, OPENING.petty, throughDate);
        const beforeDate =
          pettyDailyBalances(petty, OPENING.petty, e.date).at(-1)?.closing ?? OPENING.petty;
        if (daily.some((day) => day.closing < 0)) return { reason: "petty", available: beforeDate };
      }
      setPetty((x) => [...x, { ...e, id: uid("PC") }]);
      return true;
    },
    cashCount,
    dispatchCashCount,
    saveSettlement: (s: Omit<Settlement, "id"> & { id?: string | undefined }) => {
      if (s.id)
        setSettlements((x) => x.map((o) => (o.id === s.id ? ({ ...o, ...s } as Settlement) : o)));
      else setSettlements((x) => [...x, { ...s, id: uid("SET-") }]);
    },
    setSettings,
  };
}

type FinanceCtx = ReturnType<typeof useFinanceState>;
// Keep one context instance across hot reloads so a re-evaluated module
// doesn't orphan consumers from the already-mounted provider.
const globalCtx = globalThis as { __financeCtx?: Context<FinanceCtx | null> };
const Ctx = (globalCtx.__financeCtx ??= createContext<FinanceCtx | null>(null));

export function FinanceProvider({ children }: { children: ReactNode }) {
  const value = useFinanceState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinance() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFinance must be used inside FinanceProvider");
  return v;
}

/** Unified receipts/payments view: fee payments + general transactions, each record appearing once. */
export function useLedgerEntries() {
  const { payments, transactions, students } = useFinance();
  return useMemo(() => {
    const byId = new Map(students.map((s) => [s.id, s]));
    const fee = payments.map((p) => ({
      id: p.id,
      date: p.date,
      type: "income" as const,
      description: `Fee payment – ${byId.get(p.studentId)?.name ?? p.studentId}`,
      category: "Student Fees",
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      receiptNo: p.receiptNo,
      status: "Posted" as const,
      source: "fee" as const,
    }));
    const gen = transactions.map((t) => ({ ...t, source: "txn" as const }));
    return [...fee, ...gen].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [payments, transactions, students]);
}
export type LedgerEntry = ReturnType<typeof useLedgerEntries>[number];
