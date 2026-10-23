import type { FeePayment, PettyEntry, Settlement, Student, Transaction } from "./types";
import { seedCourses } from "./courses";

export const INCOME_CATEGORIES = [
  "Application Fees",
  "Administration Fees",
  "Penalties & Fines",
  "Miscellaneous Income",
];
export const EXPENSE_CATEGORIES = [
  "Staff Salaries",
  "Events Expenses",
  "Printing & Stationery",
  "Electricity & Water Charges",
  "Telephone & Internet Charges",
  "Repairs & Maintenance Charges",
  "Advertising & Promotion Charges",
  "Bank Service Charges",
  "Cleaning & Sanitation Expenses",
  "Fuel & Vehicle Expenses",
];
export const PETTY_CATEGORIES = ["Refreshments", "Courier", "Stationery", "Local Travel", "Repairs", "Top-up"];

export const makeInstallments = (total: number, n: number, firstDue: string) => {
  const per = Math.floor(total / n);
  const start = new Date(firstDue + "T00:00:00");
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i * 2);
    return {
      label: `Instalment ${i + 1}`,
      due: d.toISOString().slice(0, 10),
      amount: i === n - 1 ? total - per * (n - 1) : per,
    };
  });
};

const months = ["04", "05", "06", "07", "08", "09", "10"];
const txns: Transaction[] = [];
let n = 1;
const add = (t: Omit<Transaction, "id" | "status"> & { status?: Transaction["status"] }) =>
  txns.push({ status: "Posted", ...t, id: `T${String(n++).padStart(3, "0")}` });
