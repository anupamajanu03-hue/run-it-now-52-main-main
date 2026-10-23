import { describe, expect, it } from "vitest";
import { receiptFigures } from "@/finance/receipt";
import type { FeePayment, Student } from "@/finance/types";

const s = { id: "s1", name: "A", regNo: "R1", course: "C", phone: "", registeredOn: "2026-01-01", totalFee: 30000,
  installments: [{ label: "I1", due: "2026-01-10", amount: 10000 }, { label: "I2", due: "2026-02-10", amount: 10000 }, { label: "I3", due: "2026-03-10", amount: 10000 }] } as Student;
const p = (id: string, date: string, amount: number, receiptNo: string): FeePayment => ({ id, studentId: "s1", date, amount, method: "Cash", reference: "", receiptNo });
const later = p("b", "2026-02-01", 12000, "RC-2");
const first = p("a", "2026-01-05", 10000, "RC-1");
const all = [later, first];

describe("receipt figures", () => {
  it("balance counts payments up to this one by date, not today's outstanding", () => {
    expect(receiptFigures(s, first, all).balance).toBe(20000);
    expect(receiptFigures(s, later, all).balance).toBe(8000);
  });
  it("next due is the first installment not fully covered", () => {
    expect(receiptFigures(s, first, all).nextDue).toBe("2026-02-10");
    expect(receiptFigures(s, later, all).nextDue).toBe("2026-03-10");
  });
  it("no next due when fully paid", () => {
    expect(receiptFigures(s, p("c", "2026-03-01", 8000, "RC-3"), [...all, p("c", "2026-03-01", 8000, "RC-3")]).nextDue).toBeNull();
  });
});
