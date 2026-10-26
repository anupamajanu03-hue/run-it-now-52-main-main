import { Link } from "@tanstack/react-router";
import type { AttentionItem } from "@/finance/logic";

export function AttentionItemLink({ item, className }: { item: AttentionItem; className?: string }) {
  const children = (
    <>
      <span>{item.label}</span>
      <span className="num">{item.value}</span>
    </>
  );

  switch (item.key) {
    case "overdue":
      return <Link to="/fees" search={{ tab: "billing", todayFilter: "overdue" }} className={className}>{children}</Link>;
    case "settlements":
      return <Link to="/settlements" search={{ tab: "overview" }} className={className}>{children}</Link>;
    case "petty":
      return <Link to="/petty-cash" className={className}>{children}</Link>;
    case "cash":
      return <Link to="/ledgers" search={{ tab: "cash" }} className={className}>{children}</Link>;
    case "bank":
      return <Link to="/ledgers" search={{ tab: "bank" }} className={className}>{children}</Link>;
  }
}
