import {
  LayoutDashboard, ArrowLeftRight, Wallet, BookOpen, Layers, GraduationCap, Scale, PiggyBank,
  FileBarChart, Settings, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  report?: string;
  children?: { title: string; tab: string }[];
}

export const NAV: NavItem[] = [
  { title: "Dashboard", to: "/", icon: LayoutDashboard },
  { title: "Daily Transactions", to: "/transactions", icon: ArrowLeftRight },
  { title: "Petty Cash", to: "/petty-cash", icon: Wallet },
  { title: "Books & Ledgers", to: "/ledgers", icon: BookOpen },
  { title: "Student Fees", to: "/fees", icon: GraduationCap },
  { title: "Daily Settlements", to: "/settlements", icon: Scale },
  { title: "Course Fees", to: "/allocation", icon: Layers },
  { title: "Cash Flow", to: "/budgets", icon: PiggyBank },
  { title: "Financial Reports", to: "/reports", icon: FileBarChart, report: "income-report" },
  { title: "Finance Settings", to: "/settings", icon: Settings },
];
