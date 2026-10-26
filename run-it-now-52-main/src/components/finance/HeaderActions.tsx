import { Bell, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AttentionItemLink } from "@/components/finance/AttentionItemLink";
import { getNeedsAttention } from "@/finance/logic";
import { useFinance } from "@/finance/store";
import { useTheme } from "@/hooks/use-theme";
import { getFeeVerificationAttentionRequests, sampleExamRequests } from "@/finance/feeVerificationSim";

export function HeaderActions() {
  const { resolvedTheme, toggle } = useTheme();
  const { students, payments, settlements, balances, physicalCount } = useFinance();
  const attentionItems = getNeedsAttention({
    students,
    payments,
    settlements,
    cashBalance: balances.cash,
    bankBalance: balances.bank,
    physicalCount,
    feeVerificationRequests: getFeeVerificationAttentionRequests(sampleExamRequests, students, payments),
  });

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1 lg:gap-2">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
        title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
        onClick={toggle}
      >
        {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notifications${attentionItems.length ? `, ${attentionItems.length} items need attention` : ""}`}
          >
            <Bell className="h-4 w-4" />
            {attentionItems.length > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Needs attention</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {attentionItems.length === 0
            ? <p className="px-2 py-3 text-sm text-muted-foreground">Nothing needs attention</p>
            : attentionItems.map((item) => (
              <DropdownMenuItem key={item.key === "feeVerification" ? `${item.key}:${item.requestId}` : item.key} asChild>
                <AttentionItemLink item={item} className="flex justify-between gap-3 whitespace-normal hover:text-primary" />
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span
        role="img"
        aria-label="Finance User"
        className="avatar-gradient ml-1 flex h-9 w-9 select-none items-center justify-center rounded-full text-xs font-semibold text-primary-foreground"
      >
        FU
      </span>
    </div>
  );
}
