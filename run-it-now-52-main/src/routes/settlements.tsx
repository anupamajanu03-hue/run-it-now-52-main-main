import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ConfirmDialog, EmptyState, Field, FilterBar, FilterSelect, PageHeader, SampleNote, SectionCard, SimpleSelect, StatCard, StatGrid, StatusBadge, tabSearch,
} from "@/components/finance/common";
import { useFinance } from "@/finance/store";
import { TODAY, formatDate, formatINR, recordedFor, settlementStatus } from "@/finance/logic";
import { PAYMENT_METHODS, type PaymentMethod, type Settlement } from "@/finance/types";
import { useEnterToNext } from "@/hooks/use-enter-to-next";

export const Route = createFileRoute("/settlements")({
  validateSearch: tabSearch,
  head: () => ({
    meta: [
      { title: "Daily Settlements — Finance & Accounts" },
      { name: "description", content: "Reconcile recorded payments with counted cash and reported settlement amounts." },
      { property: "og:title", content: "Daily Settlements — Finance & Accounts" },
      { property: "og:description", content: "Reconcile recorded payments with counted cash and reported settlement amounts." },
    ],
  }),
  component: SettlementsPage,
});

const LABEL: Record<string, string> = { overview: "Settlement Overview", reconciliation: "Reconciliation", history: "Settlement History" };

function Explain({ s }: { s: Pick<Settlement, "recorded" | "actual" | "method"> }) {
  if (s.actual === null) return null;
  const diff = s.actual - s.recorded;
  if (diff === 0) return (
    <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Amounts match</AlertTitle><AlertDescription>Recorded and actual amounts agree.</AlertDescription></Alert>
  );
  return (
    <Alert variant="destructive"><AlertTriangle className="h-4 w-4" />
      <AlertTitle>{diff < 0 ? "Short" : "Over"} by {formatINR(Math.abs(diff))}</AlertTitle>
      <AlertDescription>
        Recorded {s.method} receipts total {formatINR(s.recorded)}, but the {s.method === "Cash" ? "counted cash" : "reported settlement"} is {formatINR(s.actual)}.
        Check for missing entries, provider fees or counting errors and add a note before finalizing.
      </AlertDescription>
    </Alert>
  );
}

