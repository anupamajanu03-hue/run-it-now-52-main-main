import { useState, type ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, Landmark, Menu } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { HeaderActions } from "@/components/finance/HeaderActions";
import { NAV } from "@/finance/nav";
import { cn } from "@/lib/utils";

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname, tab } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, tab: (s.location.search as { tab?: string }).tab }),
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <nav className="finance-menu-nav text-[14px]">
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        const base = "finance-menu-item flex w-full items-center gap-[10px] rounded-xl px-[12px] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";
        if (!item.children) {
          if (item.report) {
            return (
              <Link key={item.to} to="/reports" search={{ report: item.report }} onClick={onNavigate}
                className={cn(base, active ? "bg-white/15 font-semibold text-white" : "text-slate-300")}>
                <Icon className="h-[18px] w-[18px] shrink-0 text-blue-200" />{item.title}
              </Link>
            );
          }
          return (
            <Link key={item.to} to={item.to as "/"} onClick={onNavigate}
              className={cn(base, active ? "bg-white/15 font-semibold text-white" : "text-slate-300")}>
              <Icon className="h-[18px] w-[18px] shrink-0 text-blue-200" />{item.title}
            </Link>
          );
        }
        const isOpen = open[item.to] ?? active;
        return (
          <Collapsible key={item.to} open={isOpen} onOpenChange={(o) => setOpen((x) => ({ ...x, [item.to]: o }))}>
            <CollapsibleTrigger className={cn(base, active ? "bg-white/15 font-semibold text-white" : "text-slate-300")}>
              <Icon className="h-[18px] w-[18px] shrink-0 text-blue-200" />
              <span className="flex-1 text-left">{item.title}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-[26px] mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                {item.children.map((c, i) => {
                  const childActive = active && (tab ? tab === c.tab : i === 0);
                  return (
                    <Link key={c.tab} to={item.to as "/transactions"} search={{ tab: c.tab }} onClick={onNavigate}
                      className={cn("block rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
                        childActive ? "bg-white/15 font-semibold text-white" : "text-slate-400")}>
                      {c.title}
                    </Link>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="finance-menu-header border-b border-blue-200/15 px-[10px]">
        <div className="flex items-center gap-3">
          <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Landmark className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight text-white">Finance &amp; Accounts</p>
            <p className="mt-1 text-[11px] text-slate-400">Prototype module</p>
          </div>
        </div>
      </div>
      <NavList onNavigate={onNavigate} />
      <p className="finance-menu-footer border-t border-blue-200/15 px-[10px] text-[11px] text-slate-400">
        Sample data · FY 2026-27
      </p>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  return (
    <TooltipProvider delayDuration={150}>
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
    <div className="flex min-h-screen w-full flex-col">
      <SheetContent
        side="left"
        overlayClassName="bg-overlay backdrop-blur-sm"
        className="finance-menu-panel flex flex-col gap-0 border-blue-200/15 p-0 text-white"
        style={{ width: "260px", maxWidth: "260px", height: "100dvh" }}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarBody onNavigate={() => setMenuOpen(false)} />
      </SheetContent>

      <header className="sticky top-0 z-40 w-full border-b border-border bg-card no-print">
        <div className="flex h-[72px] items-center gap-1 px-4 sm:px-6 lg:px-12">
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={menuOpen}>
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => router.history.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <HeaderActions />
        </div>
      </header>
      <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-12 lg:py-8">
        {children}
      </main>
    </div>
    </Sheet>
    </TooltipProvider>
  );
}
