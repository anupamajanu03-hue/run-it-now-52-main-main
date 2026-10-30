import { Children, Fragment, isValidElement, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BadgeCheck,
  ChartNoAxesCombined,
  CircleAlert,
  CircleCheck,
  FileText,
  Info,
  Inbox,
  Landmark,
  List,
  Receipt,
  Scale,
  Search,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { focusNextField, focusPreviousField } from "@/hooks/use-enter-to-next";

function statIcon(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("income") || normalized.includes("collected") || normalized.includes("credit")) return ArrowDownToLine;
  if (normalized.includes("expense") || normalized.includes("debit")) return ArrowUpFromLine;
  if (normalized.includes("bank")) return Landmark;
  if (normalized.includes("petty") || normalized.includes("cash") || normalized.includes("book balance")) return Wallet;
  if (
    normalized.includes("outstanding") ||
    normalized.includes("remaining") ||
    normalized.includes("overdue") ||
    normalized.includes("difference") ||
    normalized.includes("shortage") ||
    normalized.includes("excess")
  ) {
    return CircleAlert;
  }
  if (normalized.includes("opening") || normalized.includes("closing")) return Scale;
  if (normalized.includes("entry") || normalized.includes("entries")) return List;
  if (normalized.includes("rate")) return ChartNoAxesCombined;
  if (normalized.includes("matched")) return CircleCheck;
  if (normalized.includes("finalized")) return BadgeCheck;
  if (normalized.includes("recorded") || normalized.includes("billed")) return Receipt;
  if (normalized.includes("flow")) return ArrowLeftRight;
  return FileText;
}

function statIconTone(label: string, tone?: "success" | "danger" | "warning") {
  const normalized = label.toLowerCase();
  if (normalized.includes("income") || normalized.includes("collected") || normalized.includes("bank")) {
    return "bg-primary/10 text-primary";
  }
  if (
    tone === "danger" ||
    normalized.includes("difference") ||
    normalized.includes("shortage") ||
    normalized.includes("excess") ||
    normalized.includes("outstanding") ||
    normalized.includes("remaining") ||
    normalized.includes("overdue")
  ) {
    return "bg-danger-soft text-destructive";
  }
  if (normalized.includes("expense") || normalized.includes("debit")) return "bg-expense-soft text-expense";
  if (tone === "warning" || normalized.includes("pending")) return "bg-warning-soft text-warning";
  if (
    tone === "success" ||
    normalized.includes("petty") ||
    normalized.includes("cash") ||
    normalized.includes("matched") ||
    normalized.includes("finalized") ||
    normalized.includes("recorded")
  ) {
    return "bg-success-soft text-success";
  }
  return "bg-primary/10 text-primary";
}

export function PageHeader({ crumbs, title, description, center, actions }: {
  crumbs: string[]; title: string; description?: string; center?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className={center
      ? "mb-7 grid grid-cols-[1fr_auto_1fr] items-end gap-3"
      : "mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"}>
      <div>
        <nav aria-label="Breadcrumb" className="mb-1 text-xs text-muted-foreground">
          Finance & Accounts{crumbs.map((c) => <span key={c}> / {c}</span>)}
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {center && <div className="flex justify-center">{center}</div>}
      {actions && <div className={center
        ? "no-print flex flex-wrap justify-end gap-2"
        : "no-print flex flex-wrap gap-2"}>{actions}</div>}
    </div>
  );
}

export type StatColor = "blue" | "green" | "orange" | "red" | "purple" | "gray";
const statColorVar: Record<StatColor, string> = {
  blue: "var(--chart-1)", green: "var(--chart-2)", orange: "var(--chart-3)",
  purple: "var(--chart-4)", red: "var(--chart-danger)", gray: "var(--muted-foreground)",
};

/** The single shared KPI card. Place cards inside a StatGrid wrapper. */
export function StatCard({ label, value, hint, caption, tone, icon, color, empty, compact = false }: {
  label: string; value: string | null; hint?: string | undefined; caption?: string | undefined;
  tone?: "success" | "danger" | "warning" | undefined; icon?: LucideIcon | undefined;
  color?: StatColor | undefined; empty?: string | undefined; compact?: boolean | undefined;
}) {
  const Icon = icon ?? statIcon(label);
  const sub = caption ?? hint;
  const isEmpty = value === null || value === "—" || value === "Not counted";
  const shown = value ?? empty ?? "—";
  return (
    <Card className="stat-card relative min-w-0 rounded-2xl p-4 shadow-soft">
      <p title={label} className="min-w-0 pr-10 text-[11px] font-semibold uppercase leading-[12px] tracking-wide text-muted-foreground">{label}</p>
      <span aria-hidden="true"
        className={cn("absolute right-4 top-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", !color && statIconTone(label, tone))}
        style={color ? { backgroundColor: `color-mix(in oklab, ${statColorVar[color]} 12%, transparent)`, color: statColorVar[color] } : undefined}>
        <Icon className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
      </span>
      <p className={cn("num stat-value mt-1 min-w-0 whitespace-nowrap font-bold tabular-nums leading-tight",
        isEmpty && "text-muted-foreground", shown === "Not counted" && "!text-base",
        !isEmpty && tone === "success" && "text-success", !isEmpty && tone === "danger" && "text-destructive",
        !isEmpty && tone === "warning" && "text-warning")}>
        {shown}
      </p>
      <p title={compact ? sub : undefined} className="mt-1 min-w-0 text-xs leading-[12px] text-muted-foreground">{sub || "\u00A0"}</p>
    </Card>
  );
}