function SettlementTable({ rows, onReview }: { rows: Settlement[]; onReview?: (s: Settlement) => void }) {
  if (rows.length === 0) return <EmptyState />;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Txns</TableHead><TableHead className="text-right">Recorded</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right">Difference</TableHead><TableHead>Notes</TableHead><TableHead>Status</TableHead>{onReview && <TableHead />}</TableRow></TableHeader>
      <TableBody>
        {rows.map((s) => {
          const diff = s.actual === null ? null : s.actual - s.recorded;
          return (
            <TableRow
              key={s.id}
              onRowClick={onReview && !s.finalized ? () => onReview(s) : undefined}
              rowLabel={onReview && !s.finalized ? `Review settlement for ${formatDate(s.date)} via ${s.method}` : undefined}
            >
              <TableCell className="whitespace-nowrap">{formatDate(s.date)}</TableCell><TableCell>{s.method}</TableCell>
              <TableCell className="num text-right">{s.count}</TableCell><TableCell className="num text-right">{formatINR(s.recorded)}</TableCell>
              <TableCell className="num text-right">{s.actual === null ? "—" : formatINR(s.actual)}</TableCell>
              <TableCell className={`num text-right ${diff ? "text-destructive" : ""}`}>{diff === null ? "—" : formatINR(diff)}</TableCell>
              <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{s.notes || "—"}</TableCell>
              <TableCell><StatusBadge status={settlementStatus(s)} /></TableCell>
              {onReview && <TableCell>{!s.finalized && <Button size="sm" variant="outline" onClick={() => onReview(s)}>Review</Button>}</TableCell>}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SettlementsPage() {
  const { tab = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { settlements } = useFinance();
  const [review, setReview] = useState<Settlement | null>(null);
  const [method, setMethod] = useState("all");
  const by = (st: string) => settlements.filter((s) => settlementStatus(s) === st).length;

  return (
    <>
      <PageHeader crumbs={["Daily Settlements", LABEL[tab] ?? ""]} title={LABEL[tab] ?? "Daily Settlements"} />
      <SampleNote>A settlement verifies existing payment records. It never creates income or counts a student payment twice.</SampleNote>
      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v } })} className="mb-4">
        <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="reconciliation">Reconciliation</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
      </Tabs>
      {tab === "overview" && (
        <>
          <StatGrid className="mb-4">
            <StatCard label="Matched" value={String(by("Matched"))} tone="success" />
            <StatCard label="Difference found" value={String(by("Difference Found"))} tone="danger" />
            <StatCard label="Pending review" value={String(by("Pending Review"))} tone="warning" />
            <StatCard label="Finalized" value={String(by("Finalized"))} />
          </StatGrid>
          <SectionCard title="Open settlements">
            <SettlementTable rows={settlements.filter((s) => !s.finalized)} onReview={setReview} />
          </SectionCard>
        </>
      )}
      {tab === "reconciliation" && <CreateSettlement />}
      {tab === "history" && (
        <SectionCard>
          <FilterBar><FilterSelect label="Methods" value={method} onChange={setMethod} options={PAYMENT_METHODS} /></FilterBar>
          <SettlementTable rows={[...settlements].sort((a, b) => b.date.localeCompare(a.date)).filter((s) => method === "all" || s.method === method)} onReview={setReview} />
        </SectionCard>
      )}
      {review && <ReviewDialog key={review.id} s={review} onClose={() => setReview(null)} />}
    </>
  );
}

function CreateSettlement() {
  const { payments, transactions, saveSettlement, settlements } = useFinance();
  const [date, setDate] = useState(TODAY);
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const saving = useRef(false);
  const onEnterKeyDown = useEnterToNext();
  const rec = recordedFor(date, method, payments, transactions);
  const exists = settlements.some((s) => s.date === date && s.method === method);
  const act = actual === "" ? null : Number(actual);

  const save = () => {
    if (saving.current) return;
    if (exists) { toast.error("A settlement already exists for this date and method"); return; }
    if (act !== null && act !== rec.total && !notes.trim()) { toast.error("Add a note explaining the difference"); return; }
    saving.current = true;
    saveSettlement({ date, method, count: rec.count, recorded: rec.total, actual: act, notes, finalized: false });
    toast.success("Settlement saved for review");
    setActual(""); setNotes("");
    window.setTimeout(() => { saving.current = false; }, 0);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Create settlement">
        <form onSubmit={(event) => { event.preventDefault(); save(); }} onKeyDown={onEnterKeyDown}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Settlement date" htmlFor="s-d"><Input id="s-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Payment method" htmlFor="s-m"><SimpleSelect id="s-m" value={method} onChange={(v) => setMethod(v as PaymentMethod)} options={PAYMENT_METHODS} /></Field>
          <Field label="Number of transactions"><Input readOnly value={rec.count} className="bg-muted" /></Field>
          <Field label="Recorded payment total"><Input readOnly value={formatINR(rec.total)} className="bg-muted" /></Field>
          <Field label={method === "Cash" ? "Actual counted cash (₹)" : "Reported settlement amount (₹)"} htmlFor="s-a">
            <Input id="s-a" type="number" min="0" value={actual} onChange={(e) => setActual(e.target.value)} />
          </Field>
          <Field label="Difference"><Input readOnly value={act === null ? "—" : formatINR(act - rec.total)} className="bg-muted" /></Field>
          <div className="sm:col-span-2"><Field label="Notes" htmlFor="s-n"><Textarea id="s-n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
        </div>
        {exists && <p className="mt-2 text-xs text-warning">A settlement already exists for this date and method — review it in the overview.</p>}
        <div className="mt-4 flex justify-end"><Button type="submit" disabled={rec.count === 0 || exists}>Save settlement</Button></div>
        {rec.count === 0 && <p className="mt-2 text-right text-xs text-muted-foreground">No recorded {method} receipts on this date.</p>}
        </form>
      </SectionCard>
      <SectionCard title="Difference review">
        {act === null ? <p className="text-sm text-muted-foreground">Enter the actual amount to compare.</p> : <Explain s={{ recorded: rec.total, actual: act, method }} />}
      </SectionCard>
    </div>
  );
}

function ReviewDialog({ s, onClose }: { s: Settlement; onClose: () => void }) {
  const { saveSettlement } = useFinance();
  const [actual, setActual] = useState(s.actual === null ? "" : String(s.actual));
  const [notes, setNotes] = useState(s.notes);
  const [confirm, setConfirm] = useState(false);
  const onEnterKeyDown = useEnterToNext();
  const act = actual === "" ? null : Number(actual);
  const draft = { ...s, actual: act, notes };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Reconciliation — {formatDate(s.date)} · {s.method}</DialogTitle></DialogHeader>
        <form onSubmit={(event) => {
          event.preventDefault();
          saveSettlement(draft);
          toast.success("Settlement updated");
          onClose();
        }} onKeyDown={onEnterKeyDown}>
        <div className="space-y-4 text-sm">
          <StatGrid className="mb-4">
            <StatCard label="Recorded total" value={formatINR(s.recorded)} hint={`${s.count} transactions`} />
            <StatCard label="Difference" value={act === null ? "—" : formatINR(act - s.recorded)} tone={act !== null && act !== s.recorded ? "danger" : undefined} />
          </StatGrid>
          <Field label="Actual amount (₹)" htmlFor="r-a"><Input id="r-a" type="number" value={actual} onChange={(e) => setActual(e.target.value)} /></Field>
          <Field label="Notes" htmlFor="r-n"><Textarea id="r-n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <Explain s={draft} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="secondary">Save</Button>
          <Button type="button" disabled={act === null} onClick={() => {
            if (act !== s.recorded && !notes.trim()) { toast.error("Add a note explaining the difference before finalizing"); return; }
            setConfirm(true);
          }}>Finalize</Button>
        </DialogFooter>
        </form>
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Finalize settlement?" confirmLabel="Finalize"
          description="Finalized settlements are locked for review. No income or balance entries are created."
          onConfirm={() => { saveSettlement({ ...draft, finalized: true }); toast.success("Settlement finalized"); onClose(); }} />
      </DialogContent>
    </Dialog>
  );
}
