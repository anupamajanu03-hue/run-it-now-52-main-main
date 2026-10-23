/** Pure helpers for creating a student bill. There is no discount or concession: billed = full course fee. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Adds whole months to an ISO date, clamping to the last day of the target month. Timezone-safe. */
export function addMonthsISO(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = (m - 1) + months;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`;
}

/** Even split, last installment absorbs rounding; due dates one month apart. */
export function monthlyInstallments(total: number, count: number, firstDue: string) {
  const n = Math.min(12, Math.max(1, Math.floor(count)));
  const per = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    label: `Instalment ${i + 1}`,
    due: addMonthsISO(firstDue, i),
    amount: i === n - 1 ? total - per * (n - 1) : per,
  }));
}

/** Next free ADM2026-xxx number, above the highest one already used. */
export function nextAdmissionNo(existing: string[], prefix = "ADM2026-") {
  const used = existing.filter((r) => r.startsWith(prefix)).map((r) => Number(r.slice(prefix.length))).filter(Number.isFinite);
  const next = Math.max(100, ...used) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function isValidPhone(phone: string) {
  return /^\d{10}$/.test(phone.replace(/\s/g, "").replace(/^\+91/, ""));
}
