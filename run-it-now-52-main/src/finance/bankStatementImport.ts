export type BankStatementField =
  "date" | "description" | "bankReference" | "debit" | "credit" | "balance";

export type BankStatementMapping = Record<BankStatementField, string>;

export interface ImportedBankStatementRow {
  rowKey: string;
  date: string;
  description: string;
  bankReference?: string | undefined;
  debit: number;
  credit: number;
  balance?: number | undefined;
}

export interface BankStatementImport {
  id: string;
  fileName: string;
  importedAt: string;
  periodStart: string;
  periodEnd: string;
  rows: ImportedBankStatementRow[];
}

export interface ParsedBankStatement {
  headers: string[];
  records: string[][];
}

export interface BankStatementValidation {
  rows: ImportedBankStatementRow[];
  errors: string[];
  duplicateCount: number;
}

const fields: BankStatementField[] = [
  "date",
  "description",
  "bankReference",
  "debit",
  "credit",
  "balance",
];

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const aliases: Record<BankStatementField, string[]> = {
  date: ["date", "transactiondate", "valuedate", "postingdate"],
  description: ["description", "narration", "particulars", "details", "remarks"],
  bankReference: ["bankreference", "bankref", "utr", "utrno", "rrn", "referenceno", "reference"],
  debit: ["debit", "withdrawal", "withdrawals", "withdrawalamount", "paidout"],
  credit: ["credit", "deposit", "deposits", "depositamount", "paidin"],
  balance: ["balance", "runningbalance", "closingbalance", "availablebalance"],
};

export function suggestBankStatementMapping(headers: string[]): BankStatementMapping {
  const mapping = Object.fromEntries(fields.map((field) => [field, ""])) as BankStatementMapping;
  for (const field of fields) {
    const index = headers.findIndex((header) => aliases[field].includes(normalizeHeader(header)));
    if (index >= 0) mapping[field] = headers[index] ?? "";
  }
  return mapping;
}

export function parseBankStatementCsv(content: string): ParsedBankStatement {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      record.push(cell);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (cell.length || record.length) {
    record.push(cell);
    if (record.some((value) => value.trim())) records.push(record);
  }
  if (records.length < 2) throw new Error("The CSV is empty or contains no statement rows.");

  const headers = records[0]!.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  if (headers.some((header) => !header)) throw new Error("Every CSV column must have a header.");
  if (new Set(headers.map(normalizeHeader)).size !== headers.length) {
    throw new Error("The CSV has duplicate column names; rename them before importing.");
  }
  const malformed = records.slice(1).findIndex((row) => row.length !== headers.length);
  if (malformed >= 0) {
    throw new Error(
      `CSV row ${malformed + 2} has ${records[malformed + 1]!.length} values; expected ${headers.length}.`,
    );
  }
  return { headers, records: records.slice(1) };
}

function parseDate(value: string) {
  const input = value.trim();
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(input);
  let year: number;
  let month: number;
  let day: number;
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(input);
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseAmount(value: string, allowNegative = false) {
  const normalized = value
    .trim()
    .replace(/^(?:₹|INR|Rs\.?)\s*/i, "")
    .replace(/,/g, "")
    .replace(/\s/g, "");
  if (!normalized) return { empty: true as const };
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return { invalid: true as const };
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || (!allowNegative && amount < 0)) return { invalid: true as const };
  return { value: amount };
}

const rowIdentity = (row: Omit<ImportedBankStatementRow, "rowKey">) =>
  JSON.stringify([
    row.date,
    row.description.trim().toLocaleLowerCase(),
    row.debit,
    row.credit,
    row.balance ?? null,
  ]);

function fingerprint(identity: string) {
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  }
  return `BSR-${(hash >>> 0).toString(36).toUpperCase()}`;
}

export function validateBankStatementRows(
  parsed: ParsedBankStatement,
  mapping: BankStatementMapping,
  existingRows: readonly ImportedBankStatementRow[] = [],
): BankStatementValidation {
  const errors: string[] = [];
  for (const field of ["date", "description"] as const) {
    if (!mapping[field])
      errors.push(
        `Map the required ${field === "date" ? "Date" : "Description / narration"} field.`,
      );
  }
  if (!mapping.debit && !mapping.credit)
    errors.push("Map at least one required amount column: Debit or Credit.");
  for (const field of fields) {
    if (mapping[field] && !parsed.headers.includes(mapping[field])) {
      errors.push(`The selected ${field} column is not present in the CSV.`);
    }
  }
  const mappedColumns = fields.map((field) => mapping[field]).filter(Boolean);
  if (new Set(mappedColumns).size !== mappedColumns.length) {
    errors.push("Each statement column can be mapped to only one field.");
  }
  if (errors.length) return { rows: [], errors, duplicateCount: 0 };

  const columnIndex = (field: BankStatementField) =>
    mapping[field] ? parsed.headers.indexOf(mapping[field]) : -1;
  const identities = new Set(existingRows.map((row) => rowIdentity(row)));
  const bankReferences = new Set(
    existingRows.flatMap((row) =>
      row.bankReference?.trim() ? [row.bankReference.trim().toLocaleLowerCase()] : [],
    ),
  );
  const seen = new Set<string>();
  const seenBankReferences = new Set<string>();
  const rows: ImportedBankStatementRow[] = [];
  let duplicateCount = 0;

  parsed.records.forEach((record, index) => {
    const rowNumber = index + 2;
    const raw = (field: BankStatementField) => {
      const position = columnIndex(field);
      return position >= 0 ? (record[position] ?? "") : "";
    };
    const date = parseDate(raw("date"));
    const description = raw("description");
    const debit = parseAmount(raw("debit"));
    const credit = parseAmount(raw("credit"));
    const balance = parseAmount(raw("balance"), true);
    let invalid = false;
    if (!date) {
      errors.push(`Row ${rowNumber}: invalid or missing date.`);
      invalid = true;
    }
    if (!description.trim()) {
      errors.push(`Row ${rowNumber}: description / narration is required.`);
      invalid = true;
    }
    if ("invalid" in debit || "invalid" in credit || "invalid" in balance) {
      errors.push(`Row ${rowNumber}: debit, credit, or balance is not a valid amount.`);
      invalid = true;
    }
    const debitValue = "value" in debit && typeof debit.value === "number" ? debit.value : 0;
    const creditValue = "value" in credit && typeof credit.value === "number" ? credit.value : 0;
    if (debitValue > 0 === creditValue > 0) {
      errors.push(`Row ${rowNumber}: provide a positive debit or credit, but not both.`);
      invalid = true;
    }
    if (invalid || !date) return;

    const rowWithoutId: Omit<ImportedBankStatementRow, "rowKey"> = {
      date,
      description,
      bankReference: raw("bankReference") || undefined,
      debit: debitValue,
      credit: creditValue,
      balance: "value" in balance && typeof balance.value === "number" ? balance.value : undefined,
    };
    const identity = rowIdentity(rowWithoutId);
    const bankReference = rowWithoutId.bankReference?.trim().toLocaleLowerCase();
    if (
      identities.has(identity) ||
      seen.has(identity) ||
      (bankReference &&
        (bankReferences.has(bankReference) || seenBankReferences.has(bankReference)))
    ) {
      duplicateCount += 1;
      errors.push(
        `Row ${rowNumber}: duplicate of a previously imported or repeated statement row.`,
      );
      return;
    }
    seen.add(identity);
    if (bankReference) seenBankReferences.add(bankReference);
    rows.push({ ...rowWithoutId, rowKey: fingerprint(identity) });
  });
  return { rows, errors, duplicateCount };
}
