import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/finance/common";
import { useFinance } from "@/finance/store";
import {
  buildPaymentConfirmationEmail,
  markPaymentConfirmationSent,
  personTotals,
} from "@/finance/feeWorkflow";
import { amountInWords, formatDate, formatINR } from "@/finance/logic";
import { studentCourse } from "@/finance/courses";
import { receiptFigures } from "@/finance/receipt";
import type { FeeWorkflowPayment } from "@/finance/types";
import { PAYMENT_TOWARDS, type FeePayment, type PaymentMethod } from "@/finance/types";

const MODES: { label: string; methods: PaymentMethod[] }[] = [
  { label: "Cash", methods: ["Cash"] },
  { label: "UPI", methods: ["UPI"] },
  { label: "Cheque", methods: ["Cheque"] },
  { label: "Bank transfer", methods: ["Bank Transfer"] },
];

function Box({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span className="receipt-option">
      <span className="receipt-box" aria-hidden>
        {checked ? "✓" : ""}
      </span>
      <span>{label}</span>
      <span className="sr-only">{checked ? "(selected)" : ""}</span>
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="receipt-row">
      <span className="receipt-label">{label}</span>
      <span className="receipt-value">{children}</span>
    </div>
  );
}

function printReceipt() {
  const root = document.documentElement;
  const done = () => {
    root.classList.remove("printing-fee-receipt");
    window.removeEventListener("afterprint", done);
  };
  root.classList.add("printing-fee-receipt");
  window.addEventListener("afterprint", done);
  window.print();
}

export function Receipt({
  payment,
  workflowPayment,
  onClose,
  startEmailPreview = false,
  sendDetailsPrompt = false,
  onSendDetails,
}: {
  payment?: FeePayment;
  workflowPayment?: FeeWorkflowPayment;
  onClose?: () => void;
  startEmailPreview?: boolean;
  sendDetailsPrompt?: boolean;
  onSendDetails?: () => void;
}) {
  const finance = useFinance();
  if (workflowPayment)
    return (
      <WorkflowReceipt
        payment={workflowPayment}
        onClose={onClose}
        startEmailPreview={startEmailPreview}
        sendDetailsPrompt={sendDetailsPrompt}
        onSendDetails={onSendDetails}
      />
    );
  if (!payment) return null;
  const mirroredWorkflowPayment = finance.feeWorkflow.payments.find(
    (item) => item.id === payment.id,
  );
  if (mirroredWorkflowPayment)
    return (
      <WorkflowReceipt
        payment={mirroredWorkflowPayment}
        onClose={onClose}
        startEmailPreview={startEmailPreview}
        sendDetailsPrompt={sendDetailsPrompt}
        onSendDetails={onSendDetails}
      />
    );
  const { students, payments, courseCatalog } = finance;
  const s = students.find((x) => x.id === payment.studentId);
  if (!s) return null;
  const { balance, nextDue } = receiptFigures(s, payment, payments);
  const course = studentCourse(s, courseCatalog)?.name ?? s.course;
  const courseLine = [s.track ? `${course} · ${s.track}` : course, s.batch]
    .filter(Boolean)
    .join(" / ");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="print-area fee-receipt-print receipt-paper min-h-0 flex-1 overflow-y-auto p-6">
        <h2 className="receipt-title">FEE RECEIPT</h2>
        <div className="receipt-top">
          <span>
            <span className="receipt-accent">Receipt No.:</span>{" "}
            <span className="num">{payment.receiptNo}</span>
          </span>
          <span>
            <span className="receipt-accent">Date:</span> {formatDate(payment.date)}
          </span>
        </div>
        <Row label="Student Name">{s.name}</Row>
        <Row label="Admission No.">{s.regNo}</Row>
        <Row label="Course / Batch">{courseLine}</Row>
        <Row label="Payment towards">
          <span className="receipt-options">
            {PAYMENT_TOWARDS.map((t) => (
              <Box key={t} label={t} checked={payment.towards === t} />
            ))}
            {payment.towards === "Other" && payment.towardsOther ? (
              <span>: {payment.towardsOther}</span>
            ) : null}
          </span>
        </Row>
        <h3 className="receipt-section receipt-accent">PAYMENT DETAILS</h3>
        <Row label="Amount received (Rs.)">
          <span className="num">{formatINR(payment.amount)}</span>
        </Row>
        <Row label="Amount in words">{amountInWords(payment.amount)}</Row>
        <Row label="Payment mode">
          <span className="receipt-options">
            {MODES.map((m) => (
              <Box key={m.label} label={m.label} checked={m.methods.includes(payment.method)} />
            ))}
          </span>
        </Row>
        {payment.reference && (
          <Row label="Transaction reference">{payment.reference}</Row>
        )}
        <Row label="Balance fee after this payment (Rs.)">
          <span className="num">{formatINR(balance)}</span>
        </Row>
        <Row label="Next due date">{nextDue ? formatDate(nextDue) : "—"}</Row>
        <div className="receipt-signs">
          <span className="receipt-sign">Received by</span>
          <span className="receipt-sign">Student signature</span>
        </div>
      </div>
      <div className="no-print flex shrink-0 justify-end gap-2 border-t px-6 py-4">
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
        <Button onClick={printReceipt}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>
    </div>
  );
}

