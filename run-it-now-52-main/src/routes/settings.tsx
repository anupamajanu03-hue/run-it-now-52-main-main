import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, PageHeader, SampleNote, SectionCard, tabSearch } from "@/components/finance/common";
import { useFinance, type FinanceSettings } from "@/finance/store";
import { CourseCatalogTab } from "@/components/finance/CourseCatalogTab";
import { PAYMENT_METHODS } from "@/finance/types";
import { useEnterToNext } from "@/hooks/use-enter-to-next";

export const Route = createFileRoute("/settings")({
  validateSearch: tabSearch,
  head: () => ({
    meta: [
      { title: "Finance Settings â€” Finance & Accounts" },
      { name: "description", content: "Institution details, course catalog, categories, payment methods, receipts and financial year." },
      { property: "og:title", content: "Finance Settings â€” Finance & Accounts" },
      { property: "og:description", content: "Institution details, course catalog, categories, payment methods, receipts and financial year." },
    ],
  }),
  component: SettingsPage,
});

const LABEL: Record<string, string> = {
  institution: "Institution Details", courses: "Course Catalog & Fee Structure", categories: "Income & Expense Categories",
  accounts: "Account Categories", payments: "Payment Methods", receipts: "Receipt Settings", year: "Financial Year",
};

function SettingsPage() {
  const { courseCatalog } = useFinance();
  const { tab = "institution" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <>
      <PageHeader crumbs={["Finance Settings", LABEL[tab] ?? ""]} title={tab === "courses" ? `${LABEL[tab]} · ${courseCatalog.courses.length} courses` : LABEL[tab] ?? "Finance Settings"} />
      <SampleNote />
      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v } })} className="mb-4">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="institution">Institution</TabsTrigger>
          <TabsTrigger value="courses">Course Catalog & Fee Structure</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="year">Financial year</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "institution" && <InstitutionTab />}
      {tab === "courses" && <CourseCatalogTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "accounts" && <AccountsTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "receipts" && <ReceiptsTab />}
      {tab === "year" && <YearTab />}
    </>
  );
}

function InstitutionTab() {
  const { settings, setSettings } = useFinance();
  const [f, setF] = useState(settings.institution);
  const onEnterKeyDown = useEnterToNext();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <SectionCard title="Institution details" className="max-w-2xl">
      <form onSubmit={(event) => {
        event.preventDefault();
        setSettings((s) => ({ ...s, institution: f }));
        toast.success("Institution details saved");
      }} onKeyDown={onEnterKeyDown}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Institution name" htmlFor="i-n"><Input id="i-n" value={f.name} onChange={set("name")} /></Field>
        <Field label="Phone" htmlFor="i-p"><Input id="i-p" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email" htmlFor="i-e"><Input id="i-e" type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="GSTIN" htmlFor="i-g"><Input id="i-g" value={f.gstin} onChange={set("gstin")} /></Field>
        <div className="sm:col-span-2"><Field label="Address" htmlFor="i-a"><Input id="i-a" value={f.address} onChange={set("address")} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit">Save changes</Button>
      </div>
      </form>
    </SectionCard>
  );
}

function CategoryList({ title, items, onChange }: { title: string; items: string[]; onChange: (items: string[]) => void }) {
  const [v, setV] = useState("");
  const onEnterKeyDown = useEnterToNext();
  return (
    <SectionCard title={title}>
      <form className="mb-3 flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        const c = v.trim();
        if (!c) return;
        if (items.includes(c)) { toast.error("Already exists"); return; }
        onChange([...items, c]); setV(""); toast.success("Added");
      }} onKeyDown={onEnterKeyDown}>
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={`New ${title.toLowerCase().replace(/s$/, "")}`} className="max-w-xs" />
        <Button type="submit" variant="outline"><Plus className="mr-1 h-4 w-4" />Add</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {items.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
            {c}
            <button type="button" aria-label={`Remove ${c}`} className="text-muted-foreground hover:text-destructive"
              onClick={() => { onChange(items.filter((x) => x !== c)); toast.success("Removed"); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
    </SectionCard>
  );
}

function CategoriesTab() {
  const { settings, setSettings } = useFinance();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CategoryList title="Income categories" items={settings.incomeCategories}
        onChange={(items) => setSettings((s) => ({ ...s, incomeCategories: items }))} />
      <CategoryList title="Expense categories" items={settings.expenseCategories}
        onChange={(items) => setSettings((s) => ({ ...s, expenseCategories: items }))} />
    </div>
  );
}

