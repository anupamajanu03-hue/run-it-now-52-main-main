import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { NAV } from "@/finance/nav";
import { resolveReportKey } from "@/finance/reports";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("resolves every sidebar destination to a real page", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    for (const item of NAV) {
      const matches = router.matchRoutes(item.to);
      expect(matches.at(-1)?.routeId, `route ${item.to}`).not.toBe(rootRouteId);

      for (const child of item.children ?? []) {
        const withTab = router.matchRoutes(item.to, { tab: child.tab });
        expect(withTab.at(-1)?.routeId, `route ${item.to}?tab=${child.tab}`).not.toBe(rootRouteId);
      }
    }
  });

  it("keeps Daily Transactions as one direct sidebar item", () => {
    const transactionItems = NAV.filter((item) => item.to === "/transactions");

    expect(transactionItems).toHaveLength(1);
    expect(transactionItems[0]).not.toHaveProperty("children");
  });

  it("keeps Petty Cash as one direct sidebar item", () => {
    const pettyCashItems = NAV.filter((item) => item.title === "Petty Cash");

    expect(pettyCashItems).toHaveLength(1);
    expect(pettyCashItems[0]).toMatchObject({ to: "/petty-cash" });
    expect(pettyCashItems[0]).not.toHaveProperty("children");
  });

  it("keeps Books & Ledgers, Student Fees, Daily Settlements, Cash Flow, Financial Reports, and Finance Settings as direct sidebar items", () => {
    const directItems = [
      ["Books & Ledgers", "/ledgers"],
      ["Student Fees", "/fees"],
      ["Daily Settlements", "/settlements"],
      ["Cash Flow", "/budgets"],
      ["Financial Reports", "/reports"],
      ["Finance Settings", "/settings"],
    ];

    for (const [title, to] of directItems) {
      const items = NAV.filter((item) => item.title === title);

      expect(items, `sidebar item ${title}`).toHaveLength(1);
      expect(items[0]).toMatchObject({ to });
      expect(items[0]).not.toHaveProperty("children");
    }
  });

  it("opens Financial Reports with a selected report and preserves legacy report tabs", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const reports = NAV.find((item) => item.title === "Financial Reports");

    expect(reports).toMatchObject({ to: "/reports", report: "income-report" });
    expect(router.matchRoutes("/reports", { report: "bank-book" }).at(-1)?.routeId).not.toBe(rootRouteId);
    expect(resolveReportKey()).toBe("income-report");
    expect(resolveReportKey(undefined, "income-expense")).toBe("income-report");
    expect(resolveReportKey(undefined, "fees")).toBe("student-fee-collection");
    expect(resolveReportKey(undefined, "outstanding")).toBe("outstanding-overdue-fees");
    expect(resolveReportKey(undefined, "settlement")).toBe("settlement-report");
    expect(resolveReportKey(undefined, "statements")).toBe("cash-book");
  });

  it("removes the Roles & Permissions page and sidebar destination", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(NAV.some((item) => item.title === "Roles & Permissions" || item.to === "/roles")).toBe(false);
    expect(router.matchRoutes("/roles").at(-1)?.routeId).toBe(rootRouteId);
  });
});