months.forEach((m, i) => {
  add({ type: "expense", date: `2026-${m}-01`, description: `Staff salaries – ${m}/2026`, category: "Salaries", amount: 410000 + i * 5000, method: "Bank Transfer", reference: `SAL-${m}` });
  add({ type: "expense", date: `2026-${m}-05`, description: "Electricity & water", category: "Utilities", amount: 38000 + (i % 3) * 4200, method: "Bank Transfer", reference: `UTL-${m}` });
  add({ type: "income", date: `2026-${m}-07`, description: "Hostel fees (monthly)", category: "Hostel Fees", amount: 96000 + i * 3000, method: "Bank Transfer", reference: `HST-${m}` });
  add({ type: "income", date: `2026-${m}-10`, description: "Transport fees", category: "Transport Fees", amount: 42000 + (i % 2) * 6000, method: "UPI", reference: `TRN-${m}` });
  add({ type: "expense", date: `2026-${m}-12`, description: "Lab consumables", category: "Lab Supplies", amount: 18000 + i * 1500, method: "Card", reference: `LAB-${m}` });
  add({ type: "expense", date: `2026-${m}-18`, description: "Campus maintenance", category: "Maintenance", amount: 22000 + (i % 4) * 2500, method: "Cash", reference: `MNT-${m}` });
});
add({ type: "income", date: "2026-08-15", description: "Alumni donation – library fund", category: "Donations", amount: 150000, method: "Bank Transfer", reference: "DON-0815" });
add({ type: "expense", date: "2026-09-05", description: "Teachers' Day event", category: "Events", amount: 26000, method: "Cash", reference: "EVT-0905" });
add({ type: "expense", date: "2026-10-03", description: "Management seminar hall rent", category: "Rent", amount: 15000, method: "UPI", reference: "RNT-1003" });
add({ type: "income", date: "2026-10-15", description: "Exam fees – supplementary", category: "Exam Fees", amount: 12500, method: "Cash", reference: "EXM-1015" });
add({ type: "income", date: "2026-10-16", description: "Exam fees – revaluation", category: "Exam Fees", amount: 4200, method: "UPI", reference: "EXM-1016", status: "Pending" });
add({ type: "expense", date: "2026-10-14", description: "Printer cartridges", category: "Stationery", amount: 6400, method: "Cash", reference: "STN-1014", status: "Pending" });
const sampleTransactions: (Omit<Transaction, "id" | "status"> & { status?: Transaction["status"] })[] = [
  ["income", "2026-04-08", "Application Fees", "Nisha Rao", "Application form sales â€“ April", "Cash", "Full Payment", 1200, "RCP-2026-1020"],
  ["income", "2026-08-19", "Application Fees", "Admissions Desk", "Application forms for walk-in applicants", "UPI", "Full Payment", 2400, "RCP-2026-1021"],
  ["income", "2026-05-14", "Administration Fees", "Rahul Mehta", "Admission administration charge", "Bank Transfer", "Full Payment", 3500, "RCP-2026-1022"],
  ["income", "2026-09-03", "Administration Fees", "Office Administration", "Document processing and verification charge", "Debit Card", "Full Payment", 2800, "RCP-2026-1023"],
  ["income", "2026-06-22", "Penalties & Fines", "Karan Shah", "Library book late return fee", "Cash", "Full Payment", 750, "RCP-2026-1024"],
  ["income", "2026-10-11", "Penalties & Fines", "Exam Office", "Late examination registration fee", "UPI", "Full Payment", 1500, "RCP-2026-1025", "Pending"],
  ["income", "2026-07-17", "Miscellaneous Income", "Ravi Kumar", "Sale of used campus publications", "Credit Card", "Full Payment", 950, "RCP-2026-1026"],
  ["income", "2026-10-06", "Miscellaneous Income", "Alumni Association", "Replacement identity card and document copies", "Cheque", "Partial Payment", 1800, "RCP-2026-1027"],
  ["expense", "2026-04-30", "Staff Salaries", "College Payroll Account", "Monthly staff salaries â€“ April", "Bank Transfer", "Full Payment", 425000, "EXP-2026-0001"],
  ["expense", "2026-09-30", "Staff Salaries", "College Payroll Account", "Monthly staff salaries â€“ September", "Bank Transfer", "Full Payment", 445000, "EXP-2026-0002"],
  ["expense", "2026-05-21", "Events Expenses", "Celebration Decorators", "Stage and hall decoration for annual day", "Cash", "Full Payment", 18500, "EXP-2026-0003"],
  ["expense", "2026-09-04", "Events Expenses", "Campus Caterers", "Hall setup and refreshments for Teachers' Day", "UPI", "Partial Payment", 22400, "EXP-2026-0004"],
  ["expense", "2026-04-18", "Printing & Stationery", "Bright Print House", "Printing of college prospectus", "Cheque", "Full Payment", 12800, "EXP-2026-0005"],
  ["expense", "2026-08-12", "Printing & Stationery", "Metro Office Supplies", "Registers, paper and examination stationery", "Debit Card", "Full Payment", 6700, "EXP-2026-0006"],
  ["expense", "2026-05-06", "Electricity & Water Charges", "Bengaluru Electricity Supply", "Monthly electricity bill â€“ May", "Bank Transfer", "Full Payment", 46200, "EXP-2026-0007"],
  ["expense", "2026-10-05", "Electricity & Water Charges", "Bengaluru Water Board", "Campus water and utility charges", "UPI", "Full Payment", 18400, "EXP-2026-0008"],
  ["expense", "2026-06-10", "Telephone & Internet Charges", "FiberNet Business", "Monthly campus internet connection", "Credit Card", "Full Payment", 5800, "EXP-2026-0009"],
  ["expense", "2026-09-10", "Telephone & Internet Charges", "Airtel Business", "Office telephone and data plan", "Bank Transfer", "Full Payment", 3900, "EXP-2026-0010"],
  ["expense", "2026-07-03", "Repairs & Maintenance Charges", "Precision Electrical Works", "Repairs to classroom fans and wiring", "Cash", "Full Payment", 7600, "EXP-2026-0011"],
  ["expense", "2026-10-09", "Repairs & Maintenance Charges", "Campus Facilities Services", "Plumbing repairs in administration block", "Cheque", "Partial Payment", 14200, "EXP-2026-0012"],
  ["expense", "2026-04-25", "Advertising & Promotion Charges", "Deccan Education Media", "Newspaper advertisement for admissions", "Bank Transfer", "Full Payment", 26500, "EXP-2026-0013"],
  ["expense", "2026-08-28", "Advertising & Promotion Charges", "City Print & Hoardings", "Admissions campaign banners and flyers", "UPI", "Full Payment", 11800, "EXP-2026-0014"],
  ["expense", "2026-06-30", "Bank Service Charges", "State Bank of India", "Quarterly account and transaction service charges", "Bank Transfer", "Full Payment", 1250, "EXP-2026-0015"],
  ["expense", "2026-10-01", "Bank Service Charges", "Canara Bank", "Monthly bank service and cheque book charges", "Bank Transfer", "Full Payment", 680, "EXP-2026-0016"],
  ["expense", "2026-05-12", "Cleaning & Sanitation Expenses", "CleanCare Supplies", "Cleaning supplies for classrooms and offices", "Cash", "Full Payment", 3200, "EXP-2026-0017"],
  ["expense", "2026-09-18", "Cleaning & Sanitation Expenses", "Sparkle Facility Services", "Sanitation and washroom cleaning supplies", "Debit Card", "Full Payment", 5400, "EXP-2026-0018"],
  ["expense", "2026-07-15", "Fuel & Vehicle Expenses", "Indian Oil Fuel Station", "Fuel for college bus and utility vehicle", "Credit Card", "Full Payment", 9800, "EXP-2026-0019"],
  ["expense", "2026-10-12", "Fuel & Vehicle Expenses", "Bharat Petroleum", "Campus vehicle fuel and toll expenses", "Cash", "Partial Payment", 6200, "EXP-2026-0020", "Pending"],
].map(([type, date, category, to, description, method, paymentMode, amount, receiptNo, status]) => ({
  type, date, category, to, description, method, paymentMode, amount,
  reference: receiptNo, receiptNo, ...(status ? { status } : {}),
} as unknown as Omit<Transaction, "id" | "status"> & { status?: Transaction["status"] }));
sampleTransactions.forEach((t) => add(t));
export const seedTransactions = txns;

