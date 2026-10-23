import type { Course, CourseCatalog, CourseDuration, Student } from "./types";

const d = (value: number, unit: CourseDuration["unit"]): CourseDuration => ({ value, unit });

export const SEED_DEPARTMENTS = ["AI Course", "Multimedia", "Management", "UG & PG", "Office Automation & Programming", "Accounting"];

const rows: [string, string, number | undefined, CourseDuration, CourseDuration?][] = [
  ["Master's in Gen AI & Agentic AI", "AI Course", 300000, d(12, "months"), d(24, "months")],
  ["Master's in AI Big Data & Advance MLOps", "AI Course", 200000, d(6, "months"), d(12, "months")],
  ["Advanced Data Science", "AI Course", 75000, d(3, "months"), d(6, "months")],
  ["Certificate in Big Data", "AI Course", 30000, d(2, "months"), d(4, "months")],
  ["Expertise in Cyber Security", "AI Course", 100000, d(12, "months"), d(24, "months")],
  ["Certificate in Data Security", "AI Course", 30000, d(2, "months"), d(4, "months")],
  ["Advanced Product Management", "AI Course", 100000, d(3, "months"), d(6, "months")],
  ["AI Integrated Graphic Design", "Multimedia", 40000, d(3, "months"), d(6, "months")],
  ["AI Integrated Video Editing & VFX", "Multimedia", 70000, d(6, "months"), d(12, "months")],
  ["Animation & VFX", "Multimedia", 75000, d(8, "months"), d(16, "months")],
  ["Film Production", "Multimedia", 100000, d(12, "months"), d(24, "months")],
  ["Performance Marketing & Social Media Marketing", "Multimedia", 50000, d(3, "months"), d(6, "months")],
  ["Certificate in Digital Marketing", "Multimedia", 60000, d(6, "months"), d(12, "months")],
  ["Diploma in 3D Animation & Visual Effects", "Multimedia", 70000, d(8, "months"), d(16, "months")],
  ["Auto Desk, Maya", "Multimedia", 25000, d(1, "months"), d(2, "months")],
  ["After Effect", "Multimedia", 14500, d(15, "days"), d(1, "months")],
  ["Adobe Premier", "Multimedia", 14500, d(15, "days"), d(1, "months")],
  ["Adobe Photoshop", "Multimedia", 9500, d(15, "days"), d(1, "months")],
  ["Adobe Illustrator", "Multimedia", 9500, d(15, "days"), d(1, "months")],
  ["Corel Draw", "Multimedia", 5000, d(15, "days"), d(1, "months")],
  ["Business & Entrepreneurship", "Management", 49000, d(6, "months"), d(12, "months")],
  ["Sales & Business Development", "Management", 49000, d(6, "months"), d(12, "months")],
  ["Marketing & Growth", "Management", 49000, d(6, "months"), d(12, "months")],
  ["Finance & Accounting", "Management", 49000, d(6, "months"), d(12, "months")],
  ["People & Operations", "Management", 75000, d(6, "months"), d(12, "months")],
  ["Product Management", "Management", 75000, d(6, "months"), d(12, "months")],
  ["BCA", "UG & PG", undefined, d(3, "years")], ["BBA", "UG & PG", undefined, d(3, "years")],
  ["BCOM", "UG & PG", undefined, d(3, "years")], ["BA", "UG & PG", undefined, d(3, "years")],
  ["MBA", "UG & PG", undefined, d(2, "years")], ["MCA", "UG & PG", undefined, d(2, "years")],
  ["MCOM", "UG & PG", undefined, d(2, "years")], ["MA", "UG & PG", undefined, d(2, "years")],
  ["Advance Diploma in Computer Application", "Office Automation & Programming", 10000, d(1, "months"), d(2, "months")],
  ["Python", "Office Automation & Programming", 16000, d(5, "months"), d(10, "months")],
  ["C & C++", "Office Automation & Programming", 10000, d(1, "months"), d(2, "months")], ["C++", "Office Automation & Programming", 10000, d(1, "months"), d(2, "months")],
  ["Advanced Excel", "Office Automation & Programming", 9000, d(15, "days"), d(1, "months")], ["MS Excel", "Office Automation & Programming", 6000, d(10, "days"), d(1, "months")],
  ["Zoho Books", "Office Automation & Programming", 15000, d(15, "days"), d(1, "months")], ["Power BI", "Office Automation & Programming", 15000, d(15, "days"), d(1, "months")],
  ["Tableau", "Office Automation & Programming", 15000, d(15, "days"), d(1, "months")], ["AI in Accounting", "Accounting", 49000, d(6, "months"), d(12, "months")],
  ["Manual + SAP", "Accounting", 20000, d(2, "months"), d(4, "months")], ["Manual + Tally", "Accounting", 8000, d(2, "months"), d(4, "months")],
  ["SAP FICO", "Accounting", 18500, d(15, "days"), d(1, "months")], ["Tally", "Accounting", 12000, d(1, "months"), d(2, "months")],
];

export const seedCourses: Course[] = rows.map(([name, department, fee, fastTrack, normalTrack], index) => ({
  id: `COURSE-${String(index + 1).padStart(3, "0")}`,
  serialNumber: index + 1,
  name,
  department,
  fee,
  fastTrack,
  normalTrack,
  status: "Active",
}));

export const seedCourseCatalog: CourseCatalog = {
  departments: SEED_DEPARTMENTS,
  courses: seedCourses,
  history: [],
};

export function studentCourse(student: Student, catalog: CourseCatalog) {
  return catalog.courses.find((course) => course.id === student.courseId) ??
    catalog.courses.find((course) => course.name === student.course);
}

export function studentDepartment(student: Student, catalog: CourseCatalog) {
  return student.department || studentCourse(student, catalog)?.department || "";
}

export function formatCourseDuration(duration?: CourseDuration) {
  if (!duration) return "—";
  if (duration.unit === "days") return `${duration.value} ${duration.value === 1 ? "day" : "days"}`;
  return `${duration.value}${duration.unit === "months" ? "m" : "y"}`;
}

export function courseDurationEndDate(startDate: string, duration: CourseDuration) {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (duration.unit === "days") date.setUTCDate(date.getUTCDate() + duration.value);
  if (duration.unit === "months") date.setUTCMonth(date.getUTCMonth() + duration.value);
  if (duration.unit === "years") date.setUTCFullYear(date.getUTCFullYear() + duration.value);
  return date.toISOString().slice(0, 10);
}
