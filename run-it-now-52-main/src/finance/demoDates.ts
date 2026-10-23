export function demoDate(offsetDays: number, today: string | Date = new Date()): string {
  if (!Number.isInteger(offsetDays)) {
    throw new RangeError("Demo date offset must be a whole number of days.");
  }

  const [year, month, day] =
    typeof today === "string"
      ? today.split("-").map(Number)
      : [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  const date = new Date(Date.UTC(year!, month! - 1, day! + offsetDays));
  return date.toISOString().slice(0, 10);
}