const course = (name: string) => {
  const match = seedCourses.find((item) => item.name === name);
  if (!match) throw new Error(`Missing seed course: ${name}`);
  return match;
};
const studentRows: Omit<Student, "id">[] = [
  { name: "Neha Joshi", regNo: "ADM2026-101", course: "Python", department: course("Python").department, phone: "9845000101", registeredOn: "2026-07-12", totalFee: 16000, courseId: course("Python").id, track: "Fast Track", duration: course("Python").fastTrack, installments: [{ label: "Full Payment", due: "2026-07-12", amount: 16000 }] },
  { name: "Sahil Khan", regNo: "ADM2026-102", course: "Tally", department: course("Tally").department, phone: "9845000102", registeredOn: "2026-07-18", totalFee: 12000, courseId: course("Tally").id, track: "Fast Track", duration: course("Tally").fastTrack, installments: [{ label: "Full Payment", due: "2026-07-18", amount: 12000 }] },
  { name: "Priya Desai", regNo: "ADM2026-103", course: "Advanced Data Science", department: course("Advanced Data Science").department, phone: "9845000103", registeredOn: "2026-07-24", totalFee: 75000, courseId: course("Advanced Data Science").id, track: "Normal Track", duration: course("Advanced Data Science").normalTrack, installments: [{ label: "Instalment 1", due: "2026-07-25", amount: 25000 }, { label: "Instalment 2", due: "2026-09-25", amount: 25000 }, { label: "Instalment 3", due: "2026-11-25", amount: 25000 }] },
  { name: "Rahul Kulkarni", regNo: "ADM2026-104", course: "AI Integrated Graphic Design", department: course("AI Integrated Graphic Design").department, phone: "9845000104", registeredOn: "2026-08-02", totalFee: 40000, courseId: course("AI Integrated Graphic Design").id, track: "Fast Track", duration: course("AI Integrated Graphic Design").fastTrack, installments: [{ label: "Instalment 1", due: "2026-08-02", amount: 20000 }, { label: "Instalment 2", due: "2026-09-02", amount: 20000 }] },
  { name: "Sneha Patil", regNo: "ADM2026-105", course: "MBA", department: course("MBA").department, phone: "9845000105", registeredOn: "2026-08-01", totalFee: 140000, courseId: course("MBA").id, track: "Fast Track", duration: course("MBA").fastTrack, installments: [{ label: "Instalment 1", due: "2026-08-05", amount: 35000 }, { label: "Instalment 2", due: "2026-10-05", amount: 35000 }, { label: "Instalment 3", due: "2026-12-05", amount: 35000 }, { label: "Instalment 4", due: "2027-02-05", amount: 35000 }] },
  { name: "Imran Sheikh", regNo: "ADM2026-106", course: "Tableau", department: course("Tableau").department, phone: "9845000106", registeredOn: "2026-09-10", totalFee: 15000, courseId: course("Tableau").id, track: "Fast Track", duration: course("Tableau").fastTrack, installments: [{ label: "Full Payment", due: "2026-09-10", amount: 15000 }] },
  { name: "Kavya Rao", regNo: "ADM2026-107", course: "Animation & VFX", department: course("Animation & VFX").department, phone: "9845000107", registeredOn: "2026-08-20", totalFee: 75000, courseId: course("Animation & VFX").id, track: "Normal Track", duration: course("Animation & VFX").normalTrack, installments: [{ label: "Instalment 1", due: "2026-08-20", amount: 25000 }, { label: "Instalment 2", due: "2026-11-20", amount: 25000 }, { label: "Instalment 3", due: "2027-02-20", amount: 25000 }] },
  { name: "Manoj Hegde", regNo: "ADM2026-108", course: "Certificate in Digital Marketing", department: course("Certificate in Digital Marketing").department, phone: "9845000108", registeredOn: "2026-10-14", totalFee: 60000, courseId: course("Certificate in Digital Marketing").id, track: "Fast Track", duration: course("Certificate in Digital Marketing").fastTrack, installments: [{ label: "Instalment 1", due: "2026-10-30", amount: 30000 }, { label: "Instalment 2", due: "2026-11-30", amount: 30000 }] },
  { name: "Deepa Bhat", regNo: "ADM2026-109", course: "Zoho Books", department: course("Zoho Books").department, phone: "9845000109", registeredOn: "2026-10-05", totalFee: 15000, courseId: course("Zoho Books").id, track: "Fast Track", duration: course("Zoho Books").fastTrack, installments: [{ label: "Instalment 1", due: "2026-10-05", amount: 7500 }, { label: "Instalment 2", due: "2026-10-20", amount: 7500 }] },
  { name: "Farhan Ali", regNo: "ADM2026-110", course: "SAP FICO", department: course("SAP FICO").department, phone: "9845000110", registeredOn: "2026-07-01", totalFee: 17000, courseId: course("SAP FICO").id, track: "Fast Track", duration: course("SAP FICO").fastTrack, installments: [{ label: "Full Payment", due: "2026-07-01", amount: 17000 }] },
  { name: "Anjali Menon", regNo: "ADM2026-111", course: "Expertise in Cyber Security", department: course("Expertise in Cyber Security").department, phone: "9845000111", registeredOn: "2026-07-15", totalFee: 100000, courseId: course("Expertise in Cyber Security").id, track: "Fast Track", duration: course("Expertise in Cyber Security").fastTrack, installments: [{ label: "Instalment 1", due: "2026-07-15", amount: 25000 }, { label: "Instalment 2", due: "2026-09-15", amount: 25000 }, { label: "Instalment 3", due: "2026-11-15", amount: 25000 }, { label: "Instalment 4", due: "2027-01-15", amount: 25000 }] },
  { name: "Vikram Shetty", regNo: "ADM2026-112", course: "MS Excel", department: course("MS Excel").department, phone: "9845000112", registeredOn: "2026-08-03", totalFee: 6000, courseId: course("MS Excel").id, track: "Fast Track", duration: course("MS Excel").fastTrack, installments: [{ label: "Full Payment", due: "2026-08-03", amount: 6000 }] },
  { name: "Pooja Naik", regNo: "ADM2026-113", course: "BCA", department: course("BCA").department, phone: "9845000113", registeredOn: "2026-07-08", totalFee: 120000, courseId: course("BCA").id, track: "Fast Track", duration: course("BCA").fastTrack, installments: [{ label: "Instalment 1", due: "2026-07-10", amount: 40000 }, { label: "Instalment 2", due: "2026-10-10", amount: 40000 }, { label: "Instalment 3", due: "2027-01-10", amount: 40000 }] },
  { name: "Arjun Kamath", regNo: "ADM2026-114", course: "BBA", department: course("BBA").department, phone: "9845000114", registeredOn: "2026-07-09", totalFee: 105000, courseId: course("BBA").id, track: "Fast Track", duration: course("BBA").fastTrack, installments: [{ label: "Instalment 1", due: "2026-07-12", amount: 35000 }, { label: "Instalment 2", due: "2026-10-12", amount: 35000 }, { label: "Instalment 3", due: "2027-01-12", amount: 35000 }] },
  { name: "Shreya Gokhale", regNo: "ADM2026-115", course: "BCOM", department: course("BCOM").department, phone: "9845000115", registeredOn: "2026-07-10", totalFee: 90000, courseId: course("BCOM").id, track: "Fast Track", duration: course("BCOM").fastTrack, installments: [{ label: "Instalment 1", due: "2026-07-14", amount: 30000 }, { label: "Instalment 2", due: "2026-10-14", amount: 30000 }, { label: "Instalment 3", due: "2027-01-14", amount: 30000 }] },
  { name: "Rohit Nayak", regNo: "ADM2026-116", course: "BA", department: course("BA").department, phone: "9845000116", registeredOn: "2026-07-11", totalFee: 60000, courseId: course("BA").id, track: "Fast Track", duration: course("BA").fastTrack, installments: [{ label: "Instalment 1", due: "2026-07-13", amount: 30000 }, { label: "Instalment 2", due: "2027-01-13", amount: 30000 }] },
  { name: "Lakshmi Iyengar", regNo: "ADM2026-117", course: "Finance & Accounting", department: course("Finance & Accounting").department, phone: "9845000117", registeredOn: "2026-07-20", totalFee: 49000, courseId: course("Finance & Accounting").id, track: "Normal Track", duration: course("Finance & Accounting").normalTrack, installments: [{ label: "Instalment 1", due: "2026-07-22", amount: 24500 }, { label: "Instalment 2", due: "2026-10-22", amount: 24500 }] },
];
export const seedStudents: Student[] = studentRows.map((student, index) => {
  const id = `S${String(index + 1).padStart(3, "0")}`;
  return {
    ...student,
    id,
    email: `${id.toLowerCase()}@example.com`,
    admissionStatus: "Admitted",
  };
});

