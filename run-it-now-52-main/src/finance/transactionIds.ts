import type { Transaction } from "./types";

type TransactionRecord = Omit<Transaction, "id"> & { id?: string | undefined };

function legacyTransactionId(
  transaction: TransactionRecord,
  used: Set<string>,
  reserved: Set<string>,
) {
  const identity = JSON.stringify([
    transaction.type,
    transaction.date,
    transaction.description,
    transaction.category,
    transaction.amount,
    transaction.method,
    transaction.reference,
    transaction.status,
    transaction.receiptNo,
    transaction.to,
    transaction.paymentMode,
  ]);
  let hash = 2166136261;
  for (let character = 0; character < identity.length; character += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(character), 16777619);
  }
  const baseId = `T-LEGACY-${(hash >>> 0).toString(36).toUpperCase()}`;
  let candidate = baseId;
  let suffix = 2;
  while (used.has(candidate) || reserved.has(candidate)) candidate = `${baseId}-${suffix++}`;
  return candidate;
}

export function ensureTransactionIds(records: readonly TransactionRecord[]): Transaction[] {
  const used = new Set<string>();
  const reserved = new Set(
    records.flatMap((record) => {
      const id = record.id?.trim();
      return id ? [id] : [];
    }),
  );
  return records.map((record) => {
    const existingId = record.id?.trim();
    const id =
      existingId && !used.has(existingId)
        ? existingId
        : legacyTransactionId(record, used, reserved);
    used.add(id);
    return { ...record, id };
  });
}
