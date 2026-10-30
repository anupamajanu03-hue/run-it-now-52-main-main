import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdministrationHistory } from "@/components/finance/AdministrationHistory";
import { ApplicationDetails } from "@/components/finance/ApplicationDetails";
import {
  buildAdministrationDetailsPayload,
  recordAdministrationDetailsSent,
} from "@/finance/feeWorkflow";
import { formatINR } from "@/finance/logic";
import type { FeeWorkflowPayment, Person } from "@/finance/types";

const person: Person = {
  id: "p1",
  name: "Test Student",
  contact: "9845000000",
  email: "test.student@example.com",
  course: "Python",
  appliedOn: "2026-10-01",
  applicationId: "APP2026-001",
  applicationStatus: "Reviewed",
  plan: [
    {
      id: "registration",
      label: "Registration",
      amountDue: 100,
      dueDate: "2026-10-01",
      reminders: [],
      meetingNotes: [],
    },
    {
      id: "installment-1",
      label: "Installment 1",
      amountDue: 100,
      dueDate: "2026-11-01",
      reminders: [],
      meetingNotes: [],
    },
  ],
  adminNotifiedOfClearance: false,
};

function payment(
  id: string,
  date: string,
  amount: number,
  installmentId: string,
): FeeWorkflowPayment {
  return {
    id,
    personId: person.id,
    amount,
    date,
    method: "UPI",
    reference: "",
    receiptNo: id,
    allocations: [{ installmentId, amount }],
    adminNotified: false,
    confirmation: { status: "Not sent" },
  };
}

describe("Administration history", () => {
  it("renders derived age and documents, and handles an absent photo", () => {
    const snapshot = buildAdministrationDetailsPayload(
      { ...person, applicationDetails: {
        dateOfBirth: "2000-01-01", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "",
        guardianName: "", guardianRelationship: "", guardianPhone: "", guardianEmail: "", educationWorkExperience: "",
        leadSource: "", leadReference: "", coursePreference: "Python", installmentPreference: 1,
        documents: [{ type: "ID proof", fileName: "id-proof.pdf", provided: true }, { type: "TC", provided: false }],
        documentsEnclosed: ["ID proof"], declarationAccepted: false,
      } },
      [],
    );
    render(<ApplicationDetails snapshot={snapshot} />);
    expect(screen.getByText(/id-proof\.pdf/)).toBeInTheDocument();
    expect(screen.getByText("Provided")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0);
    expect(screen.getByText("Photo not provided")).toBeInTheDocument();
    expect(screen.getByText(String(new Date().getFullYear() - 2000))).toBeInTheDocument();
  });

  it("shows the sent snapshot after a later payment without using current payment data", async () => {
    const sentPayment = payment("payment-1", "2026-10-02", 100, "registration");
    const laterPayment = payment("payment-2", "2026-10-03", 50, "installment-1");
    const handoffs = recordAdministrationDetailsSent([], person, [sentPayment], "2026-10-02");
    const currentSnapshot = buildAdministrationDetailsPayload(
      person,
      [sentPayment, laterPayment],
      "2026-10-03",
    );

    expect(currentSnapshot.paymentSummary.totalPaid).toBe(150);
    render(<AdministrationHistory personId={person.id} handoffs={handoffs} />);

    fireEvent.click(screen.getByRole("button", { name: "View sent details" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(formatINR(100));
    expect(dialog).not.toHaveTextContent(formatINR(currentSnapshot.paymentSummary.totalPaid));
  });
});