const paymentRows: Omit<FeePayment, "id">[] = [
  { studentId: "S001", date: "2026-07-15", amount: 16000, method: "UPI", reference: "TXN880219", receiptNo: "RCP-2026-1028" },
  { studentId: "S002", date: "2026-07-20", amount: 12000, method: "Cash", reference: "", receiptNo: "RCP-2026-1029" },
  { studentId: "S003", date: "2026-07-25", amount: 25000, method: "Bank Transfer", reference: "TXN880220", receiptNo: "RCP-2026-1030" },
  { studentId: "S004", date: "2026-08-02", amount: 20000, method: "Cash", reference: "", receiptNo: "RCP-2026-1031" },
  { studentId: "S005", date: "2026-08-05", amount: 35000, method: "Cheque", reference: "483204", receiptNo: "RCP-2026-1032" },
  { studentId: "S007", date: "2026-08-20", amount: 25000, method: "Bank Transfer", reference: "TXN880223", receiptNo: "RCP-2026-1033" },
  { studentId: "S006", date: "2026-09-10", amount: 15000, method: "UPI", reference: "TXN880222", receiptNo: "RCP-2026-1034" },
  { studentId: "S003", date: "2026-09-28", amount: 10000, method: "UPI", reference: "TXN880221", receiptNo: "RCP-2026-1035" },
  { studentId: "S009", date: "2026-10-05", amount: 7500, method: "Cash", reference: "", receiptNo: "RCP-2026-1036" },
  { studentId: "S010", date: "2026-07-03", amount: 17000, method: "Bank Transfer", reference: "TXN880224", receiptNo: "RCP-2026-1037" },
  { studentId: "S013", date: "2026-07-10", amount: 40000, method: "Cheque", reference: "483205", receiptNo: "RCP-2026-1038" },
  { studentId: "S014", date: "2026-07-12", amount: 35000, method: "UPI", reference: "TXN880228", receiptNo: "RCP-2026-1039" },
  { studentId: "S016", date: "2026-07-13", amount: 30000, method: "Bank Transfer", reference: "TXN880230", receiptNo: "RCP-2026-1040" },
  { studentId: "S015", date: "2026-07-14", amount: 30000, method: "Cash", reference: "", receiptNo: "RCP-2026-1041" },
  { studentId: "S011", date: "2026-07-15", amount: 25000, method: "UPI", reference: "TXN880225", receiptNo: "RCP-2026-1042" },
  { studentId: "S017", date: "2026-07-22", amount: 24500, method: "UPI", reference: "TXN880231", receiptNo: "RCP-2026-1043" },
  { studentId: "S012", date: "2026-08-03", amount: 6000, method: "Cash", reference: "", receiptNo: "RCP-2026-1044" },
  { studentId: "S011", date: "2026-09-16", amount: 25000, method: "Bank Transfer", reference: "TXN880226", receiptNo: "RCP-2026-1045" },
  { studentId: "S013", date: "2026-10-12", amount: 40000, method: "Bank Transfer", reference: "TXN880227", receiptNo: "RCP-2026-1046" },
  { studentId: "S015", date: "2026-10-14", amount: 30000, method: "UPI", reference: "TXN880229", receiptNo: "RCP-2026-1047" },
];
export const seedPayments: FeePayment[] = paymentRows.map((payment, index) => ({ ...payment, id: `P${String(index + 1).padStart(3, "0")}` }));