function countStatChildren(children: ReactNode): number {
  return Children.toArray(children).reduce<number>((count, child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      return count + countStatChildren(child.props.children);
    }
    return count + 1;
  }, 0);
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  const columns = Math.max(1, countStatChildren(children));
  return (
    <div className={cn("stat-grid", className)} style={{ "--stat-columns": columns } as CSSProperties}>
      {children}
    </div>
  );
}

const toneOf: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  Paid: "success", Matched: "success", Posted: "success", Approved: "success", Finalized: "info", Excess: "warning",
  "Partially Paid": "warning", Pending: "neutral", "Pending Review": "warning", "Pending approval": "warning",
  Overdue: "danger", "Difference Found": "danger", Shortage: "danger",
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={toneOf[status] ?? "neutral"}>{status}</Badge>;
}

export function SampleNote({ children }: { children?: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-xs text-accent-foreground no-print">
      <Info className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{children ?? "Illustrative sample data. This prototype does not store real financial records — changes reset on refresh."}</span>
      <button type="button" aria-label="Dismiss" onClick={() => setHidden(true)} className="rounded-md p-0.5 opacity-70 hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function EmptyState({ message = "No records match your filters." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
      <Inbox className="h-6 w-6" />{message}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search…" }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="relative min-w-[200px] flex-1">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input aria-label={placeholder} className="pl-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options, all = "All", allLabel }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; all?: string; allLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full sm:w-[170px]"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel ?? `${all} ${label.toLowerCase()}`}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function DateRange({ from, to, onChange, quickRange, onQuickRangeChange, financialYearStart }: {
  from: string;
  to: string;
  financialYearStart?: string;
  onChange: (f: string, t: string) => void;
  quickRange?: string;
  onQuickRangeChange?: (range: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" aria-label="From date" className="h-9 w-[150px]" value={from} onChange={(e) => onChange(e.target.value, to)} />
      <span className="text-xs text-muted-foreground">to</span>
      <Input type="date" aria-label="To date" className="h-9 w-[150px]" value={to} onChange={(e) => onChange(from, e.target.value)} />
      {quickRange !== undefined && onQuickRangeChange && (
        <Select value={quickRange} onValueChange={onQuickRangeChange}>
          <SelectTrigger aria-label="Quick range" className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="year">This financial year</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="no-print mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string | undefined; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function SimpleSelect({ id, value, onChange, options, placeholder = "Select" }: {
  id?: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectionMade = useRef(false);
  const selectionDirection = useRef<"next" | "previous">("next");
  return (
    <Select value={value} onValueChange={(next) => {
      selectionMade.current = true;
      onChange(next);
    }}>
      <SelectTrigger ref={triggerRef} id={id}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target instanceof HTMLElement && event.target.closest("[role='option']")) {
            selectionMade.current = true;
            selectionDirection.current = event.shiftKey ? "previous" : "next";
          }
        }}
        onCloseAutoFocus={(event) => {
          if (!selectionMade.current) return;
          selectionMade.current = false;
          const direction = selectionDirection.current;
          selectionDirection.current = "next";
          const trigger = triggerRef.current;
          const form = trigger?.closest("form");
          if (!trigger || !form || form.dataset.enterNav === "off") return;
          event.preventDefault();
          window.requestAnimationFrame(() => {
            if (direction === "previous") focusPreviousField(form, trigger);
            else focusNextField(form, trigger);
          });
        }}
      >
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: ReactNode; confirmLabel?: string; onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SectionCard({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-2">
          {title && <div><h2 className="text-base font-semibold">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}</div>}{action}
        </div>
      )}
      {children}
    </Card>
  );
}

export const tabSearch = (s: Record<string, unknown>): { tab?: string | undefined } => ({
  tab: typeof s['tab'] === "string" ? s['tab'] : undefined,
});

export function downloadCSV(name: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `${name}.csv`;
  a.click();
}