function AccountsTab() {
  const { settings, setSettings } = useFinance();
  return (
    <div className="max-w-xl">
      <CategoryList title="Account categories" items={settings.accountCategories}
        onChange={(items) => setSettings((s) => ({ ...s, accountCategories: items }))} />
    </div>
  );
}

function PaymentsTab() {
  const { settings, setSettings } = useFinance();
  return (
    <SectionCard title="Payment methods" className="max-w-xl">
      <p className="mb-3 text-sm text-muted-foreground">Disabled methods are not offered when recording payments.</p>
      <div className="space-y-3">
        {PAYMENT_METHODS.map((m) => (
          <div key={m} className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm font-medium">{m}</span>
            <Switch checked={settings.paymentMethods[m] ?? false} aria-label={`Enable ${m}`}
              onCheckedChange={(v) => { setSettings((s) => ({ ...s, paymentMethods: { ...s.paymentMethods, [m]: v } })); toast.success(`${m} ${v ? "enabled" : "disabled"}`); }} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ReceiptsTab() {
  const { settings, setSettings } = useFinance();
  const [f, setF] = useState(settings.receipt);
  const onEnterKeyDown = useEnterToNext();
  return (
    <SectionCard title="Receipt settings" className="max-w-2xl">
      <form onSubmit={(event) => {
        event.preventDefault();
        setSettings((s) => ({ ...s, receipt: f }));
        toast.success("Receipt settings saved");
      }} onKeyDown={onEnterKeyDown}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Receipt number prefix" htmlFor="r-p"><Input id="r-p" value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} /></Field>
        <Field label="Next receipt number" htmlFor="r-n"><Input id="r-n" type="number" min="1" value={f.next} onChange={(e) => setF({ ...f, next: Number(e.target.value) || 1 })} /></Field>
        <div className="sm:col-span-2">
          <Field label="Receipt footer text" htmlFor="r-f"><Textarea id="r-f" value={f.footer} onChange={(e) => setF({ ...f, footer: e.target.value })} rows={2} /></Field>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Next receipt will be numbered <span className="num font-medium text-foreground">{f.prefix}{f.next}</span>.</p>
      <div className="mt-4 flex justify-end">
        <Button type="submit">Save changes</Button>
      </div>
      </form>
    </SectionCard>
  );
}

function YearTab() {
  const { settings, setSettings } = useFinance();
  const [f, setF] = useState(settings.financialYear);
  const [err, setErr] = useState<string>("");
  const onEnterKeyDown = useEnterToNext();
  const save = () => {
    if (!f.label.trim() || !f.start || !f.end) { setErr("All fields are required"); return; }
    if (f.end <= f.start) { setErr("End date must be after the start date"); return; }
    setErr("");
    setSettings((s: FinanceSettings) => ({ ...s, financialYear: f }));
    toast.success("Financial year saved");
  };
  return (
    <SectionCard title="Financial year" className="max-w-2xl">
      <form onSubmit={(event) => { event.preventDefault(); save(); }} onKeyDown={onEnterKeyDown}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Label" htmlFor="y-l"><Input id="y-l" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <Field label="Start date" htmlFor="y-s"><Input id="y-s" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="End date" htmlFor="y-e"><Input id="y-e" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
      </div>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <p className="mt-3 text-sm text-muted-foreground">Currency: {settings.currency.code} ({settings.currency.symbol}) Â· {settings.currency.grouping} grouping</p>
      <div className="mt-4 flex justify-end"><Button type="submit">Save changes</Button></div>
      </form>
    </SectionCard>
  );
}