function WorkflowReceipt({
  payment,
  onClose,
  startEmailPreview,
  sendDetailsPrompt,
  onSendDetails,
}: {
  payment: FeeWorkflowPayment;
  onClose?: () => void;
  startEmailPreview: boolean;
  sendDetailsPrompt: boolean;
  onSendDetails?: (() => void) | undefined;
}) {
  const { feeWorkflow, updateFeeWorkflowPayment } = useFinance();
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (startEmailPreview) setPreviewOpen(true);
  }, [startEmailPreview]);
  const person = feeWorkflow.persons.find((item) => item.id === payment.personId);
  if (!person) return null;
  const allPayments = feeWorkflow.payments
    .filter((item) => item.personId === person.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const paymentIndex = allPayments.findIndex((item) => item.id === payment.id);
  const paymentsThroughReceipt =
    paymentIndex < 0 ? [...allPayments, payment] : allPayments.slice(0, paymentIndex + 1);
  const figures = personTotals(person, paymentsThroughReceipt);
  const email = buildPaymentConfirmationEmail(person, payment, feeWorkflow.payments);
  const covered = payment.allocations.map((allocation) => ({
    ...allocation,
    label:
      person.plan.find((installment) => installment.id === allocation.installmentId)?.label ??
      "Installment",
  }));
  const send = () => {
    if (payment.confirmation.status === "Sent (simulated)" || !person.email.trim()) return;
    const sentAt = new Date().toISOString();
    updateFeeWorkflowPayment(markPaymentConfirmationSent(payment, sentAt));
    setPreviewOpen(false);
    toast.success("Payment confirmation sent (simulated)");
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="print-area fee-receipt-print receipt-paper min-h-0 flex-1 overflow-y-auto p-6">
        <h2 className="receipt-title">FEE RECEIPT</h2>
        <div className="receipt-top">
          <span>
            <span className="receipt-accent">Receipt No.:</span>{" "}
            <span className="num">{payment.receiptNo}</span>
          </span>
          <span>
            <span className="receipt-accent">Date:</span> {formatDate(payment.date)}
          </span>
        </div>
        <Row label="Student Name">{person.name}</Row>
        <Row label="Admission No.">{person.admissionNo ?? <StatusBadge status="Pending" />}</Row>
        <Row label="Course / Batch">{person.course}</Row>
        <Row label="Amount received (Rs.)">
          <span className="num">{formatINR(payment.amount)}</span>
        </Row>
        <Row label="Amount in words">{amountInWords(payment.amount)}</Row>
        <Row label="Payment mode">{payment.method}</Row>
        {payment.reference && (
          <Row label="Transaction reference">{payment.reference}</Row>
        )}
        <Row label="Installment(s) covered">
          <span>
            {covered
              .map((allocation) => `${allocation.label}: ${formatINR(allocation.amount)}`)
              .join(" · ") || "—"}
          </span>
        </Row>
        <Row label="Balance fee after this payment (Rs.)">
          <span className="num">{formatINR(figures.outstanding)}</span>
        </Row>
        <Row label="Next installment due">
          {figures.nextDueInstallment
            ? `${figures.nextDueInstallment.label} · ${formatDate(figures.nextDueInstallment.dueDate)}`
            : "—"}
        </Row>
        <div className="receipt-signs">
          <span className="receipt-sign">Received by</span>
          <span className="receipt-sign">Student signature</span>
        </div>
      </div>
      {sendDetailsPrompt && onSendDetails && (
        <div className="no-print flex flex-col gap-3 border-t bg-accent px-4 py-4 text-sm text-accent-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Payment recorded. Send the application details to Administration?</p>
          <Button variant="outline" onClick={onSendDetails}>
            Send to Administration
          </Button>
        </div>
      )}
      <div className="no-print flex shrink-0 flex-wrap justify-end gap-2 border-t px-4 py-4 sm:px-6">
        {payment.confirmation.status === "Not sent" ? (
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            Email confirmation to student
          </Button>
        ) : (
          <StatusBadge status={payment.confirmation.status} />
        )}
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
        <Button onClick={printReceipt}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment confirmation email preview (simulated)</DialogTitle>
          </DialogHeader>
          <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
            Simulated, no email sent
          </p>
          <div className="space-y-3 text-sm">
            <p>
              <strong>To:</strong> {email.to || "No student email is recorded"}
            </p>
            <p>
              <strong>Subject:</strong> {email.subject}
            </p>
            <div>
              <strong>Body:</strong>
              <pre className="mt-1 whitespace-pre-wrap rounded-md border bg-muted p-3 font-sans">
                {email.body}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Later
            </Button>
            <Button
              disabled={!email.to.trim() || payment.confirmation.status !== "Not sent"}
              onClick={send}
            >
              Send confirmation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
