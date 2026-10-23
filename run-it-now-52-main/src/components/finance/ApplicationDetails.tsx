import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR } from "@/finance/logic";
import type { AdministrationDetailsSnapshot, Installment } from "@/finance/types";

export function ApplicationDetail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

export function ApplicationDetails({
  snapshot,
  plan,
}: {
  snapshot: AdministrationDetailsSnapshot;
  plan?: Installment[];
}) {
  const details = snapshot.applicationForm;
  const shown = (value: string | undefined | null) => (value?.trim() ? value : "Not provided");
  const address = details
    ? [details.addressLine1, details.addressLine2, details.city, details.state, details.postalCode]
        .filter((value) => typeof value === "string" && value.trim())
        .join(", ")
    : "";
  const documents = [
    ["Identity proof", details?.documents?.identityProof],
    ["Academic records", details?.documents?.academicRecords],
    ["Photograph", details?.documents?.photograph],
    ["Resume", details?.documents?.resume],
  ] as const;
  const educationRows =
    details?.educationWorkExperience
      ?.toString()
      .split(/\r?\n/)
      .filter((item) => item.length > 0) ?? [];
  const installmentPreference = details?.installmentPreference;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-semibold">1. Personal details</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <ApplicationDetail label="Name" value={shown(snapshot.name)} />
          <ApplicationDetail label="Date of birth" value={shown(details?.dateOfBirth)} />
          <ApplicationDetail label="Age" value="Not provided" />
          <ApplicationDetail label="Gender" value="Not provided" />
          <ApplicationDetail label="Mobile" value={shown(snapshot.contact)} />
          <ApplicationDetail label="Email" value={shown(snapshot.email)} />
          <ApplicationDetail label="Address" value={shown(address)} />
        </dl>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">2. Guardian details</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <ApplicationDetail label="Name" value={shown(details?.guardianName)} />
          <ApplicationDetail label="Relationship" value={shown(details?.guardianRelationship)} />
          <ApplicationDetail label="Mobile" value={shown(details?.guardianPhone)} />
          <ApplicationDetail label="Email" value={shown(details?.guardianEmail)} />
        </dl>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">3. Educational qualification / work experience</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Qualification / work experience</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(educationRows.length > 0 ? educationRows : ["Not provided"]).map((row, index) => (
              <TableRow key={`${index}-${row}`}>
                <TableCell className="whitespace-pre-wrap">{row}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">4. Lead source and reference</h3>
        <div className="flex flex-wrap gap-2">
          {[shown(details?.leadSource), shown(details?.leadReference)].map((value, index) => (
            <span
              key={`${index}-${value}`}
              className="inline-flex rounded-full border bg-muted px-2.5 py-1 text-xs"
            >
              {value}
            </span>
          ))}
        </div>
        <ApplicationDetail label="More details" value="Not provided" />
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">5. Course preference</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <ApplicationDetail label="Course" value={shown(details?.coursePreference)} />
          <ApplicationDetail
            label="Fee plan preferred"
            value={
              plan?.length
                ? plan.map((installment) => installment.label).join(", ")
                : "Not provided"
            }
          />
          <ApplicationDetail
            label="Instalments"
            value={
              installmentPreference === undefined
                ? "Not provided"
                : installmentPreference > 1
                  ? "Yes"
                  : "No"
            }
          />
          <ApplicationDetail
            label="Preferred number"
            value={
              installmentPreference === undefined ? "Not provided" : String(installmentPreference)
            }
          />
        </dl>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">6. Documents enclosed</h3>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {documents.map(([name, checked]) => (
            <li
              key={name}
              className={`rounded-md border px-3 py-2 ${checked ? "" : "text-destructive"}`}
            >
              {name}:{" "}
              {checked === undefined ? "Not provided" : checked ? "Enclosed" : "Not provided"}
              {!checked && checked !== undefined ? " (missing)" : ""}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">7. Declaration</h3>
        <p className="text-sm">
          {details?.declarationAccepted === undefined
            ? "Not provided"
            : details.declarationAccepted
              ? "Accepted"
              : "Not accepted"}
        </p>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Payment summary at send time</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Receipt No.</TableHead>
              <TableHead>Instalments covered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.paymentSummary.payments.length ? (
              snapshot.paymentSummary.payments.map((payment, index) => (
                <TableRow key={`${payment.receiptNo}-${index}`}>
                  <TableCell className="whitespace-nowrap">{payment.date}</TableCell>
                  <TableCell className="num whitespace-nowrap">
                    {formatINR(payment.amount)}
                  </TableCell>
                  <TableCell>{payment.method}</TableCell>
                  <TableCell className="whitespace-nowrap">{payment.receiptNo}</TableCell>
                  <TableCell>
                    {payment.installmentsCovered
                      .map(({ label, amount }) => `${label} (${formatINR(amount)})`)
                      .join(", ") || "Not provided"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5}>No payments recorded</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <ApplicationDetail
            label="Total paid"
            value={formatINR(snapshot.paymentSummary.totalPaid)}
          />
          <ApplicationDetail
            label="Instalments paid"
            value={String(snapshot.paymentSummary.installmentsPaid)}
          />
          <ApplicationDetail
            label="Outstanding"
            value={formatINR(snapshot.paymentSummary.outstanding)}
          />
        </dl>
      </section>
    </div>
  );
}
