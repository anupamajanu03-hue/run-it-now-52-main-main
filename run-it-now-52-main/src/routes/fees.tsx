import { createFileRoute, redirect } from "@tanstack/react-router";
import { addDays } from "date-fns";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isValidPhone, monthlyInstallments } from "@/finance/billing";
import { toast } from "sonner";
import { Bell, Eye, MoreHorizontal, Plus, Receipt as ReceiptIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { ApplicationDetail, ApplicationDetails } from "@/components/finance/ApplicationDetails";
import { useRecordPayment } from "@/components/finance/RecordPaymentContext";
import { useFinance } from "@/finance/store";
import {
  buildAdministrationDetailsPayload,
  buildPaymentNotificationPayload,
  buildPaymentReminderEmail,
  appearsInBilling,
  areAllPaymentsAdministrationNotified,
  canSendToAdministration,
  classAccess,
  hasAdministrationDetailsEvent,
  installmentDaysOverdue,
  installmentFollowUpStatus,
  installmentOutstanding,
  installmentPaid,
  installmentStatus,
  isRecentlyPaidInstallment,
  isEligibleNow,
  nextAction,
  personTotals,
  taskPriority,
  type FeeNextAction,
  type PaymentNotificationPayload,
} from "@/finance/feeWorkflow";
import {
  ADMISSION_NO_RECEIVED_TEXT,
  ADMINISTRATION_DETAILS_SENT_TEXT,
  ADMINISTRATION_PAYMENT_NOTIFIED_TEXT,
  MAX_REMINDERS,
  REMINDER_LEAD_DAYS,
  REQUIRE_APPLICATION_REVIEW,
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
  type HandoffHistoryEntry,
  type Person,
  type Student,
} from "@/finance/types";
import { ADMISSION_NO_FULL, ADMISSION_NO_SHORT } from "@/finance/labels";
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
  }),
  beforeLoad: ({ search }) => {
    if (search.tab === "receipts" || search.tab === "collection")
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
  installments: "Installments",
  handoffs: "Handoffs",
};
const STATUSES = ["Paid", "Partially Paid", "Pending", "Overdue"];
function FeesPage() {
  const { tab = "billing" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <>
      <PageHeader
        crumbs={["Student Fees", LABEL[tab] ?? ""]}
        title={LABEL[tab] ?? "Student Fees"}
      />
      {tab === "applications" || tab === "handoffs" ? (
        <div className="mb-4 rounded-xl bg-accent px-3.5 py-2 text-xs text-accent-foreground">
          {tab === "applications"
            ? "Application forms submitted by students (simulated)"
            : "Demo data. Handoffs, reminders and class access are simulated."}
        </div>
      ) : (
        <SampleNote />
      )}
      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v } })} className="mb-4">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="installments">Installments</TabsTrigger>
          <TabsTrigger value="handoffs">Handoffs</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "applications" && <Applications />}
      {tab === "handoffs" && <Handoffs />}
      {tab === "billing" && <Billing />}
      {tab === "installments" && <Installments />}
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
  const rows = sourceStudents.filter(
    (student) =>
      (!search ||
        `${student.name} ${student.regNo} ${student.applicationId ?? ""} ${student.phone}`
          .toLowerCase()
          .includes(search) ||
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

function Handoffs() {
  const { feeWorkflow } = useFinance();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [selectedEntry, setSelectedEntry] = useState<{
    entry: HandoffHistoryEntry;
    personId: string;
    eventType: string;
  } | null>(null);
  const personsById = new Map(feeWorkflow.persons.map((person) => [person.id, person]));
  const eventTypeFor = (entry: HandoffHistoryEntry) => {
    if (entry.text === ADMINISTRATION_DETAILS_SENT_TEXT) return "Details sent";
    if (entry.text === ADMISSION_NO_RECEIVED_TEXT) return "Admission No. received";
    if (entry.text === ADMINISTRATION_PAYMENT_NOTIFIED_TEXT) return "Payment notified";
    return null;
  };
  const events = feeWorkflow.handoffs
    .filter((handoff) => handoff.target === "Administration")
    .flatMap((handoff) =>
      handoff.history.flatMap((entry) => {
        const eventType = eventTypeFor(entry);
        return eventType ? [{ entry, personId: handoff.personId, eventType }] : [];
      }),
    );
  const uniqueEvents = Array.from(
    new Map(
      events.map((event) => [
        `${event.personId}|${event.eventType}|${event.entry.referenceId ?? ""}`,
        event,
      ]),
    ).values(),
  ).sort((left, right) => right.entry.date.localeCompare(left.entry.date));
  const detailsSentEvents = uniqueEvents.filter((event) => event.eventType === "Details sent");
  const awaitingAdmission = feeWorkflow.persons.filter(
    (person) =>
      !person.admissionNo && detailsSentEvents.some((event) => event.personId === person.id),
  );
  const admissionReceivedCount = new Set(
    uniqueEvents
      .filter((event) => event.eventType === "Admission No. received")
      .map((event) => event.personId),
  ).size;
  const paymentNotifications = uniqueEvents.filter(
    (event) => event.eventType === "Payment notified",
  );
  const searchText = query.trim().toLowerCase();
  const filteredEvents = uniqueEvents.filter((event) => {
    const person = personsById.get(event.personId);
    return (
      (eventFilter === "all" || event.eventType === eventFilter) &&
      (!searchText ||
        `${person?.name ?? ""} ${person?.applicationId ?? ""}`.toLowerCase().includes(searchText))
    );
  });
  const selectedPerson = selectedEntry ? personsById.get(selectedEntry.personId) : undefined;
  const selectedPayment = selectedEntry?.entry.referenceId
    ? feeWorkflow.payments.find((payment) => payment.id === selectedEntry.entry.referenceId)
    : undefined;
  const selectedEventDate = selectedEntry?.entry.date.slice(0, 10);
  const paymentSnapshot =
    selectedEntry?.entry.paymentNotification ??
    (selectedPayment && selectedPerson
      ? {
          date: selectedPayment.date,
          amount: selectedPayment.amount,
          installmentsCovered: selectedPayment.allocations.map((allocation) => ({
            label:
              selectedPerson.plan.find((installment) => installment.id === allocation.installmentId)
                ?.label ?? allocation.installmentId,
            amount: allocation.amount,
          })),
          remainingBalance: personTotals(
            selectedPerson,
            feeWorkflow.payments.filter(
              (payment) =>
                payment.personId === selectedPerson.id &&
                selectedEventDate !== undefined &&
                payment.date <= selectedEventDate,
            ),
          ).outstanding,
        }
      : undefined);
  const eventTypes = ["Details sent", "Admission No. received", "Payment notified"];

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-accent px-3.5 py-2 text-xs text-accent-foreground">
        Payment recorded -&gt; full application details sent to Administration -&gt; Administration
        creates the Admission No. -&gt; number recorded in Billing -&gt; Administration notified of
        payments for batch and classes. All actions are simulated.
      </p>
      <StatGrid>
        <StatCard label="Details sent" value={String(detailsSentEvents.length)} />
        <StatCard label="Awaiting Admission No." value={String(awaitingAdmission.length)} />
        <StatCard label="Admission No. received" value={String(admissionReceivedCount)} />
        <StatCard label="Payments notified" value={String(paymentNotifications.length)} />
      </StatGrid>

      <SectionCard
        title="Awaiting Admission No."
        subtitle="Admission No. is created by Administration. Accounts only records it."
        action={<StatusBadge status="Simulated" />}
      >
        {awaitingAdmission.length === 0 ? (
          <EmptyState message="No applicants are awaiting an Admission No." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {awaitingAdmission.map((person) => (
              <li
                key={person.id}
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{person.name}</p>
                  <p className="text-xs text-muted-foreground">{person.applicationId}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate({ search: { tab: "billing", admissionPersonId: person.id } })
                  }
                >
                  Go to Billing
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Administration handoff history"
        action={<StatusBadge status="Simulated" />}
      >
        <FilterBar>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search person or application ID"
          />
          <FilterSelect
            label="Event type"
            value={eventFilter}
            onChange={setEventFilter}
            options={eventTypes}
          />
        </FilterBar>
        {filteredEvents.length === 0 ? (
          <EmptyState message="No handoff activity yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Event type</TableHead>
                  <TableHead>Text</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => {
                  const person = personsById.get(event.personId);
                  return (
                    <TableRow
                      key={`${event.personId}-${event.eventType}-${event.entry.referenceId ?? ""}`}
                    >
                      <TableCell className="whitespace-nowrap">
                        {formatDate(event.entry.date.slice(0, 10))}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <button
                          type="button"
                          className="text-left font-medium text-primary underline underline-offset-4"
                          onClick={() =>
                            navigate({
                              search: person?.applicationDetails
                                ? { tab: "applications", applicationPersonId: person.id }
                                : { tab: "billing", billingPersonId: person?.id },
                            })
                          }
                        >
                          {person?.name ?? event.personId}
                        </button>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={event.eventType} />
                      </TableCell>
                      <TableCell className="min-w-64">{event.entry.text}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {event.eventType === "Details sent" && event.entry.snapshot ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedEntry(event)}
                          >
                            View sent details
                          </Button>
                        ) : event.eventType === "Payment notified" ? (
                          <Button size="sm" variant="ghost" onClick={() => setSelectedEntry(event)}>
                            View payment
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="sticky top-0 z-10 shrink-0 border-b bg-background px-4 py-4 pr-14 text-left sm:px-6">
            <DialogTitle>
              {selectedEntry?.eventType === "Details sent"
                ? "Sent details snapshot"
                : "Payment notified to Administration"}
            </DialogTitle>
            {selectedEntry && (
              <p className="text-sm text-muted-foreground">
                {selectedPerson?.name ?? selectedEntry.personId} ·{" "}
                {formatDate(selectedEntry.entry.date.slice(0, 10))} · Simulated
              </p>
            )}
          </DialogHeader>
          {selectedEntry?.eventType === "Details sent" && selectedEntry.entry.snapshot && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <ApplicationDetails
                snapshot={selectedEntry.entry.snapshot}
                plan={selectedPerson?.plan}
              />
            </div>
          )}
          {selectedEntry?.eventType === "Payment notified" && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              <p className="text-sm">
                Tells Administration about the payment so the batch and classes can be created or
                updated (simulated).
              </p>
              {paymentSnapshot ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <ApplicationDetail
                    label="Payment date"
                    value={formatDate(paymentSnapshot.date)}
                  />
                  <ApplicationDetail label="Amount" value={formatINR(paymentSnapshot.amount)} />
                  <ApplicationDetail
                    label="Installments covered"
                    value={
                      paymentSnapshot.installmentsCovered
                        .map(({ label, amount }) => `${label} (${formatINR(amount)})`)
                        .join(", ") || "Not provided"
                    }
                  />
                  <ApplicationDetail
                    label="Remaining balance"
                    value={formatINR(paymentSnapshot.remainingBalance)}
                  />
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Payment details are unavailable for this legacy notification event.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => setSelectedEntry(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<Person | null>(null);
  const [showingSentSnapshot, setShowingSentSnapshot] = useState(false);
  const [showSendPreview, setShowSendPreview] = useState(false);
  useEffect(() => {
    const linkedPerson = feeWorkflow.persons.find((person) => person.id === applicationPersonId);
    if (linkedPerson) {
      setView(linkedPerson);
      setShowingSentSnapshot(false);
      if (applicationAction === "send") setShowSendPreview(true);
      if (applicationAction) navigate({ search: { tab: "applications" } });
    }
  }, [applicationAction, applicationPersonId, feeWorkflow.persons, navigate]);
  const submitted = feeWorkflow.persons.filter((person) => person.applicationDetails);
  const statusFor = (person: Person) =>
    person.admissionNo
      ? "Admitted"
      : hasAdministrationDetailsEvent(person.id, feeWorkflow.handoffs)
        ? "Sent to Administration"
        : person.applicationStatus;
  const courses = [...new Set(submitted.map((person) => person.course))].sort();
  const statuses = [...new Set(submitted.map(statusFor))];
  const search = query.trim().toLowerCase();
  const rows = submitted.filter(
    (person) =>
      (!search ||
        `${person.name} ${person.applicationId} ${person.contact}`
          .toLowerCase()
          .includes(search)) &&
      (course === "all" || person.course === course) &&
      (status === "all" || statusFor(person) === status),
  );
  const payments = view
    ? feeWorkflow.payments.filter((payment) => payment.personId === view.id)
    : [];
  const totals = view ? personTotals(view, payments) : undefined;
  const snapshot = view ? buildAdministrationDetailsPayload(view, payments) : undefined;
  const sentEvent = view
    ? feeWorkflow.handoffs
        .find((handoff) => handoff.personId === view.id && handoff.target === "Administration")
        ?.history.find((entry) => entry.snapshot)
    : undefined;
  const administratorVerifiedAt = view
    ? feeWorkflow.handoffs
        .find((handoff) => handoff.personId === view.id && handoff.target === "Administration")
        ?.history.find((entry) => entry.text === ADMISSION_NO_RECEIVED_TEXT)?.date
    : undefined;
  const accountantVerifiedAt =
    view && totals && totals.outstanding === 0 && payments.length > 0
      ? [...payments].sort((left, right) => right.date.localeCompare(left.date))[0]?.date
      : undefined;
  const fullyVerified = !!accountantVerifiedAt && !!administratorVerifiedAt;
  const alreadySent = !!view && hasAdministrationDetailsEvent(view.id, feeWorkflow.handoffs);
  const canSend = !!view && canSendToAdministration(view, payments) && !alreadySent;
  const sendDetails = () => {
    if (!view || !canSend) return;
    sendFeeWorkflowDetailsToAdministration(view.id);
    setShowSendPreview(false);
    toast.success(ADMINISTRATION_DETAILS_SENT_TEXT);
  };

  return (
    <>
      <StatGrid className="mb-4">
        <StatCard label="Applications" value={String(rows.length)} />
        <StatCard
          label={REQUIRE_APPLICATION_REVIEW ? "To review" : "Awaiting payment"}
          value={String(rows.filter((person) => person.applicationStatus === "Received").length)}
        />
        <StatCard
          label="Payment recorded"
          value={String(
            rows.filter((person) => person.applicationStatus === "Payment Recorded").length,
          )}
        />
        <StatCard
          label="Sent to Administration"
          value={String(
            rows.filter((person) => hasAdministrationDetailsEvent(person.id, feeWorkflow.handoffs))
              .length,
          )}
        />
      </StatGrid>
      <SectionCard>
        <FilterBar>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search name, application ID or contact"
          />
          <FilterSelect label="Courses" value={course} onChange={setCourse} options={courses} />
          <FilterSelect label="Statuses" value={status} onChange={setStatus} options={statuses} />
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState message="No applications found" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application ID</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Applied on</TableHead>
                  <TableHead className="text-right">Fee payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((person) => (
                  <TableRow
                    key={person.id}
                    onRowClick={() => {
                      setView(person);
                      setShowingSentSnapshot(false);
                    }}
                    rowLabel={`View application for ${person.name}`}
                  >
                    <TableCell className="whitespace-nowrap">{person.applicationId}</TableCell>
                    <TableCell className="whitespace-nowrap">{person.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{person.contact}</TableCell>
                    <TableCell className="whitespace-nowrap">{person.course}</TableCell>
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
                    <TableCell>
                      <StatusBadge status={statusFor(person)} />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setView(person);
                          setShowingSentSnapshot(false);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
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
            <DialogTitle>{showingSentSnapshot ? "Sent details snapshot" : view?.name}</DialogTitle>
            {view && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Application No. {view.applicationId}</span>
                <span>Applied {formatDate(view.appliedOn)}</span>
                {!showingSentSnapshot && (
                  <>
                    <StatusBadge status={statusFor(view)} />
                    <StatusBadge
                      status={
                        view.admissionNo
                          ? `Admission No. ${view.admissionNo}`
                          : "Admission No. Pending"
                      }
                    />
                  </>
                )}
              </div>
            )}
          </DialogHeader>
          {view && snapshot && (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
              {showingSentSnapshot && sentEvent?.snapshot ? (
                <>
                  <ApplicationDetails snapshot={sentEvent.snapshot} plan={view.plan} />
                  <Button variant="outline" onClick={() => setShowingSentSnapshot(false)}>
                    Back to application
                  </Button>
                </>
              ) : (
                <>
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
                              <TableCell>{installment.label}</TableCell>
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
                        <ApplicationDetail
                          label="Outstanding"
                          value={formatINR(totals.outstanding)}
                        />
                      </div>
                    </section>
                  )}
                  <section className="space-y-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">For office use only</h3>
                      <StatusBadge status={fullyVerified ? "Fully verified" : "Pending"} />
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <ApplicationDetail
                        label="Accountant verification"
                        value={
                          accountantVerifiedAt
                            ? `Verified · ${formatDate(accountantVerifiedAt)}`
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
                  {sentEvent && (
                    <p className="text-sm text-muted-foreground">
                      Sent to Administration on {formatDate(sentEvent.date.slice(0, 10))}.{" "}
                      {sentEvent.snapshot && (
                        <button
                          type="button"
                          className="font-medium text-primary underline underline-offset-4"
                          onClick={() => setShowingSentSnapshot(true)}
                        >
                          View sent details
                        </button>
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {view && !showingSentSnapshot && (
            <DialogFooter className="sticky bottom-0 z-10 flex-wrap gap-2 border-t bg-background px-4 py-3 sm:px-6">
              {REQUIRE_APPLICATION_REVIEW && view.applicationStatus === "Received" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const reviewed = { ...view, applicationStatus: "Reviewed" as const };
                    updateFeeWorkflowPerson(reviewed);
                    setView(reviewed);
                  }}
                >
                  Mark reviewed
                </Button>
              )}
              {(!REQUIRE_APPLICATION_REVIEW || view.applicationStatus !== "Received") &&
                !view.admissionNo &&
                totals &&
                totals.outstanding > 0 && (
                  <Button variant="outline" onClick={() => openRecordPayment(view.id)}>
                    Record payment
                  </Button>
                )}
              {!alreadySent && (
                <div className="flex flex-col gap-1 sm:mr-auto">
                  <Button
                    variant="outline"
                    disabled={!canSend}
                    onClick={() => setShowSendPreview(true)}
                  >
                    Send to Administration
                  </Button>
                  {!canSend && (
                    <span className="text-xs text-muted-foreground">
                      Registration installment unpaid
                    </span>
                  )}
                </div>
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
  } = useFinance();
  const normalizeContact = (value: string) => {
    const digits = value.replace(/\D/g, "");
    return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  };
  const workflowStudents = useMemo(
    () =>
      feeWorkflow.persons
        .filter((person) => appearsInBilling(person, feeWorkflow.payments))
        .filter(
          (person) =>
            !students.some(
              (student) =>
                student.id === person.id ||
                (!!student.applicationId && student.applicationId === person.applicationId) ||
                normalizeContact(student.phone) === normalizeContact(person.contact),
            ),
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
  const [view, setView] = useState<{ student: Student; initialSection?: "payments" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [remindSelected, setRemindSelected] = useState(false);
  const [admissionPersonId, setAdmissionPersonId] = useState<string | null>(null);
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [admissionError, setAdmissionError] = useState("");
  const [notifyPersonId, setNotifyPersonId] = useState<string | null>(null);
  const [todayFilter, setTodayFilter] = useState<"all" | "dueSoon" | "overdue" | "meeting">("all");
  const [showAllTasks, setShowAllTasks] = useState(false);
  useEffect(() => {
    if (linkedAdmissionPersonId) {
      const person = feeWorkflow.persons.find(
        (candidate) => candidate.id === linkedAdmissionPersonId,
      );
      if (person && !person.admissionNo) setAdmissionPersonId(person.id);
    }
    if (billingPersonId) {
      const student = billingStudents.find((candidate) => candidate.id === billingPersonId);
      if (student && view?.student.id !== student.id) setView({ student });
    }
  }, [billingPersonId, billingStudents, feeWorkflow.persons, linkedAdmissionPersonId, view]);
  const personForStudent = (student: Student) =>
    feeWorkflow.persons.find(
      (person) =>
        person.id === student.id ||
        (!!student.applicationId && person.applicationId === student.applicationId) ||
        normalizeContact(person.contact) === normalizeContact(student.phone),
    );
  const pendingAdministrationHandoff = (personId: string) =>
    feeWorkflow.handoffs.some(
      (handoff) =>
        handoff.personId === personId &&
        handoff.target === "Administration" &&
        handoff.status === "Awaiting Admission No.",
    );
  const selectedNotifyPerson = feeWorkflow.persons.find((person) => person.id === notifyPersonId);
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
  const dueSoonPeople = feeWorkflow.persons.filter((person) => {
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
  });
  const overduePeople = feeWorkflow.persons.filter((person) =>
    person.plan.some(
      (installment) => installmentStatus(installment, paymentsForPerson(person)) === "Overdue",
    ),
  );
  const meetingPeople = feeWorkflow.persons.filter(
    (person) => actionFor(person) === "Arrange Meeting",
  );
  const dueSoonIds = new Set(dueSoonPeople.map((person) => person.id));
  const overdueIds = new Set(overduePeople.map((person) => person.id));
  const meetingIds = new Set(meetingPeople.map((person) => person.id));
  const taskItems = feeWorkflow.persons
    .flatMap((person) => {
      const personPayments = paymentsForPerson(person);
      const action = nextAction(person, personPayments, feeWorkflow.handoffs);
      return action
        ? [
            {
              person,
              personPayments,
              action,
              priority: taskPriority(person, personPayments, feeWorkflow.handoffs),
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        left.priority - right.priority || left.person.name.localeCompare(right.person.name),
    );
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
    if (action === "Review Application" || action === "Send to Administration") {
      navigate({
        search: {
          tab: "applications",
          applicationPersonId: person.id,
          applicationAction: action === "Send to Administration" ? "send" : undefined,
        },
      });
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
    navigate({
      search: {
        tab: "installments",
        workflowAction: action === "Send Reminder" ? "reminder" : "meeting",
        workflowActionPersonId: person.id,
        workflowActionInstallmentId: installment.id,
      },
    });
  };
  const taskReason = (
    person: Person,
    action: FeeNextAction,
    personPayments: FeeWorkflowPayment[],
  ) => {
    const overdue = person.plan.find(
      (installment) => installmentStatus(installment, personPayments) === "Overdue",
    );
    const upcoming = person.plan.find(
      (installment) =>
        dueSoonIds.has(person.id) &&
        installmentStatus(installment, personPayments) !== "Paid" &&
        installment.dueDate >= TODAY &&
        installment.dueDate <= dueSoonCutoff,
    );
    const totals = personTotals(person, personPayments);
    if (overdue) {
      return `${overdue.label}, ${formatINR(installmentOutstanding(overdue, personPayments))} overdue since ${formatDate(overdue.dueDate)}`;
    }
    if (action === "Send Reminder" && upcoming) {
      return `${upcoming.label}, ${formatINR(installmentOutstanding(upcoming, personPayments))} due ${formatDate(upcoming.dueDate)}`;
    }
    if (action === "Review Application") return "Application received and awaiting review";
    if (action === "Record Payment")
      return `${formatINR(totals.outstanding)} outstanding on ${totals.nextDueInstallment?.label ?? "fee plan"}`;
    if (action === "Enter Admission No.") return "Details sent; Admission No. pending";
    if (action === "Send to Administration") return "Registration paid; ready to send";
    if (action === "Arrange Meeting") return "Reminder limit reached; in-person follow-up required";
    return "Overdue payment cleared; Administration notification pending";
  };
  const taskFilteredRows = rows.filter((student) => {
    if (todayFilter === "all") return true;
    const person = personForStudent(student);
    if (!person) return false;
    if (todayFilter === "dueSoon") return dueSoonIds.has(person.id);
    if (todayFilter === "overdue") return overdueIds.has(person.id);
    return meetingIds.has(person.id);
  });
  const saveAdmissionNumber = () => {
    if (!admissionPersonId) return;
    const result = receiveFeeWorkflowAdmissionNo(admissionPersonId, admissionNumber);
    if (result !== true) {
      setAdmissionError(
        result === "invalid"
          ? "Enter a number in the format ADM2026-###."
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
          className="w-full min-w-0 text-left"
          onClick={() => setTodayFilter((current) => (current === "dueSoon" ? "all" : "dueSoon"))}
        >
          <StatCard
            label="Payments due soon"
            value={String(dueSoonPeople.length)}
            caption="Filter Billing table"
          />
        </button>
        <button
          type="button"
          className="w-full min-w-0 text-left"
          onClick={() => setTodayFilter((current) => (current === "overdue" ? "all" : "overdue"))}
        >
          <StatCard
            label="Overdue fees"
            value={String(overduePeople.length)}
            tone={overduePeople.length ? "danger" : undefined}
            caption="Filter Billing table"
          />
        </button>
        <button
          type="button"
          className="w-full min-w-0 text-left"
          onClick={() => setTodayFilter((current) => (current === "meeting" ? "all" : "meeting"))}
        >
          <StatCard
            label="Meetings required"
            value={String(meetingPeople.length)}
            caption="Filter Billing table"
          />
        </button>
      </StatGrid>
      <SectionCard
        title="Priority tasks"
        subtitle="Applicants are included in action counts; Billing totals remain based on billed rows and recorded payments."
        action={
          taskItems.length > 3 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAllTasks((current) => !current)}
            >
              {showAllTasks ? "Show top 3" : "View all"}
            </Button>
          ) : undefined
        }
      >
        {taskItems.length === 0 ? (
          <EmptyState message="No actions are pending." />
        ) : (
          <ul className="divide-y">
            {(showAllTasks ? taskItems : taskItems.slice(0, 3)).map((task) => (
              <li
                key={`${task.person.id}-${task.action}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.person.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {taskReason(task.person, task.action, task.personPayments)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runNextAction(task.person, task.action)}
                >
                  {task.action}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard
        action={
          <div className="flex gap-2">
            {selected.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setRemindSelected(true)}>
                <Bell className="mr-1 h-4 w-4" />
                Send reminders ({selected.length})
              </Button>
            )}
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Create bill
            </Button>
          </div>
        }
      >
        {bar}
        {taskFilteredRows.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
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
                <TableHead>Student</TableHead>
                <TableHead className="min-w-36">{ADMISSION_NO_SHORT}</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taskFilteredRows.map((s) => {
                const nd = nextDue(s, billingPayments);
                const person = personForStudent(s);
                const personPayments = person
                  ? feeWorkflow.payments.filter((payment) => payment.personId === person.id)
                  : [];
                const awaitingAdmissionNo =
                  !!person && !person.admissionNo && pendingAdministrationHandoff(person.id);
                const hasUnnotifiedPayment =
                  !!person?.admissionNo && personPayments.some((payment) => !payment.adminNotified);
                const action = person
                  ? nextAction(person, personPayments, feeWorkflow.handoffs)
                  : null;
                return (
                  <TableRow
                    key={s.id}
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
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="num whitespace-nowrap text-xs tabular-nums">
                      {s.regNo ? s.regNo : <StatusBadge status="Pending" />}
                    </TableCell>
                    <TableCell>{studentCourse(s, courseCatalog)?.name ?? s.course}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(s.registeredOn)}
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={billStatus(s, billingPayments)} />
                        {person &&
                          personPayments.length > 0 &&
                          areAllPaymentsAdministrationNotified(personPayments) && (
                            <span className="whitespace-nowrap rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                              Administration notified
                            </span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {person && action ? (
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
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setView({ student: s });
                          }}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setView({ student: s, initialSection: "payments" });
                          }}
                        >
                          <ReceiptIcon className="mr-1 h-4 w-4" />
                          Receipts
                        </Button>
                        {(awaitingAdmissionNo || hasUnnotifiedPayment) && (
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
                              {awaitingAdmissionNo && person && (
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
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
            <DialogTitle>Bill — {view?.student.name}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {view && <BillDetails student={view.student} initialSection={view.initialSection} />}
          </div>
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
                placeholder="ADM2026-###"
                maxLength={11}
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
      {creating && <CreateBill onClose={() => setCreating(false)} />}
    </>
  );
}

export function BillDetails({
  student,
  initialSection,
}: {
  student: Student;
  initialSection?: "payments";
}) {
  const { payments, reminders, courseCatalog, feeWorkflow } = useFinance();
  const { open: openRecordPayment } = useRecordPayment();
  const [remind, setRemind] = useState(false);
  const [receipt, setReceipt] = useState<FeePayment | null>(null);
  const [workflowReceipt, setWorkflowReceipt] = useState<FeeWorkflowPayment | null>(null);
  const [emailPreviewReceiptId, setEmailPreviewReceiptId] = useState<string | null>(null);
  const paymentsSectionRef = useRef<HTMLDivElement>(null);
  const paid = studentPaid(student.id, payments);
  const mine = payments.filter((p) => p.studentId === student.id);
  const workflowPayments = feeWorkflow.payments
    .filter((payment) => payment.personId === student.id)
    .sort((left, right) => right.date.localeCompare(left.date));
  const selectedWorkflowReceipt = workflowReceipt
    ? (feeWorkflow.payments.find((payment) => payment.id === workflowReceipt.id) ?? workflowReceipt)
    : null;
  const workflowPaymentKeys = new Set(workflowPayments.map((payment) => payment.id));
  const legacyPayments = mine.filter((payment) => !workflowPaymentKeys.has(payment.id));
  const due = outstanding(student, payments);
  const canRemind =
    due > 0 ||
    installmentSchedule(student, paid, TODAY, payments).some(
      (i) => i.status === "Pending" || i.status === "Overdue",
    );
  const history = reminders
    .filter((r) => r.studentId === student.id)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const course = studentCourse(student, courseCatalog);
  useEffect(() => {
    if (initialSection === "payments")
      paymentsSectionRef.current?.scrollIntoView({ block: "start" });
  }, [initialSection, student.id]);
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={due <= 0} onClick={() => openRecordPayment(student.id)}>
          Collect payment
        </Button>
        {canRemind && (
          <Button
            size="sm"
            variant="outline"
            disabled={!student.phone.trim()}
            onClick={() => setRemind(true)}
          >
            <Bell className="mr-1 h-4 w-4" />
            Send reminder
          </Button>
        )}
      </div>
      {canRemind && !student.phone.trim() && (
        <p className="text-xs text-muted-foreground">
          A phone number is needed to send a reminder.
        </p>
      )}
      <p className="text-muted-foreground">
        {ADMISSION_NO_FULL} {student.regNo ? student.regNo : <StatusBadge status="Pending" />} ·{" "}
        {studentDepartment(student, courseCatalog)} · {course?.name ?? student.course}
        {student.track ? ` · ${student.track}` : ""}
        {student.duration ? ` · ${formatCourseDuration(student.duration)}` : ""}
      </p>
      <StatGrid className="mb-4">
        <StatCard label="Billed amount" value={formatINR(student.totalFee)} caption="Total fee" />
        <StatCard
          label="Recorded payments"
          value={formatINR(paid)}
          tone="success"
          caption="Collected so far"
        />
        <StatCard
          label="Remaining"
          value={formatINR(Math.max(0, student.totalFee - paid))}
          tone={student.totalFee - paid > 0 ? "danger" : "success"}
          caption="Billed − recorded payments"
        />
      </StatGrid>
      <div>
        <h3 className="mb-2 font-semibold">Installment schedule</h3>
        <ScheduleTable student={student} />
      </div>
      <div ref={paymentsSectionRef}>
        <h3 className="mb-2 font-semibold">Recorded payments</h3>
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
                          return `${installment?.label ?? "Installment"} ${formatINR(allocation.amount)}`;
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
      <div>
        <h3 className="mb-2 font-semibold">Reminder history</h3>
        {history.length === 0 ? (
          <EmptyState message="No reminders logged yet." />
        ) : (
          <ul className="space-y-2">
            {history.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap justify-between gap-x-4 rounded-md border p-2 text-xs"
              >
                <span>
                  {formatReminderDateTime(item.sentAt)} · {item.email || item.phone}
                </span>
                <span className="num">{formatINR(item.amountDue)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ReminderPrompt
        open={remind}
        onOpenChange={setRemind}
        rows={[reminderDetails(student, payments)]}
        onDone={() => toast.success("Reminder was logged. Nothing was sent.")}
      />
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

function ScheduleTable({ student }: { student: Student }) {
  const { payments } = useFinance();
  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Installment</TableHead>
            <TableHead>Due date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {installmentSchedule(student, studentPaid(student.id, payments), TODAY, payments).map(
            (i) => (
              <TableRow key={i.label}>
                <TableCell>{i.label}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(i.due)}</TableCell>
                <TableCell className="num whitespace-nowrap text-right">
                  {formatINR(i.amount)}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-right">
                  {formatINR(i.paid)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={i.status} />
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
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

function CreateBill({ onClose }: { onClose: () => void }) {
  const { courseCatalog, addStudent } = useFinance();
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
  };
  const [f, setF] = useState(empty);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [confirmClose, setConfirmClose] = useState(false);
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
    addStudent({
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
    toast.success(`Bill created for ${f.name.trim()}`);
    onClose();
  };
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && requestClose()}>
        <DialogContent className="flex max-h-[95vh] w-[90vw] max-w-[960px] flex-col gap-0 p-0 sm:max-w-[960px]">
          <DialogHeader className="px-6 pb-2 pt-5">
            <DialogTitle>Create student bill</DialogTitle>
          </DialogHeader>
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
                    onChange={(ev) => set("applicationId")(ev.target.value)}
                    placeholder="APP2026-###"
                  />
                </BillField>
                <BillField label={ADMISSION_NO_FULL}>
                  <Input
                    value="Pending — received from Administration"
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
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard this bill?"
        description="The details you entered will be lost."
        confirmLabel="Discard"
        onConfirm={onClose}
      />
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
                      .map(({ label, amount }) => `${label} ${formatINR(amount)}`)
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

function Installments() {
  const { workflowAction, workflowActionPersonId, workflowActionInstallmentId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { open: openRecordPayment } = useRecordPayment();
  const { feeWorkflow, saveFeeWorkflowHandoff, logInstallmentReminder, addInstallmentMeetingNote } =
    useFinance();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [followUp, setFollowUp] = useState("all");
  const [reminderRow, setReminderRow] = useState<{
    personId: string;
    installmentId: string;
    requestId: string;
  } | null>(null);
  const [meetingRow, setMeetingRow] = useState<{ personId: string; installmentId: string } | null>(
    null,
  );
  const [meetingNote, setMeetingNote] = useState("");
  const onMeetingEnterKeyDown = useEnterToNext();
  const [notifyPersonId, setNotifyPersonId] = useState<string | null>(null);
  useEffect(() => {
    if (!workflowAction || !workflowActionPersonId || !workflowActionInstallmentId) return;
    const person = feeWorkflow.persons.find((item) => item.id === workflowActionPersonId);
    const installment = person?.plan.find((item) => item.id === workflowActionInstallmentId);
    if (!person || !installment) return;
    if (workflowAction === "reminder") {
      setReminderRow({
        personId: person.id,
        installmentId: installment.id,
        requestId: `REM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
    } else if (workflowAction === "meeting") {
      setMeetingRow({ personId: person.id, installmentId: installment.id });
    }
    navigate({ search: { tab: "installments" } });
  }, [
    feeWorkflow.persons,
    navigate,
    workflowAction,
    workflowActionInstallmentId,
    workflowActionPersonId,
  ]);
  const reminderRequest = reminderRow
    ? feeWorkflow.persons
        .find((person) => person.id === reminderRow.personId)
        ?.plan.find((installment) => installment.id === reminderRow.installmentId)
    : undefined;
  const reminderPerson = reminderRow
    ? feeWorkflow.persons.find((person) => person.id === reminderRow.personId)
    : undefined;
  const reminderPayments = reminderPerson
    ? feeWorkflow.payments.filter((payment) => payment.personId === reminderPerson.id)
    : [];
  const reminderAmount = reminderRequest
    ? installmentOutstanding(reminderRequest, reminderPayments)
    : 0;
  const reminderEmail =
    reminderPerson && reminderRequest
      ? buildPaymentReminderEmail(
          { name: reminderPerson.name, email: reminderPerson.email, course: reminderPerson.course },
          reminderRequest.label,
          reminderAmount,
          reminderRequest.dueDate,
          "Finance & Accounts",
        )
      : null;
  const notifyPerson = feeWorkflow.persons.find((person) => person.id === notifyPersonId);
  const notificationPayload = notifyPerson
    ? buildPaymentNotificationPayload(notifyPerson, feeWorkflow.payments)
    : null;
  const rows = feeWorkflow.persons.flatMap((person) => {
    const payments = feeWorkflow.payments.filter((payment) => payment.personId === person.id);
    return person.plan
      .filter(
        (installment) =>
          installmentOutstanding(installment, payments) > 0 ||
          isRecentlyPaidInstallment(installment, payments),
      )
      .map((installment) => {
        const outstanding = installmentOutstanding(installment, payments);
        return {
          person,
          installment,
          payments,
          paid: installmentPaid(installment.id, payments),
          outstanding,
          status: installmentStatus(installment, payments),
          daysOverdue: outstanding > 0 ? installmentDaysOverdue(installment) : 0,
          followUp: installmentFollowUpStatus(installment, payments),
          classAccess: classAccess(person, payments),
        };
      });
  });
  const dueThisWeek = sum(
    rows
      .filter(
        (row) =>
          row.outstanding > 0 &&
          row.installment.dueDate >= TODAY &&
          row.followUp === "Reminder Due",
      )
      .map((row) => row.outstanding),
  );
  const overdueAmount = sum(
    rows.filter((row) => row.status === "Overdue").map((row) => row.outstanding),
  );
  const remindersSent = feeWorkflow.persons.reduce(
    (total, person) =>
      total + person.plan.reduce((count, installment) => count + installment.reminders.length, 0),
    0,
  );
  const inPersonPeople = new Set(
    rows
      .filter((row) => row.followUp === "In-Person Follow-Up Required")
      .map((row) => row.person.id),
  );
  const search = query.trim().toLowerCase();
  const filteredRows = rows
    .filter(
      (row) =>
        (!search ||
          `${row.person.name} ${row.person.applicationId} ${row.person.admissionNo ?? ""} ${row.installment.label}`
            .toLowerCase()
            .includes(search)) &&
        (status === "all" || row.status === status) &&
        (followUp === "all" || row.followUp === followUp),
    )
    .sort((left, right) => left.installment.dueDate.localeCompare(right.installment.dueDate));
  const confirmReminder = () => {
    if (!reminderRow || !reminderPerson || !reminderRequest || reminderAmount <= 0) {
      toast.error("This installment no longer has an outstanding balance.");
      setReminderRow(null);
      return;
    }
    if (
      reminderRequest.reminders.some((reminder) => reminder.id === reminderRow.requestId) ||
      reminderRequest.reminders.length >= MAX_REMINDERS
    ) {
      toast.error("This reminder has already been recorded or the reminder limit was reached.");
      setReminderRow(null);
      return;
    }
    logInstallmentReminder(reminderPerson.id, reminderRequest.id, {
      id: reminderRow.requestId,
      date: new Date().toISOString(),
      text: "Reminder sent (simulated)",
    });
    setReminderRow(null);
    toast.success("Reminder logged (simulated). No message was sent.");
  };
  const confirmPaymentNotification = () => {
    if (!notifyPerson || !notificationPayload?.payments.length) {
      toast.error("There are no unnotified payments to report.");
      setNotifyPersonId(null);
      return;
    }
    const existing = feeWorkflow.handoffs.find(
      (handoff) => handoff.personId === notifyPerson.id && handoff.target === "Administration",
    );
    const sentAt = new Date().toISOString();
    saveFeeWorkflowHandoff({
      personId: notifyPerson.id,
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
  const meetingPerson = feeWorkflow.persons.find((person) => person.id === meetingRow?.personId);
  const meetingInstallment = meetingPerson?.plan.find(
    (installment) => installment.id === meetingRow?.installmentId,
  );
  const saveMeetingNote = () => {
    if (!meetingPerson || !meetingInstallment || !meetingNote.trim()) return;
    addInstallmentMeetingNote(
      meetingPerson.id,
      meetingInstallment.id,
      `${new Date().toISOString()} — ${meetingNote.trim()}`,
    );
    setMeetingNote("");
    setMeetingRow(null);
    toast.success("Demo meeting follow-up note saved.");
  };
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-accent px-3.5 py-2 text-xs text-accent-foreground">
        Reminders, Administration notifications, and class access are simulated. No message is sent
        and the LMS is not changed; LMS enforcement needs a future integration.
      </p>
      <StatGrid>
        <StatCard label="Overdue amount" value={formatINR(overdueAmount)} tone="danger" />
        <StatCard label="Due this week" value={formatINR(dueThisWeek)} />
        <StatCard label="Reminders sent" value={String(remindersSent)} />
        <StatCard label="In-person follow-up" value={String(inPersonPeople.size)} />
      </StatGrid>
      <SectionCard>
        <FilterBar>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search person, ID or installment"
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={["Pending", "Partially Paid", "Paid", "Overdue"]}
          />
          <FilterSelect
            label="Follow-up"
            value={followUp}
            onChange={setFollowUp}
            options={["Reminder Due", "Reminder Sent", "In-Person Follow-Up Required"]}
          />
        </FilterBar>
        {filteredRows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Installment</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Days overdue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>Class access</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const isReminderActionAvailable =
                    row.outstanding > 0 &&
                    row.followUp !== "In-Person Follow-Up Required" &&
                    row.installment.reminders.length < MAX_REMINDERS;
                  const notificationAvailable =
                    !!row.person.admissionNo &&
                    row.classAccess === "Payment Cleared" &&
                    feeWorkflow.payments.some(
                      (payment) => payment.personId === row.person.id && !payment.adminNotified,
                    );
                  const identifier = row.person.admissionNo ?? row.person.applicationId;
                  return (
                    <TableRow key={`${row.person.id}-${row.installment.id}`}>
                      <TableCell className="min-w-40">
                        <span className="font-medium">{row.person.name}</span>
                        <span className="block whitespace-nowrap text-xs text-muted-foreground">
                          {identifier}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.installment.label}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">
                        {formatINR(row.installment.amountDue)}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right">
                        {formatINR(row.paid)}
                      </TableCell>
                      <TableCell
                        className={`num whitespace-nowrap text-right ${row.outstanding > 0 ? "font-medium text-destructive" : ""}`}
                      >
                        {formatINR(row.outstanding)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.installment.dueDate)}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap text-right">
                        {row.daysOverdue || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="min-w-48">
                        {row.followUp ? <StatusBadge status={row.followUp} /> : "—"}
                        {row.followUp === "In-Person Follow-Up Required" && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            In-Person Accounts Meeting Required
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="min-w-40">
                        {row.classAccess && (
                          <>
                            <StatusBadge status={row.classAccess} />
                            {row.classAccess === "On Hold" && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                LMS enforcement needs a future integration.
                              </p>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-max gap-1">
                          {row.outstanding > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRecordPayment(row.person.id)}
                            >
                              Record payment
                            </Button>
                          )}
                          {isReminderActionAvailable && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setReminderRow({
                                  personId: row.person.id,
                                  installmentId: row.installment.id,
                                  requestId: `REM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                })
                              }
                            >
                              Send reminder
                            </Button>
                          )}
                          {row.followUp === "In-Person Follow-Up Required" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setMeetingRow({
                                  personId: row.person.id,
                                  installmentId: row.installment.id,
                                });
                                setMeetingNote("");
                              }}
                            >
                              Add meeting note
                            </Button>
                          )}
                          {notificationAvailable && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setNotifyPersonId(row.person.id)}
                            >
                              Notify Administration
                            </Button>
                          )}
                        </div>
                        {row.installment.meetingNotes.length > 0 && (
                          <p className="mt-1 max-w-64 text-xs text-muted-foreground">
                            {row.installment.meetingNotes.at(-1)}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
      <Dialog open={!!reminderRow} onOpenChange={(open) => !open && setReminderRow(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send fee reminder (simulated)</DialogTitle>
          </DialogHeader>
          {reminderPerson && reminderRequest && reminderEmail && (
            <div className="space-y-3 text-sm">
              <p className="rounded-md bg-accent p-3 text-accent-foreground">
                Simulated, no message sent
              </p>
              <p>
                <strong>To:</strong> {reminderEmail.to || "Not provided"}
              </p>
              <p>
                <strong>Name:</strong> {reminderPerson.name}
              </p>
              <p>
                <strong>Course:</strong> {reminderPerson.course}
              </p>
              <p>
                <strong>Installment:</strong> {reminderRequest.label}
              </p>
              <p>
                <strong>Outstanding:</strong> {formatINR(reminderAmount)}
              </p>
              <p>
                <strong>Due date:</strong> {formatDate(reminderRequest.dueDate)}
              </p>
              <div className="rounded-md border bg-muted/40 p-3">{reminderEmail.body}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderRow(null)}>
              Cancel
            </Button>
            <Button onClick={confirmReminder} disabled={!reminderRequest || reminderAmount <= 0}>
              Confirm simulated reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!meetingRow} onOpenChange={(open) => !open && setMeetingRow(null)}>
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
            {meetingPerson && meetingInstallment && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Demo follow-up for {meetingPerson.name} · {meetingInstallment.label}. No meeting is
                  scheduled externally.
                </p>
                <Field label="Demo follow-up note" htmlFor="meeting-note">
                  <Input
                    id="meeting-note"
                    value={meetingNote}
                    onChange={(event) => setMeetingNote(event.target.value)}
                    placeholder="Add a note for Accounts"
                  />
                </Field>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMeetingRow(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!meetingNote.trim()}>
                Save demo note
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <PaymentNotificationDialog
        open={!!notifyPersonId}
        payload={notificationPayload}
        onOpenChange={(open) => !open && setNotifyPersonId(null)}
        onConfirm={confirmPaymentNotification}
      />
    </div>
  );
}
