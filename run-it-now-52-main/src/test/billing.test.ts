import { describe, expect, it } from "vitest";
import { addMonthsISO, isValidPhone, monthlyInstallments, nextAdmissionNo } from "@/finance/billing";

describe("student bill rules", () => {
  it("splits evenly and the last installment absorbs rounding", () => {
    const r = monthlyInstallments(10000, 3, "2026-11-15");
    expect(r.map((i) => i.amount)).toEqual([3333, 3333, 3334]);
    expect(r.map((i) => i.label)).toEqual(["Instalment 1", "Instalment 2", "Instalment 3"]);
  });
  it("due dates are one month apart from the first due date", () => {
    expect(monthlyInstallments(1200, 3, "2026-11-15").map((i) => i.due)).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
    expect(addMonthsISO("2027-01-31", 1)).toBe("2027-02-28");
  });
  it("caps installments at 12", () => {
    expect(monthlyInstallments(1200, 20, "2026-11-15")).toHaveLength(12);
  });
  it("admission no. is the next free number", () => {
    expect(nextAdmissionNo(["ADM2026-101", "ADM2026-117", "ADM2026-105"])).toBe("ADM2026-118");
  });
  it("phone must be 10 digits", () => {
    expect(isValidPhone("98450 00110")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
  });
});

import { amountInWords } from "@/finance/logic";
describe("amount in words (Indian system)", () => {
  it("formats thousands and lakhs", () => {
    expect(amountInWords(16000)).toBe("Rupees Sixteen Thousand Only");
    expect(amountInWords(140000)).toBe("Rupees One Lakh Forty Thousand Only");
    expect(amountInWords(12345678)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only");
  });
});