const bookMovements = [
  ...seedTransactions.map((transaction) => ({
  date: transaction.date,
  cash: transaction.method === "Cash",
  amount: transaction.type === "income" ? transaction.amount : -transaction.amount,
  })),
  ...seedPayments.map((payment) => ({ date: payment.date, cash: payment.method === "Cash", amount: payment.amount })),
];
const requiredOpening = (cash: boolean) => {
  const movements = bookMovements.filter((movement) => movement.cash === cash)
    .sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  let lowest = 0;
  let beforeJuly = 0;
  movements.forEach((movement) => {
    running += movement.amount;
    lowest = Math.min(lowest, running);
    if (movement.date < "2026-07-01") beforeJuly += movement.amount;
  });
  const julyMinimum = cash ? 50_000 - beforeJuly : 0;
  return Math.ceil(Math.max(0, -lowest, julyMinimum) / 1_000) * 1_000;
};
export const OPENING = {
  cash: requiredOpening(true),
  bank: Math.max(4_000_000, requiredOpening(false)),
  petty: 10_000,
};

export const seedPetty: PettyEntry[] = [
  { id: "PC01", date: "2026-10-01", kind: "received", category: "Top-up", amount: 5000, description: "Top-up from main cash", reference: "PCV-101" },
  { id: "PC02", date: "2026-10-03", kind: "paid", category: "Refreshments", amount: 640, description: "Tea for parents' meeting", reference: "PCV-102" },
  { id: "PC03", date: "2026-10-06", kind: "paid", category: "Courier", amount: 350, description: "Courier – university forms", reference: "PCV-103" },
  { id: "PC04", date: "2026-10-09", kind: "paid", category: "Stationery", amount: 1210, description: "Registers and files", reference: "PCV-104" },
  { id: "PC05", date: "2026-10-13", kind: "paid", category: "Local Travel", amount: 480, description: "Auto fare – bank visit", reference: "PCV-105" },
  { id: "PC06", date: "2026-10-15", kind: "paid", category: "Repairs", amount: 900, description: "Fan repair – office", reference: "PCV-106" },
];

export const seedSettlements: Settlement[] = [
  { id: "SET-01", date: "2026-09-14", method: "Cash", count: 1, recorded: 16000, actual: 16000, notes: "Counted by cashier", finalized: true },
  { id: "SET-02", date: "2026-09-15", method: "Card", count: 1, recorded: 20000, actual: 19620, notes: "Card provider fee deducted", finalized: true },
  { id: "SET-03", date: "2026-10-15", method: "Cash", count: 2, recorded: 37500, actual: 37000, notes: "₹500 short at counter", finalized: false },
  { id: "SET-04", date: "2026-10-15", method: "UPI", count: 1, recorded: 22000, actual: null, notes: "", finalized: false },
];
