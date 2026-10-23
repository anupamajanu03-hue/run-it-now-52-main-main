import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ApplicationDetails } from "@/components/finance/ApplicationDetails";
import { RecordPaymentContext } from "@/components/finance/RecordPaymentContext";
import { Receipt } from "@/components/finance/Receipt";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConfirmDialog,
  EmptyState,
  Field,
  SectionCard,
  SimpleSelect,
  StatCard,
  StatGrid,
  StatusBadge,
} from "@/components/finance/common";
import { useFinance } from "@/finance/store";
import {
  allocatePayment,
  buildAdministrationDetailsPayload,
  hasAdministrationDetailsEvent,
  hasDuplicatePaymentReference,
  installmentOutstanding,
  installmentPaid,
  installmentStatus,
  isEligibleNow,
  personTotals,
} from "@/finance/feeWorkflow";
import {
  ADMINISTRATION_DETAILS_SENT_TEXT,
  REQUIRE_APPLICATION_REVIEW,
} from "@/finance/feeWorkflowConfig";
import { TODAY, formatDate, formatINR } from "@/finance/logic";
import { PAYMENT_METHODS, type FeeWorkflowPayment, type PaymentMethod } from "@/finance/types";

export function RecordPaymentProvider({ children }: { children: ReactNode }) {
  const { feeWorkflow } = useFinance();
  const [personId, setPersonId] = useState<string | null | undefined>(null);
  const open = (requestedPersonId?: string) => {
    if (
      requestedPersonId &&
      !feeWorkflow.persons.some((person) => person.id === requestedPersonId)
    ) {
      toast.error("Select a person before recording payment.");
      return;
    }
    setPersonId(requestedPersonId);
  };
  const close = () => setPersonId(null);

  return (
    <RecordPaymentContext.Provider value={{ open }}>
      {children}
      <RecordPaymentDialog personId={personId} onSelectPerson={setPersonId} onClose={close} />
    </RecordPaymentContext.Provider>
  );
}

