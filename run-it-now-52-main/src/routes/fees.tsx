import { createFileRoute, redirect } from "@tanstack/react-router";
import { addDays, differenceInCalendarDays } from "date-fns";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  canonicalAdmissionNo,
  isValidPhone,
  monthlyInstallments,
  normalizeAdmissionNo,
} from "@/finance/billing";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Eye,
  MoreHorizontal,
  Plus,
  Check,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ConfirmDialog,
  EmptyState,
  Field,
  FilterBar,
  FilterSelect,
  PageHeader,
  SampleNote,
  SearchBox,
  SectionCard,
  SimpleSelect,
  StatCard,
  StatGrid,
  StatusBadge,
  tabSearch,
} from "@/components/finance/common";
import { Receipt } from "@/components/finance/Receipt";
import { AdministrationHistory } from "@/components/finance/AdministrationHistory";
import { ApplicationDetail, ApplicationDetails } from "@/components/finance/ApplicationDetails";
import { displayInstallmentLabel } from "@/finance/types";
import { ADMISSION_FEE_LABEL } from "@/finance/labels";
import { useRecordPayment } from "@/components/finance/RecordPaymentContext";
import { useFinance } from "@/finance/store";
import {
  buildAdministrationDetailsPayload,
  buildPaymentNotificationPayload,
  buildPaymentReminderEmail,
  appearsInBilling,
  applicationStage,
  canSendToAdministration,
  classAccess,
  filterApplicationsByStage,
  hasAdministrationDetailsEvent,
  installmentDaysOverdue,
  installmentFollowUpStatus,
  installmentOutstanding,
  installmentPaid,
  installmentStatus,
  isEligibleNow,
  nextAction,
  personTotals,
  type ApplicationStage,
  type FeeNextAction,
  type PaymentNotificationPayload,
} from "@/finance/feeWorkflow";
import {
  ADMISSION_NO_RECEIVED_TEXT,
  ADMINISTRATION_DETAILS_SENT_TEXT,
  ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
  MAX_REMINDERS,
  REMINDER_LEAD_DAYS,
} from "@/finance/feeWorkflowConfig";
import { formatCourseDuration, studentCourse, studentDepartment } from "@/finance/courses";
import {
  TODAY,
  amountInWords,
  billStatus,
  formatDate,
  formatINR,
  installmentSchedule,
  nextDue,
  outstanding,
  studentPaid,
  sum,
} from "@/finance/logic";
import {
  type FeePayment,
  type FeeWorkflowPayment,
  type AdministrationDetailsSnapshot,
  type Person,
  type Student,
} from "@/finance/types";
import { ADMISSION_NO_FULL } from "@/finance/labels";
import { useEnterToNext } from "@/hooks/use-enter-to-next";

export const Route = createFileRoute("/fees")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    tab?: string;
    admissionPersonId?: string;
    applicationPersonId?: string;
    billingPersonId?: string;
    applicationAction?: string;
    workflowAction?: string;
    workflowActionPersonId?: string;
    workflowActionInstallmentId?: string;
    todayFilter?: "dueSoon" | "overdue" | "meeting";
  } => ({
    ...tabSearch(s),
    admissionPersonId: typeof s.admissionPersonId === "string" ? s.admissionPersonId : undefined,
    applicationPersonId:
      typeof s.applicationPersonId === "string" ? s.applicationPersonId : undefined,
    billingPersonId: typeof s.billingPersonId === "string" ? s.billingPersonId : undefined,
    applicationAction: typeof s.applicationAction === "string" ? s.applicationAction : undefined,
    workflowAction: typeof s.workflowAction === "string" ? s.workflowAction : undefined,
    workflowActionPersonId:
      typeof s.workflowActionPersonId === "string" ? s.workflowActionPersonId : undefined,
    workflowActionInstallmentId:
      typeof s.workflowActionInstallmentId === "string" ? s.workflowActionInstallmentId : undefined,
    todayFilter:
      s.todayFilter === "dueSoon" || s.todayFilter === "overdue" || s.todayFilter === "meeting"
        ? s.todayFilter
        : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.tab === "installments")
      throw redirect({
        to: "/fees",
        search: {
          tab: "billing",
          todayFilter: "overdue",
          billingPersonId: search.workflowActionPersonId,
          workflowAction: search.workflowAction,
          workflowActionPersonId: search.workflowActionPersonId,
          workflowActionInstallmentId: search.workflowActionInstallmentId,
        },
        replace: true,
      });
    if (search.tab === "receipts" || search.tab === "collection" || search.tab === "handoffs")
      throw redirect({ to: "/fees", search: { tab: "billing" }, replace: true });
    if (search.tab && search.tab !== "applications" && search.tab !== "billing")
      throw redirect({ to: "/fees", search: { tab: "billing" }, replace: true });
  },
  head: () => ({
    meta: [
      { title: "Student Fees — Finance & Accounts" },
      {
        name: "description",
        content: "Student billing, installments and A5 receipts.",
      },
      { property: "og:title", content: "Student Fees — Finance & Accounts" },
      {
        property: "og:description",
        content: "Student billing, installments and A5 receipts.",
      },
    ],
  }),
  component: FeesPage,
});

const LABEL: Record<string, string> = {
  applications: "Applications",
  billing: "Billing",
};
const STATUSES = ["Paid", "Partially Paid", "Pending", "Overdue"];
type BillingSort = {
  field: "nextDue" | "outstanding";
  direction: "asc" | "desc";
};

function billingStatusLabel(
  student: Student,
  payments: FeePayment[],
  person?: Person,
  personPayments: FeeWorkflowPayment[] = [],
) {
  const status = billStatus(student, payments);
  if (status !== "Overdue") return status;
  const hasAdmissionNo = !!(person?.admissionNo || student.regNo);
  if (!hasAdmissionNo)
    return studentPaid(student.id, payments) > 0 ? "Partially Paid" : "Pending";
  if (person) {
    const oldestOverdue = person.plan
      .filter((installment) => installmentStatus(installment, personPayments) === "Overdue")
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
    return `Overdue ${oldestOverdue ? installmentDaysOverdue(oldestOverdue) : 0}d`;
  }
  const oldestOverdue = installmentSchedule(
    student,
    studentPaid(student.id, payments),
    TODAY,
    payments,
  )
    .filter((installment) => installment.status === "Overdue")
    .sort((left, right) => left.due.localeCompare(right.due))[0];
  return `Overdue ${
    oldestOverdue
      ? differenceInCalendarDays(
          new Date(`${TODAY}T00:00:00`),
          new Date(`${oldestOverdue.due}T00:00:00`),
        )
      : 0
  }d`;
}

function FeesPage() {
  const { tab = "billing" } = Route.useSearch();
  const activeTab = tab === "applications" ? "applications" : "billing";
  const navigate = Route.useNavigate();
  return (
    <>
      <PageHeader
        crumbs={["Student Fees", LABEL[activeTab] ?? "Billing"]}
        title={LABEL[activeTab] ?? "Billing"}
      />
      {tab === "applications" ? (
        <div className="mb-4 rounded-xl bg-accent px-3.5 py-2 text-xs text-accent-foreground">
          Application forms submitted by students (simulated)
        </div>
      ) : (
        <SampleNote />
      )}
      <Tabs
        value={activeTab}
        onValueChange={(v) => navigate({ search: { tab: v } })}
        className="mb-4"
      >
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
      </Tabs>
      {activeTab === "applications" && <Applications />}
      {activeTab === "billing" && <Billing />}
    </>
  );
}

function useStudentFilters(studentList?: Student[]) {
  const { students, payments, courseCatalog } = useFinance();
  const sourceStudents = studentList ?? students;
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const courses = courseCatalog.courses.map((item) => item.name);
  const departments = courseCatalog.departments;
  const search = query.trim().toLowerCase();
  const normalizedSearch = normalizeAdmissionNo(query);
  const rows = sourceStudents.filter(
    (student) =>
      (!search ||
        `${student.name} ${student.regNo} ${student.applicationId ?? ""} ${student.phone}`
          .toLowerCase()
          .includes(search) ||
        (!!normalizedSearch &&
          normalizeAdmissionNo(student.regNo).includes(normalizedSearch)) ||
        payments.some(
          (payment) =>
            payment.studentId === student.id && payment.receiptNo.toLowerCase().includes(search),
        )) &&
      (department === "all" || studentDepartment(student, courseCatalog) === department) &&
      (course === "all" || studentCourse(student, courseCatalog)?.name === course) &&
      (status === "all" || billStatus(student, payments) === status),
  );
  const bar = (
    <FilterBar>
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Search student, admission no. or receipt no."
      />
      <FilterSelect
        label="Departments"
        value={department}
        onChange={setDepartment}
        options={departments}
      />
      <FilterSelect label="Courses" value={course} onChange={setCourse} options={courses} />
      <FilterSelect label="Statuses" value={status} onChange={setStatus} options={STATUSES} />
    </FilterBar>
  );
  return { rows, bar };
}

function normalizeContact(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

function workflowPersonForStudent(student: Student, persons: Person[]) {
  return persons.find(
    (person) =>
      person.id === student.id ||
      (!!student.applicationId && person.applicationId === student.applicationId) ||
      (!!person.admissionNo &&
        !!student.regNo &&
        canonicalAdmissionNo(person.admissionNo) === canonicalAdmissionNo(student.regNo)) ||
      normalizeContact(person.contact) === normalizeContact(student.phone),
  );
}

function Applications() {
  const { feeWorkflow, updateFeeWorkflowPerson, sendFeeWorkflowDetailsToAdministration } =
    useFinance();
  const navigate = Route.useNavigate();
  const { open: openRecordPayment } = useRecordPayment();
  const { applicationPersonId, applicationAction } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const [stageFilter, setStageFilter] = useState<ApplicationStage | "All" | null>(null);
  const [stageFilterOpen, setStageFilterOpen] = useState(false);
  const [view, setView] = useState<Person | null>(null);
  const [showSendPreview, setShowSendPreview] = useState(false);
  useEffect(() => {
    const linkedPerson = feeWorkflow.persons.find((person) => person.id === applicationPersonId);
    if (linkedPerson) {
      setView(linkedPerson);
      if (applicationAction === "send") setShowSendPreview(true);
      if (applicationAction) navigate({ search: { tab: "applications" } });
    }
  }, [applicationAction, applicationPersonId, feeWorkflow.persons, navigate]);
  const submitted = feeWorkflow.persons.filter((person) => person.applicationDetails);
  const personPayments = (person: Person) => feeWorkflow.payments.filter((payment) => payment.personId === person.id);
  const statusFor = (person: Person) => applicationStage(person, personPayments(person), feeWorkflow.handoffs);
  const courses = [...new Set(submitted.map((person) => person.course))].sort();
  const search = query.trim().toLowerCase();
  const baseRows = submitted.filter(
    (person) =>
      (!search ||
        `${person.name} ${person.applicationId} ${person.contact}`
          .toLowerCase()
          .includes(search)) &&
      (course === "all" || person.course === course),
  );
  const rows = filterApplicationsByStage(
    baseRows,
    feeWorkflow.payments,
    feeWorkflow.handoffs,
    stageFilter ?? "All",
  ).sort((left, right) => {
    const stagePriority: Record<ApplicationStage, number> = {
      "To review": 1,
      "Awaiting payment": 2,
      "Ready to send": 3,
      "With Administration": 4,
      Admitted: 5,
    };
    return (
      stagePriority[statusFor(left)] - stagePriority[statusFor(right)] ||
      right.appliedOn.localeCompare(left.appliedOn) ||
      right.applicationId.localeCompare(left.applicationId)
    );
  });
  const stageCounts = (stage: ApplicationStage) =>
    filterApplicationsByStage(
      baseRows,
      feeWorkflow.payments,
      feeWorkflow.handoffs,
      stage,
    ).length;
  const actionForStage = (stage: ApplicationStage) =>
    ({
      "To review": "Review",
      "Awaiting payment": "Record payment",
      "Ready to send": "Send to Administration",
      "With Administration": "Waiting for Admission No.",
      Admitted: "Admission No. recorded in Billing",
    })[stage];
  const payments = view
    ? feeWorkflow.payments.filter((payment) => payment.personId === view.id)
    : [];
  const totals = view ? personTotals(view, payments) : undefined;
  const snapshot = view ? buildAdministrationDetailsPayload(view, payments) : undefined;
  const administratorVerifiedAt = view
    ? feeWorkflow.handoffs
        .find((handoff) => handoff.personId === view.id && handoff.target === "Administration")
        ?.history.find((entry) => entry.text === ADMISSION_NO_RECEIVED_TEXT)?.date
    : undefined;
  const accountantVerifiedAt = view?.accountantVerifiedAt;
  const accountantVerified = !!accountantVerifiedAt;
  const alreadySent = !!view && hasAdministrationDetailsEvent(view.id, feeWorkflow.handoffs);
  const overallVerificationStatus = !accountantVerified
    ? "Pending"
    : administratorVerifiedAt
      ? "Verified"
      : alreadySent
        ? "Awaiting Administration"
        : "Pending";
  const admissionFeePaid = !!view && canSendToAdministration(view, payments);
  const canSend = !!view && accountantVerified && admissionFeePaid && !alreadySent;
  const viewStage = view ? statusFor(view) : null;
  const sendDisabledReason = !accountantVerified
    ? "Mark reviewed first"
    : !admissionFeePaid
      ? `${ADMISSION_FEE_LABEL} installment unpaid`
      : undefined;
  const sendDetails = () => {
    if (!view || !canSend) return;
    sendFeeWorkflowDetailsToAdministration(view.id);
    setShowSendPreview(false);
    toast.success(ADMINISTRATION_DETAILS_SENT_TEXT);
  };

  return (
    <>
      <StatGrid className="mb-4">
        {(["To review", "Awaiting payment", "Ready to send", "With Administration"] as const).map((stage) => (
          <button
            key={stage}
            type="button"
            aria-pressed={stageFilter === stage}
            onClick={() => setStageFilter(stageFilter === stage ? null : stage)}
            className={`rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              stageFilter === stage ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
            }`}
          >
            <StatCard label={stage} value={String(stageCounts(stage))} />
          </button>
        ))}
      </StatGrid>
      <SectionCard>
        <FilterBar>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search name, application ID or contact"
          />
          <FilterSelect label="Courses" value={course} onChange={setCourse} options={courses} />
          <DropdownMenu open={stageFilterOpen} onOpenChange={setStageFilterOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Filter applications${stageFilter ? ` by ${stageFilter === "All" ? "All applications" : stageFilter}` : ""}`}
              >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Application stage</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={stageFilter ?? ""}>
                {([
                  ["All", "All applications"],
                  ["To review", "To review"],
                  ["Awaiting payment", "Awaiting payment"],
                  ["Ready to send", "Ready to send"],
                  ["With Administration", "With Administration"],
                  ["Admitted", "Admitted"],
                ] as const).map(([value, label]) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    onSelect={() => {
                      setStageFilter(value);
                      setStageFilterOpen(false);
                    }}
                  >
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState message="No applications found" />
        ) : (
          <div>
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[14%] whitespace-normal">Application ID</TableHead>
                  <TableHead className="w-[13%] whitespace-normal">Applicant</TableHead>
                  <TableHead className="w-[10%] whitespace-normal">Contact</TableHead>
                  <TableHead className="w-[14%] whitespace-normal">Course</TableHead>
                  <TableHead className="w-[10%] whitespace-normal">Applied on</TableHead>
                  <TableHead className="w-[12%] whitespace-normal text-right">Fee payable</TableHead>
                  <TableHead className="w-[13%] whitespace-normal">Stage</TableHead>
                  <TableHead className="w-[14%] whitespace-normal">Next action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((person) => (
                  <TableRow
                    key={person.id}
                    onRowClick={() => setView(person)}
                    rowLabel={`View application for ${person.name}`}
                  >
                    <TableCell className="break-all">{person.applicationId}</TableCell>
                    <TableCell className="break-words">{person.name}</TableCell>
                    <TableCell className="break-all">{person.contact}</TableCell>
                    <TableCell className="break-words">{person.course}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(person.appliedOn)}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right">
                      {formatINR(
                        personTotals(
                          person,
                          feeWorkflow.payments.filter((payment) => payment.personId === person.id),
                        ).payable,
                      )}
                    </TableCell>
                    <TableCell className="break-words">
                      <StatusBadge status={statusFor(person)} />
                    </TableCell>
                    <TableCell className="break-words">{actionForStage(statusFor(person))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <Dialog
        open={!!view}
        onOpenChange={(open) => {
          if (!open) {
            setView(null);
            if (applicationPersonId) navigate({ search: { tab: "applications" } });
          }
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="sticky top-0 z-10 shrink-0 border-b bg-background px-4 py-4 pr-14 text-left sm:px-6">
            <div className="flex items-center gap-3">
              {view?.applicationDetails?.passportPhoto?.previewUrl ? (
                <img className="h-12 w-12 rounded-full object-cover" src={view.applicationDetails.passportPhoto.previewUrl} alt="Applicant photo" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-label="Photo not provided"><UserRound className="h-6 w-6" /></div>
              )}
              <div>
                <DialogTitle>{view?.name}</DialogTitle>
                {!view?.applicationDetails?.passportPhoto && <p className="text-xs text-muted-foreground">Photo not provided</p>}
              </div>
            </div>
            {view && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Application No. {view.applicationId}</span>
                <span>Applied {formatDate(view.appliedOn)}</span>
                <StatusBadge status={statusFor(view)} />
                <StatusBadge
                  status={
                    view.admissionNo ? `Admission No. ${view.admissionNo}` : "Admission No. Pending"
                  }
                />
              </div>
            )}
          </DialogHeader>
          {view && snapshot && (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
              <ApplicationDetails snapshot={snapshot} plan={view.plan} />
              {totals && (
                <section className="space-y-3">
                  <h3 className="font-semibold">Fee summary</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Installment</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {view.plan.map((installment) => (
                        <TableRow key={installment.id}>
                          <TableCell>{displayInstallmentLabel(installment.label)}</TableCell>
                          <TableCell>{formatDate(installment.dueDate)}</TableCell>
                          <TableCell className="num text-right">
                            {formatINR(installment.amountDue)}
                          </TableCell>
                          <TableCell className="num text-right">
                            {formatINR(installmentPaid(installment.id, payments))}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={installmentStatus(installment, payments)} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <ApplicationDetail label="Fee payable" value={formatINR(totals.payable)} />
                    <ApplicationDetail label="Paid so far" value={formatINR(totals.paid)} />
                    <ApplicationDetail label="Outstanding" value={formatINR(totals.outstanding)} />
                  </div>
                </section>
              )}
              <section className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">For office use only</h3>
                  <StatusBadge status={overallVerificationStatus} />
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <ApplicationDetail
                    label="Accountant verification"
                    value={
                      accountantVerifiedAt
                        ? `Verified · ${formatDate(accountantVerifiedAt.slice(0, 10))}`
                        : "Pending"
                    }
                  />
                  <ApplicationDetail
                    label="Administrator verification"
                    value={
                      administratorVerifiedAt
                        ? `Verified · ${formatDate(administratorVerifiedAt.slice(0, 10))}`
                        : "Pending"
                    }
                  />
                </div>
              </section>
              <AdministrationHistory personId={view.id} handoffs={feeWorkflow.handoffs} />
            </div>
          )}
          {view && viewStage && (
            <DialogFooter className="sticky bottom-0 z-10 flex-wrap gap-2 border-t bg-background px-4 py-3 sm:px-6">
              {viewStage === "To review" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const reviewed = {
                      ...view,
                      applicationStatus: "Reviewed" as const,
                      accountantVerifiedAt: new Date().toISOString(),
                    };
                    updateFeeWorkflowPerson(reviewed);
                    setView(reviewed);
                  }}
                >
                  {actionForStage(viewStage)}
                </Button>
              )}
              {viewStage === "Awaiting payment" && (
                <Button variant="outline" onClick={() => openRecordPayment(view.id)}>
                  {actionForStage(viewStage)}
                </Button>
              )}
              {viewStage === "Ready to send" && (
                <Button variant="outline" disabled={!canSend} onClick={() => setShowSendPreview(true)}>
                  {actionForStage(viewStage)}
                </Button>
              )}
              {(viewStage === "With Administration" || viewStage === "Admitted") && (
                <span className="text-sm text-muted-foreground">{actionForStage(viewStage)}</span>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={showSendPreview} onOpenChange={setShowSendPreview}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="border-b px-4 py-4 text-left sm:px-6">
            <DialogTitle>Send application details to Administration (simulated)</DialogTitle>
          </DialogHeader>
          {snapshot && view && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <ApplicationDetails snapshot={snapshot} plan={view.plan} />
            </div>
          )}
          <DialogFooter className="border-t px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => setShowSendPreview(false)}>
              Cancel
            </Button>
            <Button onClick={sendDetails} disabled={!canSend}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Billing() {
  const { admissionPersonId: linkedAdmissionPersonId, billingPersonId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { open: openRecordPayment } = useRecordPayment();
  const {
    students,
    payments,
    courseCatalog,
    feeWorkflow,
    receiveFeeWorkflowAdmissionNo,
    saveFeeWorkflowHandoff,
    sendFeeWorkflowDetailsToAdministration,
  } = useFinance();
  const workflowStudents = useMemo(
    () =>
      feeWorkflow.persons
        .filter((person) => appearsInBilling(person, feeWorkflow.payments))
        .filter(
          (person) => !students.some((student) => !!workflowPersonForStudent(student, [person])),
        )
        .map((person): Student => ({
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
        })),
    [feeWorkflow.persons, feeWorkflow.payments, students],
  );
  const billingStudents = useMemo(
    () => [...students, ...workflowStudents],
    [students, workflowStudents],
  );
  const billingStudentIds = new Set(billingStudents.map((student) => student.id));
  const billingPayments = payments.filter((payment) => billingStudentIds.has(payment.studentId));
  const { rows, bar } = useStudentFilters(billingStudents);
  const [view, setView] = useState<{
    student: Student;
    initialSection?: "installments" | "payments" | "followUp";
    initialAction?: { action: "reminder" | "meeting"; installmentId: string };
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [remindSelected, setRemindSelected] = useState(false);
  const [admissionPersonId, setAdmissionPersonId] = useState<string | null>(null);
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [admissionError, setAdmissionError] = useState("");
  const [notifyPersonId, setNotifyPersonId] = useState<string | null>(null);
  const [sendPersonId, setSendPersonId] = useState<string | null>(null);
  const { todayFilter: requestedTodayFilter, workflowAction, workflowActionInstallmentId } =
    Route.useSearch();
  const [todayFilter, setTodayFilter] = useState<"all" | "dueSoon" | "overdue" | "meeting">(
    requestedTodayFilter ?? "all",
  );
  const [billingSort, setBillingSort] = useState<BillingSort | null>(null);
  useEffect(() => {
    if (linkedAdmissionPersonId) {
      const person = feeWorkflow.persons.find(
        (candidate) => candidate.id === linkedAdmissionPersonId,
      );
      if (person && !person.admissionNo) setAdmissionPersonId(person.id);
    }
    if (billingPersonId) {
      const linkedPerson = feeWorkflow.persons.find((candidate) => candidate.id === billingPersonId);
      const student = billingStudents.find(
        (candidate) =>
          candidate.id === billingPersonId ||
          (!!linkedPerson && workflowPersonForStudent(candidate, [linkedPerson]) !== undefined),
      );
      if (student && view?.student.id !== student.id)
        setView({
          student,
          initialSection: workflowAction ? "installments" : undefined,
          initialAction:
            workflowAction === "reminder" || workflowAction === "meeting"
              ? {
                  action: workflowAction,
                  installmentId: workflowActionInstallmentId ?? "",
                }
              : undefined,
        });
    }
  }, [
    billingPersonId,
    billingStudents,
    feeWorkflow.persons,
    linkedAdmissionPersonId,
    view,
    workflowAction,
    workflowActionInstallmentId,
  ]);
  const personForStudent = (student: Student) =>
    workflowPersonForStudent(student, feeWorkflow.persons);
  const pendingAdministrationHandoff = (personId: string) =>
    feeWorkflow.handoffs.some(
      (handoff) =>
        handoff.personId === personId &&
        handoff.target === "Administration" &&
        handoff.status === "Awaiting Admission No.",
    );
  const selectedNotifyPerson = feeWorkflow.persons.find((person) => person.id === notifyPersonId);
  const selectedSendPerson = feeWorkflow.persons.find((person) => person.id === sendPersonId);
  const sendPayments = selectedSendPerson
    ? feeWorkflow.payments.filter((payment) => payment.personId === selectedSendPerson.id)
    : [];
  const sendSnapshot = selectedSendPerson
    ? buildAdministrationDetailsPayload(selectedSendPerson, sendPayments)
    : undefined;
  const canSendDetails =
    !!selectedSendPerson &&
    !!selectedSendPerson.accountantVerifiedAt &&
    canSendToAdministration(selectedSendPerson, sendPayments) &&
    !hasAdministrationDetailsEvent(selectedSendPerson.id, feeWorkflow.handoffs);
  const notificationPayload = selectedNotifyPerson
    ? buildPaymentNotificationPayload(selectedNotifyPerson, feeWorkflow.payments)
    : null;
  const paymentsForPerson = (person: Person) =>
    feeWorkflow.payments.filter((payment) => payment.personId === person.id);
  const dueSoonCutoff = addDays(new Date(`${TODAY}T00:00:00`), REMINDER_LEAD_DAYS)
    .toISOString()
    .slice(0, 10);
  const actionFor = (person: Person) =>
    nextAction(person, paymentsForPerson(person), feeWorkflow.handoffs);
  const reviewTasks = feeWorkflow.persons.filter(
    (person) => actionFor(person) === "Review Application",
  );
  const isDueSoonPerson = (person: Person) => {
    const personPayments = paymentsForPerson(person);
    return person.plan.some((installment) => {
      const installmentState = installmentStatus(installment, personPayments);
      return (
        installmentState !== "Paid" &&
        installmentState !== "Overdue" &&
        installment.dueDate >= TODAY &&
        installment.dueDate <= dueSoonCutoff
      );
    });
  };
  const isOverduePerson = (person: Person) =>
    !!person.admissionNo &&
    person.plan.some(
      (installment) => installmentStatus(installment, paymentsForPerson(person)) === "Overdue",
    );
  const isMeetingRequiredPerson = (person: Person) => actionFor(person) === "Arrange Meeting";
  const targetInstallment = (person: Person, action: FeeNextAction) => {
    const personPayments = paymentsForPerson(person);
    const matching = person.plan.filter((installment) => {
      const state = installmentStatus(installment, personPayments);
      return (
        (action === "Arrange Meeting" &&
          state === "Overdue" &&
          installment.reminders.length >= MAX_REMINDERS) ||
        (action === "Send Reminder" &&
          installmentOutstanding(installment, personPayments) > 0 &&
          (state === "Overdue" ||
            (state !== "Paid" &&
              installment.dueDate >= TODAY &&
              installment.dueDate <= dueSoonCutoff)))
      );
    });
    return matching.sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  };
  const runNextAction = (person: Person, action: FeeNextAction) => {
    if (action === "Review Application") {
      navigate({
        search: {
          tab: "applications",
          applicationPersonId: person.id,
        },
      });
      return;
    }
    if (action === "Send to Administration") {
      setSendPersonId(person.id);
      return;
    }
    if (action === "Record Payment") {
      openRecordPayment(person.id);
      return;
    }
    if (action === "Enter Admission No.") {
      setAdmissionNumber("");
      setAdmissionError("");
      setAdmissionPersonId(person.id);
      return;
    }
    if (action === "Notify Administration") {
      setNotifyPersonId(person.id);
      return;
    }
    const installment = targetInstallment(person, action);
    if (!installment) return;
    const student = billingStudents.find(
      (candidate) => workflowPersonForStudent(candidate, [person]) !== undefined,
    );
    if (!student) {
      toast.error("This fee plan is not available in Billing.");
      return;
    }
    setView({
      student,
      initialSection: "installments",
      initialAction: {
        action: action === "Send Reminder" ? "reminder" : "meeting",
        installmentId: installment.id,
      },
    });
  };
  const matchesTodayFilter = (student: Student, filter: typeof todayFilter) => {
    if (filter === "all") return true;
    const person = personForStudent(student);
    if (!person) return false;
    if (filter === "dueSoon") return isDueSoonPerson(person);
    if (filter === "overdue") return isOverduePerson(person);
    return isMeetingRequiredPerson(person);
  };
  const todayFilterCounts = {
    dueSoon: rows.filter((student) => matchesTodayFilter(student, "dueSoon")).length,
    overdue: rows.filter((student) => matchesTodayFilter(student, "overdue")).length,
    meeting: rows.filter((student) => matchesTodayFilter(student, "meeting")).length,
  };
  const taskFilteredRows = rows.filter((student) => matchesTodayFilter(student, todayFilter));
  const clearTodayFilter = () => {
    setTodayFilter("all");
    navigate({ search: { tab: "billing" } });
  };
  const toggleTodayFilter = (filter: Exclude<typeof todayFilter, "all">) => {
    const nextFilter = todayFilter === filter ? "all" : filter;
    setTodayFilter(nextFilter);
    navigate({
      search: {
        tab: "billing",
        todayFilter: nextFilter === "all" ? undefined : nextFilter,
      },
    });
  };
  const defaultSort: BillingSort | null =
    todayFilter === "dueSoon" || todayFilter === "overdue"
      ? { field: "nextDue", direction: "asc" }
      : null;
  const activeSort = billingSort ?? defaultSort;
  const sortedTaskFilteredRows = activeSort
    ? [...taskFilteredRows].sort((left, right) => {
        if (activeSort.field === "nextDue") {
          const leftDue = nextDue(left, billingPayments);
          const rightDue = nextDue(right, billingPayments);
          if (!leftDue || !rightDue) return leftDue ? -1 : rightDue ? 1 : 0;
          const comparison = leftDue.localeCompare(rightDue);
          return activeSort.direction === "asc" ? comparison : -comparison;
        }
        const comparison = outstanding(left, billingPayments) - outstanding(right, billingPayments);
        return activeSort.direction === "asc" ? comparison : -comparison;
      })
    : taskFilteredRows;
  const toggleBillingSort = (field: BillingSort["field"]) => {
    const current = billingSort ?? defaultSort;
    setBillingSort({
      field,
      direction: current?.field === field && current.direction === "asc" ? "desc" : "asc",
    });
  };
  const saveAdmissionNumber = () => {
    if (!admissionPersonId) return;
    const result = receiveFeeWorkflowAdmissionNo(admissionPersonId, admissionNumber);
    if (result !== true) {
      setAdmissionError(
        result === "invalid"
          ? "Enter a number in the format ADM-2026-0517."
          : result === "duplicate"
            ? "This Admission No. is already assigned."
            : "This handoff is no longer awaiting an Admission No.",
      );
      return;
    }
    setAdmissionError("");
    setAdmissionNumber("");
    setAdmissionPersonId(null);
    if (linkedAdmissionPersonId) navigate({ search: { tab: "billing" } });
    toast.success(ADMISSION_NO_RECEIVED_TEXT);
  };
  const confirmPaymentNotification = () => {
    if (!selectedNotifyPerson || !notificationPayload?.payments.length) {
      toast.error("There are no unnotified payments to report.");
      setNotifyPersonId(null);
      return;
    }
    const sentAt = new Date().toISOString();
    const existing = feeWorkflow.handoffs.find(
      (handoff) =>
        handoff.personId === selectedNotifyPerson.id && handoff.target === "Administration",
    );
    saveFeeWorkflowHandoff({
      personId: selectedNotifyPerson.id,
      target: "Administration",
      status: existing?.status ?? "Completed",
      history: notificationPayload.payments.map((payment) => ({
        date: sentAt,
        text: ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
        referenceId: payment.id,
        paymentNotification: {
          date: payment.date,
          amount: payment.amount,
          installmentsCovered: payment.installmentsCovered,
          remainingBalance: payment.remainingBalance,
        },
      })),
    });
    setNotifyPersonId(null);
    toast.success("Administration notified (simulated)");
  };
  const selectable = taskFilteredRows.filter(
    (s) => billStatus(s, billingPayments) === "Overdue" || outstanding(s, billingPayments) > 0,
  );
  const allSelected = selectable.length > 0 && selectable.every((s) => selected.includes(s.id));
  const bulkRows = billingStudents
    .filter((s) => selected.includes(s.id))
    .map((student) => reminderDetails(student, billingPayments));
  const billed = sum(billingStudents.map((s) => s.totalFee));
  const paid = sum(billingPayments.map((p) => p.amount));
  return (
    <>
      <StatGrid className="mb-4">
        <StatCard label="Total billed" value={formatINR(billed)} caption="All bills" />
        <StatCard
          label="Recorded payments"
          value={formatINR(paid)}
          tone="success"
          caption="Collected so far"
        />
        <StatCard
          label="Outstanding"
          value={formatINR(
            sum(billingStudents.map((student) => outstanding(student, billingPayments))),
          )}
          tone="danger"
          caption="Billed − recorded payments"
        />
      </StatGrid>
      <h2 className="mb-2 text-sm font-semibold">Today</h2>
      <StatGrid className="mb-3 gap-2">
        <button
          type="button"
          className="w-full min-w-0 text-left"
          onClick={() => {
            const first = reviewTasks[0];
            if (first) runNextAction(first, "Review Application");
            else navigate({ search: { tab: "applications" } });
          }}
        >
          <StatCard
            label="Applications to review"
            value={String(reviewTasks.length)}
            caption="Open Applications"
          />
        </button>
        <button
          type="button"
          aria-pressed={todayFilter === "dueSoon"}
          className={`w-full min-w-0 rounded-2xl text-left ${todayFilter === "dueSoon" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
          onClick={() => toggleTodayFilter("dueSoon")}
        >
          <StatCard
            label="Payments due soon"
            value={String(todayFilterCounts.dueSoon)}
            caption="Filter Billing table"
          />
        </button>
        <button
          type="button"
          aria-pressed={todayFilter === "overdue"}
          className={`w-full min-w-0 rounded-2xl text-left ${todayFilter === "overdue" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
          onClick={() => toggleTodayFilter("overdue")}
        >
          <StatCard
            label="Overdue fees"
            value={String(todayFilterCounts.overdue)}
            tone={todayFilterCounts.overdue ? "danger" : undefined}
            caption="Filter Billing table"
          />
        </button>
        <button
          type="button"
          aria-pressed={todayFilter === "meeting"}
          className={`w-full min-w-0 rounded-2xl text-left ${todayFilter === "meeting" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
          onClick={() => toggleTodayFilter("meeting")}
        >
          <StatCard
            label="Meetings required"
            value={String(todayFilterCounts.meeting)}
            caption="Filter Billing table"
          />
        </button>
      </StatGrid>
      <SectionCard
        action={
          <div className="flex gap-2">
            {selected.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setRemindSelected(true)}>
                <Bell className="mr-1 h-4 w-4" />
                Send reminders ({selected.length})
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setCreating(true)}
            >
              <Plus className="mr-1 h-4 w-4" />
              Create bill
            </Button>
          </div>
        }
      >
        {bar}
        {todayFilter !== "all" && (
          <div className="mb-3">
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Clear ${todayFilter === "overdue" ? "Overdue" : todayFilter === "dueSoon" ? "Payments due soon" : "Meetings required"} filter`}
              onClick={clearTodayFilter}
            >
              {todayFilter === "overdue"
                ? `Overdue ${taskFilteredRows.length}`
                : todayFilter === "dueSoon"
                  ? `Payments due soon ${taskFilteredRows.length}`
                  : `Meetings required ${taskFilteredRows.length}`}
              <span aria-hidden="true">×</span>
            </Button>
          </div>
        )}
        {taskFilteredRows.length === 0 ? (
          <EmptyState />
        ) : (
          <Table className="min-w-[1120px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 min-w-10">
                  <Checkbox
                    aria-label="Select all eligible visible students"
                    checked={
                      allSelected
                        ? true
                        : selectable.some((s) => selected.includes(s.id))
                          ? "indeterminate"
                          : false
                    }
                    disabled={selectable.length === 0}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...new Set([...current, ...selectable.map((s) => s.id)])]
                          : current.filter((id) => !selectable.some((s) => s.id === id)),
                      )
                    }
                  />
                </TableHead>
                <TableHead className="sticky left-10 z-20 min-w-[190px] bg-background">
                  Student
                </TableHead>
                <TableHead className="w-48 min-w-40 max-w-48">Course</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead
                  className="text-right"
                  aria-sort={
                    activeSort?.field === "outstanding"
                      ? activeSort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center justify-end gap-1 whitespace-nowrap"
                    onClick={() => toggleBillingSort("outstanding")}
                  >
                    Outstanding
                    {activeSort?.field === "outstanding" ? (
                      activeSort.direction === "asc" ? (
                        <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TableHead>
                <TableHead
                  aria-sort={
                    activeSort?.field === "nextDue"
                      ? activeSort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    onClick={() => toggleBillingSort("nextDue")}
                  >
                    Next due
                    {activeSort?.field === "nextDue" ? (
                      activeSort.direction === "asc" ? (
                        <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTaskFilteredRows.map((s) => {
                const nd = nextDue(s, billingPayments);
                const person = personForStudent(s);
                const personPayments = person
                  ? feeWorkflow.payments.filter((payment) => payment.personId === person.id)
                  : [];
                const awaitingAdmissionNo =
                  !!person && !person.admissionNo && pendingAdministrationHandoff(person.id);
                const hasUnnotifiedPayment =
                  !!person?.admissionNo && personPayments.some((payment) => !payment.adminNotified);
                const administrationDetailsSentAt = person
                  ? feeWorkflow.handoffs
                      .find(
                        (handoff) =>
                          handoff.personId === person.id && handoff.target === "Administration",
                      )
                      ?.history.find((entry) => entry.text === ADMINISTRATION_DETAILS_SENT_TEXT)
                      ?.date
                  : undefined;
                const action = person
                  ? nextAction(person, personPayments, feeWorkflow.handoffs)
                  : null;
                const status = billingStatusLabel(s, billingPayments, person, personPayments);
                const canRecordAdmissionNo =
                  awaitingAdmissionNo || (!!person && action === "Enter Admission No.");
                const hasReceipts = billingPayments.some((payment) => payment.studentId === s.id);
                return (
                  <TableRow
                    key={s.id}
                    className="group h-[68px]"
                    onRowClick={() => setView({ student: s })}
                    rowLabel={`View bill for ${s.name}`}
                  >
                    <TableCell>
                      {selectable.some((item) => item.id === s.id) && (
                        <Checkbox
                          aria-label={`Select ${s.name} for reminder`}
                          checked={selected.includes(s.id)}
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={(checked) =>
                            setSelected((current) =>
                              checked
                                ? [...new Set([...current, s.id])]
                                : current.filter((id) => id !== s.id),
                            )
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell className="sticky left-10 z-10 min-w-[190px] bg-background group-hover:bg-muted/50">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {s.regNo || s.applicationId || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="w-48 min-w-40 max-w-48">
                      <div className="line-clamp-2">
                        {studentCourse(s, courseCatalog)?.name ?? s.course}
                      </div>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right tabular-nums">
                      {formatINR(s.totalFee)}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right tabular-nums">
                      {formatINR(studentPaid(s.id, billingPayments))}
                    </TableCell>
                    <TableCell
                      className={`num whitespace-nowrap text-right font-medium tabular-nums ${outstanding(s, billingPayments) > 0 ? "text-destructive" : ""}`}
                    >
                      {formatINR(outstanding(s, billingPayments))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{nd ? formatDate(nd) : "—"}</TableCell>
                    <TableCell>
                      {status.startsWith("Overdue ") ? (
                        <span className="inline-flex whitespace-nowrap rounded-full border border-destructive/30 bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-destructive">
                          {status}
                        </span>
                      ) : (
                        <StatusBadge status={status} />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        {administrationDetailsSentAt ? (
                          <span className="text-xs text-muted-foreground">
                            Sent on {formatReminderDateTime(administrationDetailsSentAt)}
                          </span>
                        ) : person && action && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              runNextAction(person, action);
                            }}
                          >
                            {action}
                          </Button>
                        )}
                        {(hasReceipts || canRecordAdmissionNo || hasUnnotifiedPayment) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`More actions for ${s.name}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {hasReceipts && (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setView({ student: s, initialSection: "payments" })
                                  }
                                >
                                  Receipts
                                </DropdownMenuItem>
                              )}
                              {canRecordAdmissionNo && person && (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setAdmissionPersonId(person.id);
                                    setAdmissionNumber("");
                                    setAdmissionError("");
                                  }}
                                >
                                  Record Admission No.
                                </DropdownMenuItem>
                              )}
                              {hasUnnotifiedPayment && person && (
                                <DropdownMenuItem onSelect={() => setNotifyPersonId(person.id)}>
                                  Notify Administration
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <Dialog
        open={!!view}
        onOpenChange={(open) => {
          if (!open) {
            setView(null);
            if (billingPersonId) navigate({ search: { tab: "billing" } });
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[900px] flex-col gap-0 overflow-hidden p-0">
          {view && (
            <BillDetails
              student={view.student}
              initialSection={view.initialSection}
              initialAction={view.initialAction}
              onNotifyAdministration={setNotifyPersonId}
              onClose={() => setView(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <ReminderPrompt
        open={remindSelected}
        onOpenChange={setRemindSelected}
        rows={bulkRows}
        bulk
        onDone={(logged, skipped) => {
          setSelected([]);
          toast.success(`${logged} reminders logged, ${skipped} skipped`);
        }}
      />
      <Dialog
        open={!!admissionPersonId}
        onOpenChange={(open) => {
          if (!open) {
            setAdmissionPersonId(null);
            setAdmissionError("");
            if (linkedAdmissionPersonId) navigate({ search: { tab: "billing" } });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admission No. received from Administration</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Record the number provided by Administration. No number is generated here.
            </p>
            <Field label="Admission No." htmlFor="billing-admission-no" error={admissionError}>
              <Input
                id="billing-admission-no"
                value={admissionNumber}
                onChange={(event) => {
                  setAdmissionNumber(event.target.value);
                  setAdmissionError("");
                }}
                placeholder="ADM-2026-0517"
                maxLength={13}
                aria-invalid={!!admissionError}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAdmissionPersonId(null);
                if (linkedAdmissionPersonId) navigate({ search: { tab: "billing" } });
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveAdmissionNumber}>Save Admission No.</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PaymentNotificationDialog
        open={!!notifyPersonId}
        payload={notificationPayload}
        onOpenChange={(open) => !open && setNotifyPersonId(null)}
        onConfirm={confirmPaymentNotification}
      />
      <Dialog open={!!sendPersonId} onOpenChange={(open) => !open && setSendPersonId(null)}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="border-b px-4 py-4 text-left sm:px-6">
            <DialogTitle>Send application details to Administration (simulated)</DialogTitle>
          </DialogHeader>
          {sendSnapshot && selectedSendPerson && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <ApplicationDetails snapshot={sendSnapshot} plan={selectedSendPerson.plan} />
            </div>
          )}
          <DialogFooter className="border-t px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => setSendPersonId(null)}>
              Cancel
            </Button>
            <Button
              disabled={!canSendDetails}
              onClick={() => {
                if (!selectedSendPerson || !canSendDetails) return;
                sendFeeWorkflowDetailsToAdministration(selectedSendPerson.id);
                setSendPersonId(null);
                toast.success(ADMINISTRATION_DETAILS_SENT_TEXT);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {creating && (
        <CreateBill
          initialStudent={selected.length === 1 ? billingStudents.find((student) => student.id === selected[0]) : undefined}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

export function BillDetails({
  student,
  initialSection = "installments",
  initialAction,
  onNotifyAdministration,
  onClose,
}: {
  student: Student;
  initialSection?: "installments" | "payments" | "followUp";
  initialAction?: { action: "reminder" | "meeting"; installmentId: string };
  onNotifyAdministration: (personId: string) => void;
  onClose: () => void;
}) {
  const {
    payments,
    reminders,
    feeWorkflow,
    settings,
    logInstallmentReminder,
    addInstallmentMeetingNote,
  } = useFinance();
  const { open: openRecordPayment } = useRecordPayment();
  const [section, setSection] = useState(initialSection);
  const [remind, setRemind] = useState(false);
  const [reminderRow, setReminderRow] = useState<{
    installmentId: string;
    requestId: string;
  } | null>(null);
  const [reminderMessageDraft, setReminderMessageDraft] = useState("");
  const [reminderMessageError, setReminderMessageError] = useState("");
  const [meetingInstallmentId, setMeetingInstallmentId] = useState<string | null>(null);
  const [meetingNote, setMeetingNote] = useState("");
  const [receipt, setReceipt] = useState<FeePayment | null>(null);
  const [workflowReceipt, setWorkflowReceipt] = useState<FeeWorkflowPayment | null>(null);
  const [emailPreviewReceiptId, setEmailPreviewReceiptId] = useState<string | null>(null);
  const confirmedReminderIds = useRef(new Set<string>());
  const handledInitialAction = useRef<string | null>(null);
  const onMeetingEnterKeyDown = useEnterToNext();
  const paid = studentPaid(student.id, payments);
  const mine = payments.filter((p) => p.studentId === student.id);
  const workflowPerson = workflowPersonForStudent(student, feeWorkflow.persons);
  const workflowPayments = useMemo(
    () =>
      feeWorkflow.payments
        .filter((payment) => payment.personId === workflowPerson?.id)
        .sort((left, right) => right.date.localeCompare(left.date)),
    [feeWorkflow.payments, workflowPerson?.id],
  );
  const selectedWorkflowReceipt = workflowReceipt
    ? (feeWorkflow.payments.find((payment) => payment.id === workflowReceipt.id) ?? workflowReceipt)
    : null;
  const workflowPaymentKeys = new Set(workflowPayments.map((payment) => payment.id));
  const legacyPayments = mine.filter((payment) => !workflowPaymentKeys.has(payment.id));
  const due = outstanding(student, payments);
  const canRemind = due > 0;
  const history = reminders
    .filter((r) => r.studentId === student.id)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const workflowTotals = workflowPerson ? personTotals(workflowPerson, workflowPayments) : null;
  const statusLabel = billingStatusLabel(student, payments, workflowPerson, workflowPayments);
  const meetingInstallment = workflowPerson?.plan.find(
    (installment) => installment.id === meetingInstallmentId,
  );
  const reminderInstallment = workflowPerson?.plan.find(
    (installment) => installment.id === reminderRow?.installmentId,
  );
  const reminderAmount = reminderInstallment
    ? installmentOutstanding(reminderInstallment, workflowPayments)
    : 0;
  const reminderEmail =
    workflowPerson && reminderInstallment
      ? buildPaymentReminderEmail(
          {
            name: workflowPerson.name,
            email: workflowPerson.email,
            course: workflowPerson.course,
          },
          reminderInstallment.label,
          reminderAmount,
          reminderInstallment.dueDate,
          settings.institution.name,
        )
      : null;
  useEffect(() => {
    if (!reminderRow) return;
    setReminderMessageDraft(reminderEmail?.body ?? "");
    setReminderMessageError("");
  }, [reminderRow?.requestId, reminderEmail?.body]);
  const defaultReminderInstallment = workflowPerson?.plan
    .filter(
      (installment) =>
        installmentOutstanding(installment, workflowPayments) > 0 &&
        installment.reminders.length < MAX_REMINDERS &&
        (installmentStatus(installment, workflowPayments) === "Overdue" ||
          installmentFollowUpStatus(installment, workflowPayments) === "Reminder Due"),
    )
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  const notificationPayload = workflowPerson
    ? buildPaymentNotificationPayload(workflowPerson, feeWorkflow.payments)
    : null;
  const hasUnnotifiedPayments = !!notificationPayload?.payments.length;
  const classAccessStatus = workflowPerson
    ? classAccess(workflowPerson, workflowPayments) ?? "Payment Cleared"
    : "Payment Cleared";
  const planRows = workflowPerson
    ? workflowPerson.plan.map((installment) => {
        const rowPaid = installmentPaid(installment.id, workflowPayments);
        const rowOutstanding = installmentOutstanding(installment, workflowPayments);
        const rawStatus = installmentStatus(installment, workflowPayments);
        const showOverdue = !!workflowPerson.admissionNo && rawStatus === "Overdue";
        return {
          id: installment.id,
          label: installment.label,
          dueDate: installment.dueDate,
          amount: installment.amountDue,
          paid: rowPaid,
          outstanding: rowOutstanding,
          status:
            rawStatus === "Overdue" && !workflowPerson.admissionNo
              ? rowPaid > 0
                ? "Partially Paid"
                : "Pending"
              : showOverdue
                ? `Overdue ${installmentDaysOverdue(installment)}d`
                : rawStatus,
          daysOverdue: showOverdue ? installmentDaysOverdue(installment) : 0,
          followUp: installmentFollowUpStatus(installment, workflowPayments),
          canRemind:
            rowOutstanding > 0 &&
            installment.reminders.length < MAX_REMINDERS &&
            (rawStatus === "Overdue" ||
              installmentFollowUpStatus(installment, workflowPayments) === "Reminder Due"),
          meetingNotes: installment.meetingNotes,
          isWorkflowInstallment: true,
        };
      })
    : installmentSchedule(student, paid, TODAY, payments).map((installment, index) => ({
        id: `${student.id}-I${index + 1}`,
        label: installment.label,
        dueDate: installment.due,
        amount: installment.amount,
        paid: installment.paid,
        outstanding: installment.balance,
        status:
          installment.status === "Overdue" && !student.regNo
            ? installment.paid > 0
              ? "Partially Paid"
              : "Pending"
            : installment.status,
        daysOverdue:
          installment.status === "Overdue" && student.regNo
            ? differenceInCalendarDays(
                new Date(`${TODAY}T00:00:00`),
                new Date(`${installment.due}T00:00:00`),
              )
            : 0,
        followUp: null,
        canRemind: false,
        meetingNotes: [],
        isWorkflowInstallment: false,
      }));
  useEffect(() => {
    setSection(initialSection);
  }, [initialSection, student.id]);
  useEffect(() => {
    if (!initialAction) return;
    const actionKey = `${student.id}:${initialAction.action}:${initialAction.installmentId}`;
    if (handledInitialAction.current === actionKey) return;
    handledInitialAction.current = actionKey;
    setSection("installments");
    if (initialAction.action === "reminder") {
      const target =
        workflowPerson?.plan.find((item) => item.id === initialAction.installmentId) ??
        defaultReminderInstallment;
      if (target) {
        setReminderRow({
          installmentId: target.id,
          requestId: `REM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        });
      }
    } else {
      const target =
        workflowPerson?.plan.find((item) => item.id === initialAction.installmentId) ??
        workflowPerson?.plan.find(
          (item) =>
            installmentFollowUpStatus(item, workflowPayments) ===
            "In-Person Follow-Up Required",
        );
      if (target) setMeetingInstallmentId(target.id);
    }
  }, [
    defaultReminderInstallment,
    initialAction?.action,
    initialAction?.installmentId,
    student.id,
    workflowPerson,
    workflowPayments,
  ]);
  const requestReminder = (installmentId: string) => {
    setReminderRow({
      installmentId,
      requestId: `REM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  };
  const confirmReminder = () => {
    if (!reminderMessageDraft.trim()) {
      setReminderMessageError("Message is required.");
      return;
    }
    if (
      !workflowPerson ||
      !reminderRow ||
      !reminderInstallment ||
      reminderAmount <= 0 ||
      confirmedReminderIds.current.has(reminderRow.requestId)
    )
      return;
    if (
      reminderInstallment.reminders.some((reminder) => reminder.id === reminderRow.requestId) ||
      reminderInstallment.reminders.length >= MAX_REMINDERS
    ) {
      toast.error("This reminder has already been recorded or the reminder limit was reached.");
      setReminderRow(null);
      return;
    }
    confirmedReminderIds.current.add(reminderRow.requestId);
    logInstallmentReminder(workflowPerson.id, reminderInstallment.id, {
      id: reminderRow.requestId,
      date: new Date().toISOString(),
      text: `Queued for LMS\n${reminderMessageDraft}`,
    });
    setReminderRow(null);
    toast.success("Queued for LMS");
  };
  const saveMeetingNote = () => {
    if (!workflowPerson || !meetingInstallment || !meetingNote.trim()) return;
    addInstallmentMeetingNote(
      workflowPerson.id,
      meetingInstallment.id,
      `${new Date().toISOString()} — ${meetingNote.trim()}`,
    );
    setMeetingNote("");
    setMeetingInstallmentId(null);
    toast.success("Demo meeting follow-up note saved.");
  };
  const showNotification = () => {
    if (workflowPerson && classAccessStatus === "Payment Cleared" && hasUnnotifiedPayments)
      onNotifyAdministration(workflowPerson.id);
  };
  const handleInstallmentAction = (row: (typeof planRows)[number]) => {
    if (!workflowPerson || !row.isWorkflowInstallment) return;
    if (row.followUp === "In-Person Follow-Up Required") {
      setMeetingNote("");
      setMeetingInstallmentId(row.id);
    } else if (row.canRemind) {
      requestReminder(row.id);
    } else if (row.outstanding > 0) {
      openRecordPayment(workflowPerson.id);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-sm">
      <DialogHeader className="shrink-0 border-b px-4 py-4 pr-14 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate">{student.name}</DialogTitle>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              <span className="font-medium">
                {workflowPerson?.admissionNo || student.regNo
                  ? ADMISSION_NO_FULL
                  : "Application ID"}
                :
              </span>{" "}
              {workflowPerson?.admissionNo || student.regNo || student.applicationId || "—"}
            </p>
            <div className="mt-2">
              {statusLabel.startsWith("Overdue ") ? (
                <span className="inline-flex whitespace-nowrap rounded-full border border-destructive/30 bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-destructive">
                  {statusLabel}
                </span>
              ) : (
                <StatusBadge status={statusLabel} />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={due <= 0 || !workflowPerson} onClick={() => workflowPerson && openRecordPayment(workflowPerson.id)}>
              Collect payment
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                !canRemind ||
                (!!workflowPerson && !defaultReminderInstallment) ||
                !student.phone.trim()
              }
              onClick={() => {
                if (defaultReminderInstallment) requestReminder(defaultReminderInstallment.id);
                else setRemind(true);
              }}
            >
              Send reminder
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-muted/50 px-3 py-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Billed</p>
            <p className="num whitespace-nowrap font-semibold">{formatINR(student.totalFee)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Recorded</p>
            <p className="num whitespace-nowrap font-semibold">{formatINR(workflowTotals?.paid ?? paid)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Remaining</p>
            <p className={`num whitespace-nowrap font-semibold ${due > 0 ? "text-destructive" : ""}`}>
              {formatINR(workflowTotals?.outstanding ?? due)}
            </p>
          </div>
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-4">
          <ToggleGroup
            type="single"
            value={section}
            onValueChange={(value) => {
              if (value === "installments" || value === "payments" || value === "followUp")
                setSection(value);
            }}
            aria-label="Bill details sections"
            className="grid w-full grid-cols-3"
          >
            <ToggleGroupItem value="installments" className="w-full">Installments</ToggleGroupItem>
            <ToggleGroupItem value="payments" className="w-full">Payments</ToggleGroupItem>
            <ToggleGroupItem value="followUp" className="w-full">Follow-up</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {section === "installments" && (
          <div className="space-y-3">
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Installment</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Days overdue</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planRows.map((row) => {
                    const actionLabel =
                      row.followUp === "In-Person Follow-Up Required"
                        ? "Add meeting note"
                        : row.canRemind
                          ? "Send reminder"
                          : row.outstanding > 0 && workflowPerson
                            ? "Record payment"
                            : null;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{displayInstallmentLabel(row.label)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(row.dueDate)}</TableCell>
                        <TableCell className="num whitespace-nowrap text-right">{formatINR(row.amount)}</TableCell>
                        <TableCell className="num whitespace-nowrap text-right">{formatINR(row.paid)}</TableCell>
                        <TableCell>
                          {row.status.startsWith("Overdue ") ? (
                            <span className="inline-flex whitespace-nowrap rounded-full border border-destructive/30 bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-destructive">
                              {row.status}
                            </span>
                          ) : (
                            <StatusBadge status={row.status} />
                          )}
                        </TableCell>
                        <TableCell className="num whitespace-nowrap text-right">
                          {row.daysOverdue || "—"}
                        </TableCell>
                        <TableCell>
                          {actionLabel && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleInstallmentAction(row)}
                            >
                              {actionLabel}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {canRemind && !student.phone.trim() && (
              <p className="text-xs text-muted-foreground">A phone number is needed to send a reminder.</p>
            )}
          </div>
        )}
        {section === "payments" && (
          <div className="space-y-3">
            <h3 className="font-semibold">Recorded payments</h3>
        {mine.length === 0 ? (
          <EmptyState message="No payments recorded yet." />
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt no.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Installment(s)</TableHead>
                  <TableHead>Confirmation</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflowPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap">
                      <div>{payment.receiptNo}</div>
                      {payment.reference && (
                        <div className="text-xs text-muted-foreground">
                          Transaction reference: {payment.reference}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(payment.date)}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">
                      {formatINR(payment.amount)}
                    </TableCell>
                    <TableCell>
                      {payment.allocations
                        .map((allocation) => {
                          const installment = feeWorkflow.persons
                            .find((person) => person.id === payment.personId)
                            ?.plan.find((item) => item.id === allocation.installmentId);
                          return `${displayInstallmentLabel(installment?.label ?? "Installment")} ${formatINR(allocation.amount)}`;
                        })
                        .join(" · ")}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={payment.confirmation.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-max gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEmailPreviewReceiptId(null);
                            setWorkflowReceipt(payment);
                          }}
                        >
                          View receipt
                        </Button>
                        {payment.confirmation.status === "Not sent" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEmailPreviewReceiptId(payment.id);
                              setWorkflowReceipt(payment);
                            }}
                          >
                            Send confirmation
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {legacyPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap">
                      <div>{payment.receiptNo}</div>
                      {payment.reference && (
                        <div className="text-xs text-muted-foreground">
                          Transaction reference: {payment.reference}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(payment.date)}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">
                      {formatINR(payment.amount)}
                    </TableCell>
                    <TableCell>{payment.towards ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status="Not sent" />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setReceipt(payment)}>
                        View receipt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
          </div>
        )}
        {section === "followUp" && (
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="font-semibold">Reminder history</h3>
              {workflowPerson && workflowPerson.plan.some((item) => item.reminders.length > 0) ? (
                <ul className="space-y-2">
                  {workflowPerson.plan.flatMap((installment) =>
                    installment.reminders.map((item, index) => (
                      <li
                        key={item.id ?? `${installment.id}-${item.date}-${index}`}
                        className="flex flex-wrap justify-between gap-2 rounded-md border p-2 text-xs"
                      >
                        <span>
                        {formatReminderDateTime(item.date)} · {displayInstallmentLabel(installment.label)} · {item.text}
                        </span>
                        <span>{workflowPerson.email || "No email recorded"}</span>
                      </li>
                    )),
                  )}
                </ul>
              ) : history.length > 0 ? (
                <ul className="space-y-2">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap justify-between gap-x-4 rounded-md border p-2 text-xs"
                    >
                      <span>{formatReminderDateTime(item.sentAt)} · {item.email || item.phone}</span>
                      <span className="num">{formatINR(item.amountDue)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message="No reminders logged yet." />
              )}
            </section>
            <section className="space-y-2 rounded-lg border p-3">
              <h3 className="font-semibold">Class Access</h3>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={classAccessStatus} />
                {classAccessStatus === "On Hold" && (
                  <span className="text-xs text-muted-foreground">
                    Simulated; LMS enforcement needs a future integration.
                  </span>
                )}
                {classAccessStatus === "Payment Cleared" && (
                  <span className="text-xs text-muted-foreground">
                    Simulated; LMS enforcement needs a future integration.
                  </span>
                )}
              </div>
            </section>
            {workflowPerson?.plan.some(
              (installment) =>
                installmentFollowUpStatus(installment, workflowPayments) ===
                "In-Person Follow-Up Required",
            ) && (
              <section className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">In-Person Accounts Meeting Required</h3>
                    <p className="text-xs text-muted-foreground">
                      Simulated follow-up; no meeting is scheduled externally.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const target = workflowPerson.plan.find(
                        (installment) =>
                          installmentFollowUpStatus(installment, workflowPayments) ===
                          "In-Person Follow-Up Required",
                      );
                      if (target) {
                        setMeetingNote("");
                        setMeetingInstallmentId(target.id);
                      }
                    }}
                  >
                    Add meeting note
                  </Button>
                </div>
              </section>
            )}
            {workflowPerson?.plan.some((installment) => installment.meetingNotes.length > 0) && (
              <section className="space-y-2">
                <h3 className="font-semibold">Meeting notes</h3>
                <ul className="space-y-2">
                  {workflowPerson.plan.flatMap((installment) =>
                    installment.meetingNotes.map((note, index) => (
                      <li
                        key={`${installment.id}-${index}`}
                        className="rounded-md border p-2 text-xs"
                      >
                        <span className="font-medium">{displayInstallmentLabel(installment.label)}: </span>
                        {note}
                      </li>
                    )),
                  )}
                </ul>
              </section>
            )}
            {workflowPerson &&
              classAccessStatus === "Payment Cleared" &&
              hasUnnotifiedPayments && (
                <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <h3 className="font-semibold">Notify Administration</h3>
                    <p className="text-xs text-muted-foreground">
                      Payment cleared; notification is simulated.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={showNotification}>
                    Notify Administration
                  </Button>
                </section>
              )}
            {workflowPerson && (
              <AdministrationHistory personId={workflowPerson.id} handoffs={feeWorkflow.handoffs} />
            )}
          </div>
        )}
      </div>
      <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
        <Button variant="outline" onClick={onClose}>Close</Button>
      </DialogFooter>
      <ReminderPrompt
        open={remind}
        onOpenChange={setRemind}
        rows={[reminderDetails(student, payments)]}
        onDone={() => toast.success("Reminder was logged. Nothing was sent.")}
      />
      <Dialog open={!!reminderRow} onOpenChange={(open) => !open && setReminderRow(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send fee reminder through LMS (simulated)</DialogTitle>
          </DialogHeader>
          {workflowPerson && reminderInstallment && reminderEmail && (
            <div className="space-y-3 text-sm">
              <p className="rounded-md bg-accent p-3 text-accent-foreground">
                Simulated, no message sent
              </p>
              <p><strong>Channel:</strong> LMS</p>
              <p><strong>To:</strong> student LMS account ({workflowPerson.admissionNo || student.regNo})</p>
              <p><strong>Name:</strong> {workflowPerson.name}</p>
              <p><strong>Course:</strong> {workflowPerson.course}</p>
              <p><strong>Installment:</strong> {displayInstallmentLabel(reminderInstallment.label)}</p>
              <p><strong>Outstanding:</strong> {formatINR(reminderAmount)}</p>
              <p><strong>Due date:</strong> {formatDate(reminderInstallment.dueDate)}</p>
              <p className="text-xs text-muted-foreground">Prototype: the LMS is not connected, so messages are only recorded.</p>
              <div className="space-y-1">
                <Label htmlFor="reminder-message">Message</Label>
                <Textarea
                  id="reminder-message"
                  value={reminderMessageDraft}
                  onChange={(event) => {
                    setReminderMessageDraft(event.target.value);
                    if (event.target.value.trim()) setReminderMessageError("");
                    else setReminderMessageError("Message is required.");
                  }}
                  aria-invalid={!!reminderMessageError}
                />
                {reminderMessageError && (
                  <p className="text-xs text-destructive" role="alert">
                    {reminderMessageError}
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderRow(null)}>Cancel</Button>
            <Button
              onClick={confirmReminder}
              disabled={!reminderInstallment || reminderAmount <= 0 || !reminderMessageDraft.trim()}
            >
              Confirm simulated reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!meetingInstallmentId}
        onOpenChange={(open) => !open && setMeetingInstallmentId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>In-Person Accounts Meeting Required</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMeetingNote();
            }}
            onKeyDown={onMeetingEnterKeyDown}
          >
            {workflowPerson && meetingInstallment && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Demo follow-up for {workflowPerson.name} · {displayInstallmentLabel(meetingInstallment.label)}. No meeting
                  is scheduled externally.
                </p>
                <Field label="Demo follow-up note" htmlFor="bill-meeting-note">
                  <Input
                    id="bill-meeting-note"
                    value={meetingNote}
                    onChange={(event) => setMeetingNote(event.target.value)}
                    placeholder="Add a note for Accounts"
                  />
                </Field>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMeetingInstallmentId(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!meetingNote.trim()}>Save demo note</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="z-[60] flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[900px] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b p-6 pr-14">
            <DialogTitle>Receipt {receipt?.receiptNo}</DialogTitle>
          </DialogHeader>
          {receipt && <Receipt payment={receipt} onClose={() => setReceipt(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selectedWorkflowReceipt}
        onOpenChange={(open) => {
          if (!open) {
            setWorkflowReceipt(null);
            setEmailPreviewReceiptId(null);
          }
        }}
      >
        <DialogContent className="z-[60] flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[900px] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b p-6 pr-14">
            <DialogTitle>Receipt {selectedWorkflowReceipt?.receiptNo}</DialogTitle>
          </DialogHeader>
          {selectedWorkflowReceipt && (
            <Receipt
              workflowPayment={selectedWorkflowReceipt}
              startEmailPreview={emailPreviewReceiptId === selectedWorkflowReceipt.id}
              onClose={() => {
                setWorkflowReceipt(null);
                setEmailPreviewReceiptId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentsTable({
  rows,
  onView,
  showTowards = false,
}: {
  rows: FeePayment[];
  onView?: (p: FeePayment) => void;
  showTowards?: boolean;
}) {
  const { students } = useFinance();
  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Receipt</TableHead>
            <TableHead>Date</TableHead>
            {onView && <TableHead>Student</TableHead>}
            {showTowards && <TableHead>Towards</TableHead>}
            <TableHead>Method</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            {onView && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow
              key={p.id}
              onRowClick={onView ? () => onView(p) : undefined}
              rowLabel={onView ? `View receipt ${p.receiptNo}` : undefined}
            >
              <TableCell className="num whitespace-nowrap text-xs tabular-nums">
                {p.receiptNo}
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(p.date)}</TableCell>
              {onView && <TableCell>{students.find((s) => s.id === p.studentId)?.name}</TableCell>}
              {showTowards && (
                <TableCell>
                  {p.towards
                    ? p.towards === "Other"
                      ? `Other – ${p.towardsOther ?? ""}`
                      : p.towards
                    : "—"}
                </TableCell>
              )}
              <TableCell>{p.method}</TableCell>
              <TableCell className="num text-xs">{p.reference || "—"}</TableCell>
              <TableCell className="num whitespace-nowrap text-right">
                {formatINR(p.amount)}
              </TableCell>
              {onView && (
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => onView(p)}>
                    <Eye className="mr-1 h-4 w-4" />
                    View receipt
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type ReminderRow = { student: Student; installment: string; amountDue: number; dueDate: string };

function reminderDetails(student: Student, payments: FeePayment[]): ReminderRow {
  const schedule = installmentSchedule(student, studentPaid(student.id, payments), TODAY, payments);
  const due =
    schedule.find((item) => item.status === "Overdue") ??
    schedule.find((item) => item.status !== "Paid");
  return {
    student,
    installment: due?.label ?? "Fee balance",
    amountDue: due?.balance ?? outstanding(student, payments),
    dueDate: due?.due ?? nextDue(student, payments) ?? TODAY,
  };
}

function reminderMessage(institution: string, row: ReminderRow) {
  return buildPaymentReminderEmail(
    row.student,
    row.installment,
    row.amountDue,
    row.dueDate,
    institution,
  ).body;
}

function formatReminderDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReminderPrompt({
  open,
  onOpenChange,
  rows,
  bulk = false,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ReminderRow[];
  bulk?: boolean;
  onDone: (logged: number, skipped: number) => void;
}) {
  const { reminders, settings, logReminder } = useFinance();
  const datedToday = (value: string) =>
    new Date(value).toDateString() === new Date().toDateString();
  const ready = rows.filter((row) => row.student.email?.trim());
  const repeated = ready.filter((r) =>
    reminders.some((item) => item.studentId === r.student.id && datedToday(item.sentAt)),
  );
  const repeatedIds = new Set(repeated.map((row) => row.student.id));
  const sendRows = ready.filter((row) => !repeatedIds.has(row.student.id));
  const skipped = rows.length - sendRows.length;
  const preview = rows[0];
  const confirmLog = () => {
    const sentAt = new Date().toISOString();
    sendRows.forEach((row) =>
      logReminder({
        sentAt,
        studentId: row.student.id,
        phone: row.student.phone,
        email: row.student.email ?? "",
        amountDue: row.amountDue,
        message: reminderMessage(settings.institution.name, row),
      }),
    );
    onOpenChange(false);
    onDone(sendRows.length, skipped);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bulk ? "Send reminders?" : "Send fee reminder?"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="rounded-md bg-muted p-3 text-muted-foreground">
            Simulated reminder preview. No external email or message is sent; confirming records
            this action.
          </p>
          {bulk ? (
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {rows.map((row) => (
                <li
                  key={row.student.id}
                  className="flex justify-between gap-3 rounded-md border p-2"
                >
                  <span>
                    {row.student.name}
                    <span className="block text-xs text-muted-foreground">
                      {row.student.email?.trim() || "Skipped — no email address"}
                    </span>
                  </span>
                  <span className="num whitespace-nowrap">{formatINR(row.amountDue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              <span className="text-muted-foreground">To: </span>
              {preview?.student.email || "No student email is recorded"}
            </p>
          )}
          {preview && (
            <div className="rounded-md border p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Message preview</p>
              {reminderMessage(settings.institution.name, preview)}
            </div>
          )}
          {skipped > 0 && (
            <p className="text-xs text-muted-foreground">
              {skipped} repeated reminder{skipped === 1 ? "" : "s"} or student record
              {skipped === 1 ? "" : "s"} without an email will be skipped.
            </p>
          )}
          {repeated.length > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning-soft p-2 text-xs text-warning">
              A reminder was already recorded today for{" "}
              {repeated.map((r) => r.student.name).join(", ")}. It will not be counted twice.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirmLog} disabled={sendRows.length === 0}>
            Confirm simulated {bulk ? "reminders" : "reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BillField({
  label,
  error,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  error?: string | undefined;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      {children}
      <p className="h-4 truncate text-xs text-destructive" aria-live="polite">
        {error ?? ""}
      </p>
    </div>
  );
}

function CreateBill({
  initialStudent,
  onClose,
}: {
  initialStudent?: Student;
  onClose: () => void;
}) {
  const { courseCatalog, feeWorkflow, addStudent } = useFinance();
  const { open: openRecordPayment } = useRecordPayment();
  const empty = {
    name: "",
    applicationId: "",
    department: "",
    courseId: "",
    track: "Fast Track",
    fee: "",
    count: "3",
    firstDue: "2026-11-15",
    phone: "",
    email: "",
    batch: "",
    admissionNo: "",
  };
  const initialCourse = initialStudent
    ? courseCatalog.courses.find(
        (course) => course.id === initialStudent.courseId || course.name === initialStudent.course,
      )
    : undefined;
  const [f, setF] = useState(() =>
    initialStudent
      ? {
          ...empty,
          name: initialStudent.name,
          applicationId: initialStudent.applicationId ?? "",
          admissionNo: initialStudent.regNo,
          department: initialStudent.department ?? initialCourse?.department ?? "",
          courseId: initialCourse?.id ?? "",
          track: initialStudent.track ?? "Fast Track",
          fee: String(initialCourse?.fee ?? initialStudent.totalFee),
          count: String(initialStudent.installments.length || 3),
          firstDue: initialStudent.installments[0]?.due ?? empty.firstDue,
          phone: initialStudent.phone,
          email: initialStudent.email ?? "",
          batch: initialStudent.batch ?? "",
        }
      : empty,
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [confirmClose, setConfirmClose] = useState(false);
  const [createdBill, setCreatedBill] = useState<{
    personId: string;
    studentName: string;
    firstAmount: number;
  } | null>(null);
  const submitting = useRef(false);
  const onEnterKeyDown = useEnterToNext();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const touch = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));
  const activeCourses = courseCatalog.courses.filter(
    (course) => course.status === "Active" && course.department === f.department,
  );
  const selectedCourse = activeCourses.find((course) => course.id === f.courseId);
  const trackOptions = selectedCourse
    ? [
        { name: "Fast Track" as const, duration: selectedCourse.fastTrack },
        ...(selectedCourse.normalTrack
          ? [{ name: "Normal Track" as const, duration: selectedCourse.normalTrack }]
          : []),
      ]
    : [];
  const track = trackOptions.find((t) => t.name === f.track) ?? trackOptions[0];
  const feeEditable = selectedCourse !== undefined && selectedCourse.fee === undefined;
  const fee = selectedCourse ? (feeEditable ? Number(f.fee) || 0 : (selectedCourse.fee ?? 0)) : 0;
  const countNum = Number(f.count);
  const countValid = Number.isInteger(countNum) && countNum >= 1 && countNum <= 12;
  const preview =
    fee > 0 && countValid && f.firstDue ? monthlyInstallments(fee, countNum, f.firstDue) : [];
  const e: Record<string, string> = {};
  if (!f.department) e["department"] = "Select a department";
  if (!selectedCourse) e["course"] = "Choose an active course";
  if (!f.name.trim()) e["name"] = "Enter the student name";
  if (!f.phone.trim()) e["phone"] = "Enter a phone number";
  else if (!isValidPhone(f.phone)) e["phone"] = "Enter a valid 10-digit phone number";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    e["email"] = "Enter a valid email address";
  if (feeEditable && !(fee > 0)) e["fee"] = "Enter an amount greater than 0";
  if (!countValid) e["count"] = "Enter 1 to 12";
  if (!f.firstDue) e["firstDue"] = "Choose a date";
  const valid = Object.keys(e).length === 0;
  const show = (k: string) => (touched[k] ? e[k] : undefined);
  const dirty = JSON.stringify(f) !== JSON.stringify(empty);
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());
  const submit = () => {
    if (submitting.current) return;
    if (!valid) {
      setTouched(Object.fromEntries(Object.keys(e).map((k) => [k, true])));
      return;
    }
    submitting.current = true;
    const student = addStudent({
      name: f.name.trim(),
      applicationId: f.applicationId.trim() || undefined,
      regNo: "",
      course: selectedCourse!.name,
      department: f.department,
      batch: f.batch.trim() || undefined,
      courseId: selectedCourse!.id,
      track: track!.name,
      duration: track!.duration,
      phone: f.phone.replace(/\s/g, "").replace(/^\+91/, ""),
      email: f.email.trim(),
      registeredOn: TODAY,
      totalFee: fee,
      installments: preview,
    });
    setCreatedBill({
      personId: workflowPersonForStudent(student, feeWorkflow.persons)?.id ?? student.id,
      studentName: student.name,
      firstAmount: preview[0]?.amount ?? 0,
    });
    toast.success(`Bill created for ${f.name.trim()}`);
  };
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && requestClose()}>
        <DialogContent className="flex max-h-[95vh] w-[90vw] max-w-[960px] flex-col gap-0 p-0 sm:max-w-[960px]">
          <DialogHeader className="px-6 pb-2 pt-5">
            <DialogTitle>{createdBill ? "Bill created" : "Create student bill"}</DialogTitle>
          </DialogHeader>
          {createdBill ? (
            <div className="space-y-4 px-6 pb-6">
              <p className="text-sm text-muted-foreground">
                The bill for {createdBill.studentName} was created successfully.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button
                  onClick={() => {
                    openRecordPayment(createdBill.personId, createdBill.firstAmount);
                    onClose();
                  }}
                >
                  Record payment
                </Button>
              </DialogFooter>
            </div>
          ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            onKeyDown={onEnterKeyDown}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2">
              <div className="grid grid-cols-3 items-start gap-x-4 gap-y-2">
                <BillField label="Department" htmlFor="b-dept" error={show("department")}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="min-w-0" onBlur={touch("department")}>
                        <SimpleSelect
                          id="b-dept"
                          value={f.department}
                          onChange={(department) =>
                            setF((x) => ({
                              ...x,
                              department,
                              courseId: "",
                              fee: "",
                              track: "Fast Track",
                            }))
                          }
                          options={courseCatalog.departments}
                          placeholder="Select department"
                        />
                      </div>
                    </TooltipTrigger>
                    {f.department && <TooltipContent>{f.department}</TooltipContent>}
                  </Tooltip>
                </BillField>
                <BillField label="Course" htmlFor="b-c" error={show("course")}>
                  <div className="min-w-0" onBlur={touch("course")}>
                    <SimpleSelect
                      id="b-c"
                      value={selectedCourse?.name ?? ""}
                      onChange={(name) => {
                        const course = activeCourses.find((item) => item.name === name);
                        setF((x) => ({
                          ...x,
                          courseId: course?.id ?? "",
                          fee: "",
                          track: "Fast Track",
                        }));
                      }}
                      options={activeCourses.map((course) => course.name)}
                      placeholder={f.department ? "Select course" : "Select department first"}
                    />
                  </div>
                </BillField>
                <BillField label="Track">
                  {trackOptions.length ? (
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={track?.name}
                      onValueChange={(v) => v && set("track")(v)}
                      className="w-full justify-start"
                      aria-label="Track"
                    >
                      {trackOptions.map((t) => (
                        <ToggleGroupItem
                          key={t.name}
                          value={t.name}
                          className="h-9 flex-1 gap-1.5 text-sm"
                        >
                          {t.name}
                          <span className="text-xs text-muted-foreground">
                            {formatCourseDuration(t.duration)}
                          </span>
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  ) : (
                    <Input value="Select a course" readOnly disabled />
                  )}
                </BillField>

                <BillField label="Student Name" htmlFor="b-n" error={show("name")}>
                  <Input
                    id="b-n"
                    value={f.name}
                    onBlur={touch("name")}
                    onChange={(ev) => set("name")(ev.target.value)}
                    aria-required
                  />
                </BillField>
                <BillField label="Phone" htmlFor="b-p" error={show("phone")}>
                  <Input
                    id="b-p"
                    inputMode="numeric"
                    value={f.phone}
                    onBlur={touch("phone")}
                    onChange={(ev) => set("phone")(ev.target.value)}
                    placeholder="10-digit number"
                    aria-required
                  />
                </BillField>
                <BillField label="Student email" htmlFor="b-email" error={show("email")}>
                  <Input
                    id="b-email"
                    type="email"
                    value={f.email}
                    onBlur={touch("email")}
                    onChange={(ev) => set("email")(ev.target.value)}
                    aria-required
                  />
                </BillField>
                <BillField label="Application ID (optional)" htmlFor="b-application-id">
                  <Input
                    id="b-application-id"
                    value={f.applicationId}
                    readOnly
                    tabIndex={-1}
                    className="bg-muted"
                    placeholder="APP2026-###"
                  />
                </BillField>
                <BillField label={ADMISSION_NO_FULL}>
                  <Input
                    value={f.admissionNo || "Pending — received from Administration"}
                    readOnly
                    tabIndex={-1}
                    className="bg-muted"
                  />
                </BillField>

                <BillField label="Batch (optional)" htmlFor="b-batch">
                  <Input
                    id="b-batch"
                    value={f.batch}
                    onChange={(ev) => set("batch")(ev.target.value)}
                    placeholder="e.g. Oct 2026 Morning"
                  />
                </BillField>
                <BillField label="Billed amount (₹)" htmlFor="b-f" error={show("fee")}>
                  {feeEditable ? (
                    <Input
                      id="b-f"
                      type="number"
                      min="1"
                      value={f.fee}
                      onBlur={touch("fee")}
                      onChange={(ev) => set("fee")(ev.target.value)}
                      className="num font-semibold"
                      aria-required
                    />
                  ) : (
                    <Input
                      id="b-f"
                      value={selectedCourse ? formatINR(fee) : "—"}
                      readOnly
                      tabIndex={-1}
                      className="bg-muted num font-semibold"
                    />
                  )}
                </BillField>
                <BillField label="Number of installments" htmlFor="b-i" error={show("count")}>
                  <Input
                    id="b-i"
                    type="number"
                    min="1"
                    max="12"
                    step="1"
                    value={f.count}
                    onBlur={touch("count")}
                    onChange={(ev) => set("count")(ev.target.value)}
                  />
                </BillField>

                <BillField label="First due date" htmlFor="b-due" error={show("firstDue")}>
                  <Input
                    id="b-due"
                    type="date"
                    value={f.firstDue}
                    onBlur={touch("firstDue")}
                    onChange={(ev) => set("firstDue")(ev.target.value)}
                  />
                </BillField>
                <div className="col-span-2 min-w-0 space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Installment preview
                  </p>
                  {preview.length ? (
                    <ol className="grid grid-cols-4 gap-2" aria-label="Installment preview">
                      {preview.map((i, idx) => (
                        <li
                          key={i.label}
                          className="rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs"
                        >
                          <div className="flex justify-between gap-2 text-muted-foreground">
                            <span>#{idx + 1}</span>
                            <span>{formatDate(i.due)}</span>
                          </div>
                          <div className="num text-sm font-semibold">{formatINR(i.amount)}</div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="flex h-9 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
                      Choose a course, amount, installments and first due date to see the schedule.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6 border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid}>
                Create bill
              </Button>
            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>
      {!createdBill && <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard this bill?"
        description="The details you entered will be lost."
        confirmLabel="Discard"
        onConfirm={onClose}
      />}
    </>
  );
}

function PaymentNotificationDialog({
  open,
  payload,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  payload: PaymentNotificationPayload | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notify Administration (simulated)</DialogTitle>
        </DialogHeader>
        {payload && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Student: </span>
                {payload.name}
              </p>
              <p>
                <span className="text-muted-foreground">Application ID: </span>
                {payload.applicationId}
              </p>
              <p>
                <span className="text-muted-foreground">{ADMISSION_NO_FULL}: </span>
                {payload.admissionNo}
              </p>
              <p>
                <span className="text-muted-foreground">Contact: </span>
                {payload.contact}
              </p>
              <p>
                <span className="text-muted-foreground">Email: </span>
                {payload.email || "Not provided"}
              </p>
            </div>
            <p className="rounded-md bg-muted p-3 text-muted-foreground">{payload.note}</p>
            <div className="space-y-2">
              <p className="font-medium">Payments being reported</p>
              {payload.payments.map((payment) => (
                <div key={payment.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>{formatDate(payment.date)}</span>
                    <span className="num font-medium">{formatINR(payment.amount)}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {payment.installmentsCovered
                      .map(({ label, amount }) => `${displayInstallmentLabel(label)} ${formatINR(amount)}`)
                      .join(" · ") || "Installment details not available"}
                  </p>
                  <p className="mt-1">
                    Remaining balance:{" "}
                    <span className="num">{formatINR(payment.remainingBalance)}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Simulated, no system was contacted.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!payload?.payments.length}>
            Confirm simulated notification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