function RecordPaymentDialog({
  personId,
  onSelectPerson,
  onClose,
}: {
  personId: string | null | undefined;
  onSelectPerson: (personId: string) => void;
  onClose: () => void;
}) {
  const {
    feeWorkflow,
    payments: billingPayments,
    transactions,
    settings,
    recordFeeWorkflowPayment,
    sendFeeWorkflowDetailsToAdministration,
  } = useFinance();
  const usedReceiptNumbers = new Set([
    ...billingPayments.map((payment) => payment.receiptNo),
    ...feeWorkflow.payments.map((payment) => payment.receiptNo),
    ...transactions.flatMap((transaction) =>
      [transaction.receiptNo, transaction.reference].filter(
        (receiptNo): receiptNo is string => !!receiptNo,
      ),
    ),
  ]);
  let nextReceiptNumber = settings.receipt.next;
  while (usedReceiptNumbers.has(`${settings.receipt.prefix}${nextReceiptNumber}`)) {
    nextReceiptNumber += 1;
  }
  const receiptNo = `${settings.receipt.prefix}${nextReceiptNumber}`;
  const [form, setForm] = useState({
    amount: "",
    date: TODAY,
    method: "" as PaymentMethod | "",
    reference: "",
    target: "auto",
  });
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<FeeWorkflowPayment | null>(null);
  const [sendDetailsPrompt, setSendDetailsPrompt] = useState(false);
  const [sendPreviewOpen, setSendPreviewOpen] = useState(false);
  const recording = useRef(false);
  const person = feeWorkflow.persons.find((item) => item.id === personId);
  const payments = feeWorkflow.payments.filter((payment) => payment.personId === personId);
  const totals = person ? personTotals(person, payments) : null;
  useEffect(() => {
    setForm({ amount: "", date: TODAY, method: "", reference: "", target: "auto" });
    setReceipt(null);
    setSendDetailsPrompt(false);
    setSendPreviewOpen(false);
    setConfirm(false);
    setError("");
  }, [personId]);
  const amount = Number(form.amount) || 0;
  const preview =
    person && totals && amount > 0 && amount <= totals.outstanding
      ? allocatePayment(
          person.plan,
          payments,
          amount,
          form.target === "auto" ? undefined : form.target,
        )
      : [];
  const previewText =
    person && preview.length > 0
      ? preview
          .map((allocation) => {
            const installment = person.plan.find((item) => item.id === allocation.installmentId);
            const wasOutstanding = installment ? installmentOutstanding(installment, payments) : 0;
            return `${installment?.label ?? "Installment"} ${formatINR(allocation.amount)}${allocation.amount >= wasOutstanding ? " (settles it)" : ""}`;
          })
          .join(" + ")
      : "Enter a valid amount to preview allocation.";
  const set = (key: keyof typeof form) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  };
  const validate = () => {
    if (!person || !totals) return "Select a person.";
    if (!(amount > 0)) return "Enter an amount greater than zero.";
    if (amount > totals.outstanding)
      return `Amount cannot exceed the outstanding balance (${formatINR(totals.outstanding)}).`;
    if (!form.date || form.date > TODAY) return "Choose a valid payment date.";
    if (!form.method) return "Choose a payment method.";
    if (form.method !== "Cash" && !form.reference.trim())
      return "Reference is required for non-cash payments.";
    if (
      form.reference &&
      hasDuplicatePaymentReference(person.id, form.reference, feeWorkflow.payments)
    )
      return "This reference number is already recorded for this person.";
    return "";
  };
  const startSave = (event: FormEvent) => {
    event.preventDefault();
    const message = validate();
    setError(message);
    if (!message) setConfirm(true);
  };
  const save = () => {
    if (!person || recording.current) return;
    if (REQUIRE_APPLICATION_REVIEW && person.applicationStatus === "Received") return;
    const message = validate();
    if (message) {
      setError(message);
      setConfirm(false);
      return;
    }
    recording.current = true;
    setSaving(true);
    const eligibleBeforePayment = isEligibleNow(person, payments, feeWorkflow.handoffs);
    const created = recordFeeWorkflowPayment({
      personId: person.id,
      amount,
      date: form.date,
      method: form.method as PaymentMethod,
      reference: form.reference.trim(),
      receiptNo,
      allocations: allocatePayment(
        person.plan,
        payments,
        amount,
        form.target === "auto" ? undefined : form.target,
      ),
      confirmation: { status: "Not sent" },
    });
    setReceipt(created);
    const eligibleAfterPayment = isEligibleNow(
      person,
      [...payments, created],
      feeWorkflow.handoffs,
    );
    if (!eligibleBeforePayment && eligibleAfterPayment) setSendDetailsPrompt(true);
    setConfirm(false);
    setForm((current) => ({ ...current, amount: "", reference: "" }));
    setError("");
    toast.success(`Payment recorded · ${created.receiptNo}`);
    window.setTimeout(() => {
      recording.current = false;
      setSaving(false);
    }, 0);
  };
  const selectedReceipt = receipt
    ? (feeWorkflow.payments.find((item) => item.id === receipt.id) ?? receipt)
    : null;
  const sendPreviewPayload =
    person && sendDetailsPrompt && !hasAdministrationDetailsEvent(person.id, feeWorkflow.handoffs)
      ? buildAdministrationDetailsPayload(person, feeWorkflow.payments)
      : null;
  const confirmDetailsSend = () => {
    if (!person || !sendDetailsPrompt || !sendPreviewPayload) {
      toast.error("Application details are not ready to send.");
      setSendPreviewOpen(false);
      return;
    }
    if (hasAdministrationDetailsEvent(person.id, feeWorkflow.handoffs)) {
      toast.error("These application details have already been sent.");
      setSendDetailsPrompt(false);
      setSendPreviewOpen(false);
      return;
    }
    sendFeeWorkflowDetailsToAdministration(person.id);
    setSendDetailsPrompt(false);
    setSendPreviewOpen(false);
    toast.success(ADMINISTRATION_DETAILS_SENT_TEXT);
  };

  const resetAndClose = () => {
    onClose();
    setForm({ amount: "", date: TODAY, method: "", reference: "", target: "auto" });
    setReceipt(null);
    setSendDetailsPrompt(false);
    setSendPreviewOpen(false);
    setConfirm(false);
    setError("");
  };

  return (
    <>
      <Dialog
        open={personId !== null}
        onOpenChange={(open) => {
          if (!open) resetAndClose();
        }}
      >
        <DialogContent className="flex max-h-[95dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="shrink-0 border-b bg-background px-4 py-4 pr-12 sm:px-6">
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          {personId === undefined ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <SectionCard title="Select person">
                  <Select onValueChange={onSelectPerson}>
                    <SelectTrigger aria-label="Select person" className="w-full">
                      <SelectValue placeholder="Choose a person" />
                    </SelectTrigger>
                    <SelectContent>
                      {feeWorkflow.persons.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} ·{" "}
                          {item.admissionStatus === "Admitted" ||
                          item.applicationStatus === "Admitted"
                            ? `Admission No.: ${item.admissionNo ?? "Pending"}`
                            : item.applicationId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SectionCard>
              </div>
              <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
                <Button variant="outline" onClick={resetAndClose}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          ) : !person || !totals ? (
            <div className="p-6">
              <EmptyState message="Person was not found." />
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                <SectionCard title={person.name}>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span>
                      {person.admissionStatus === "Admitted" ||
                      person.applicationStatus === "Admitted"
                        ? `Admission No.: ${person.admissionNo ?? "Pending"}`
                        : `Application ID: ${person.applicationId}`}
                    </span>
                    <span>{person.email || "Email: Not provided"}</span>
                    <span>{person.course}</span>
                  </div>
                </SectionCard>
                <StatGrid>
                  <StatCard label="Fee payable" value={formatINR(totals.payable)} />
                  <StatCard label="Paid so far" value={formatINR(totals.paid)} tone="success" />
                  <StatCard
                    label="Outstanding"
                    value={formatINR(totals.outstanding)}
                    tone={totals.outstanding > 0 ? "danger" : "success"}
                  />
                  <StatCard
                    label="Next due"
                    value={
                      totals.nextDueInstallment
                        ? formatDate(totals.nextDueInstallment.dueDate)
                        : "—"
                    }
                    caption={totals.nextDueInstallment?.label ?? "No balance due"}
                  />
                </StatGrid>
                {sendDetailsPrompt && (
                  <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-accent p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <p>Payment recorded. Send the application details to Administration?</p>
                    <Button
                      variant="outline"
                      onClick={() => setSendPreviewOpen(true)}
                      disabled={hasAdministrationDetailsEvent(person.id, feeWorkflow.handoffs)}
                    >
                      Review send preview
                    </Button>
                  </div>
                )}
                <SectionCard title="Installment schedule">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="p-2">Installment</th>
                          <th className="p-2">Due date</th>
                          <th className="p-2 text-right">Amount</th>
                          <th className="p-2 text-right">Paid</th>
                          <th className="p-2 text-right">Outstanding</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {person.plan.map((installment) => (
                          <tr key={installment.id} className="border-b last:border-0">
                            <td className="p-2">{installment.label}</td>
                            <td className="whitespace-nowrap p-2">
                              {formatDate(installment.dueDate)}
                            </td>
                            <td className="num whitespace-nowrap p-2 text-right">
                              {formatINR(installment.amountDue)}
                            </td>
                            <td className="num whitespace-nowrap p-2 text-right">
                              {formatINR(installmentPaid(installment.id, payments))}
                            </td>
                            <td className="num whitespace-nowrap p-2 text-right">
                              {formatINR(installmentOutstanding(installment, payments))}
                            </td>
                            <td className="p-2">
                              <StatusBadge status={installmentStatus(installment, payments)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
                <SectionCard title="Payment details">
                  {REQUIRE_APPLICATION_REVIEW && person.applicationStatus === "Received" ? (
                    <p className="text-sm text-muted-foreground">
                      Review this application before recording payment.
                    </p>
                  ) : totals.outstanding <= 0 ? (
                    <p className="text-sm text-success">This fee plan is fully paid.</p>
                  ) : (
                    <form id="record-payment-form" onSubmit={startSave} className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Field label="Receipt No." htmlFor="record-payment-receipt">
                          <Input
                            id="record-payment-receipt"
                            value={receiptNo}
                            readOnly
                          />
                        </Field>
                        <Field label="Amount (₹)" htmlFor="record-payment-amount">
                          <Input
                            id="record-payment-amount"
                            type="number"
                            step="0.01"
                            value={form.amount}
                            onChange={(event) => set("amount")(event.target.value)}
                          />
                        </Field>
                        <Field label="Date" htmlFor="record-payment-date">
                          <Input
                            id="record-payment-date"
                            type="date"
                            value={form.date}
                            onChange={(event) => set("date")(event.target.value)}
                          />
                        </Field>
                        <Field label="Method" htmlFor="record-payment-method">
                          <SimpleSelect
                            id="record-payment-method"
                            value={form.method}
                            onChange={(value) => set("method")(value)}
                            options={PAYMENT_METHODS.filter(
                              (method) => settings.paymentMethods[method],
                            )}
                          />
                        </Field>
                        <Field label="Transaction reference no." htmlFor="record-payment-reference">
                          <>
                            <Input
                              id="record-payment-reference"
                              value={form.reference}
                              onChange={(event) => set("reference")(event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                              UPI transaction ID, cheque number or bank reference
                            </p>
                          </>
                        </Field>
                        <Field label="Pay toward" htmlFor="record-payment-target">
                          <Select value={form.target} onValueChange={set("target")}>
                            <SelectTrigger id="record-payment-target">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto (oldest unpaid)</SelectItem>
                              {person.plan.map((item) => (
                                <SelectItem
                                  key={item.id}
                                  value={item.id}
                                  disabled={installmentOutstanding(item, payments) === 0}
                                >
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <div className="rounded-md border bg-muted/50 p-3 text-sm">
                        <span className="font-medium">Allocation preview:</span> {previewText}
                      </div>
                      {error && (
                        <p role="alert" className="text-sm text-destructive">
                          {error}
                        </p>
                      )}
                    </form>
                  )}
                </SectionCard>
              </div>
              <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
                <Button variant="outline" onClick={resetAndClose}>
                  Close
                </Button>
                {person &&
                  totals &&
                  (!REQUIRE_APPLICATION_REVIEW || person.applicationStatus !== "Received") &&
                  totals.outstanding > 0 && (
                    <Button type="submit" form="record-payment-form" disabled={saving}>
                      Record payment
                    </Button>
                  )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Record this payment?"
        confirmLabel="Record payment"
        description={
          person && (
            <span>
              {formatINR(amount)} from {person.name} via {form.method}. {previewText}
            </span>
          )
        }
        onConfirm={save}
      />
      <Dialog
        open={!!selectedReceipt}
        onOpenChange={(open) => {
          if (!open) setReceipt(null);
        }}
      >
        <DialogContent className="flex max-h-[95vh] w-[calc(100vw-2rem)] max-w-[900px] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
            <DialogTitle>Receipt {selectedReceipt?.receiptNo}</DialogTitle>
          </DialogHeader>
          {selectedReceipt && (
            <Receipt
              workflowPayment={selectedReceipt}
              sendDetailsPrompt={sendDetailsPrompt}
              onSendDetails={() => setSendPreviewOpen(true)}
              onClose={() => setReceipt(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={sendPreviewOpen} onOpenChange={setSendPreviewOpen}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="sticky top-0 z-10 shrink-0 border-b bg-background px-4 py-4 pr-14 text-left sm:px-6">
            <DialogTitle>Send application details to Administration (simulated)</DialogTitle>
          </DialogHeader>
          {sendPreviewPayload && person && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <ApplicationDetails snapshot={sendPreviewPayload} plan={person.plan} />
            </div>
          )}
          <DialogFooter className="sticky bottom-0 z-10 shrink-0 gap-2 border-t bg-background px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => setSendPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmDetailsSend}
              disabled={!sendPreviewPayload || !sendDetailsPrompt}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
