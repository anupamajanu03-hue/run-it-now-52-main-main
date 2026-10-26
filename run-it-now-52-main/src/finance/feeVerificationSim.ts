import { seedPayments, seedStudents } from "./data";
import { verifyFeeForMonth, type FeeVerificationResult } from "./billing";
import type { FeePayment, Student } from "./types";

export const FEE_VERIFICATION_SOURCE_NOTE =
  "Prototype: Administration's system is simulated.";

export type FeeVerificationReplyStatus =
  | "Ready to reply"
  | "Awaiting payment"
  | "Needs review"
  | "Replied"
  | "Updated";

export interface FeeVerificationReply {
  date: string;
  examRequestId: string;
  admissionNo: string;
  feeMonth: string;
  remark: string;
  status: string;
  verifiedPaid: number;
  verifiedOutstanding: number;
  verifiedStatus: string;
}

export interface FeeVerificationRequestReply {
  date: string;
  remark: string;
  status: string;
  awaitingAdmissionNos?: string[];
}

export interface FeeVerificationRequest {
  id: string;
  name: string;
  admissionNo: string;
  batch: string;
  monthlyFee: number;
  paid: number;
  outstanding: number;
  replyStatus?: "Replied" | "Updated";
  replies?: FeeVerificationReply[];
}

export interface SimulatedExamRequest {
  examRequestId: string;
  course: string;
  examTitle: string;
  examDate: string;
  feeMonth: string;
  receivedFrom: "Academic Department";
  instructions: string;
  requestedAt: string;
  students: FeeVerificationRequest[];
  feeVerificationRequests: FeeVerificationRequest[];
  replies?: FeeVerificationRequestReply[];
}

export function getFeeVerificationReplyStatus(
  item: FeeVerificationRequest,
  result: FeeVerificationResult,
): FeeVerificationReplyStatus {
  if (item.replyStatus === "Replied" || item.replyStatus === "Updated") return item.replyStatus;
  if (result.status === "Not found") return "Needs review";
  return result.status === "Fee Paid" ? "Ready to reply" : "Awaiting payment";
}

export function recordFeeVerificationReply(
  item: FeeVerificationRequest,
  reply: FeeVerificationReply,
  updated = false,
) {
  item.replies ??= [];
  item.replies.push(reply);
  item.replyStatus = updated ? "Updated" : "Replied";
}

export function recordFeeVerificationRequestReply(
  request: SimulatedExamRequest,
  reply: FeeVerificationRequestReply,
) {
  request.replies ??= [];
  request.replies.push(reply);
}

export function getFeeVerificationAttentionRequests(
  requests: SimulatedExamRequest[],
  students: Student[],
  payments: FeePayment[],
) {
  return requests.map((request) => {
    const results = request.students.map((student) => ({
      student,
      result: verifyFeeForMonth(student, request.feeMonth, students, payments),
    }));
    return {
      requestId: request.examRequestId,
      examDate: request.examDate,
      needsReply: results.some(({ student, result }) => {
        const status = getFeeVerificationReplyStatus(student, result);
        return status === "Ready to reply" || status === "Needs review";
      }),
      hasUnpaid: results.some(({ result }) => result.status === "Partially Paid" || result.status === "Fee Payment Pending"),
    };
  });
}

const feeMonth = "2026-10";
const examDate = "2026-10-20";
const receivedFrom = "Academic Department" as const;
const requestedAt = "2026-10-16T09:00:00+05:30";
const instructions = "Please verify the tuition fee position for the listed students before examination eligibility is finalized.";
const notFoundStudent: FeeVerificationRequest = {
  id: "FVR-NOT-FOUND",
  name: "Unmatched Administration record",
  admissionNo: "ADM-2026-0999",
  batch: "2026-A",
  monthlyFee: 8000,
  paid: 0,
  outstanding: 8000,
};

function buildRequest(
  examRequestId: string,
  course: string,
  examTitle: string,
  date: string,
  mismatchAdmissionNo?: string,
): SimulatedExamRequest {
  const students = seedStudents
    .filter((student) => student.course === course && student.installments.length > 0)
    .map((student, index) => {
      const result = verifyFeeForMonth(
        { admissionNo: student.regNo },
        feeMonth,
        seedStudents,
        seedPayments,
      );
      const mismatch = student.regNo === mismatchAdmissionNo;
      const monthlyFee = result.required || student.installments[0]?.amount || 0;
      const paid = mismatch && result.paid > 0 ? result.paid - 1000 : result.paid;
      return {
        id: `${examRequestId}-FVR-${String(index + 1).padStart(2, "0")}`,
        name: student.name,
        admissionNo: student.regNo,
        batch: student.batch ?? "2026-A",
        monthlyFee,
        paid,
        outstanding: monthlyFee - paid,
      };
    });

  const requestStudents = [...students, { ...notFoundStudent, id: `${examRequestId}-FVR-NOT-FOUND` }];
  return {
    examRequestId,
    course,
    examTitle,
    examDate: date,
    feeMonth,
    receivedFrom,
    instructions,
    requestedAt,
    students: requestStudents,
    feeVerificationRequests: requestStudents,
  };
}

export const sampleExamRequests: SimulatedExamRequest[] = [
  buildRequest("EXR-1001", "Python", "Module Assessment", "2026-10-28", "ADM-2026-0101"),
  buildRequest("EXR-1002", "Advanced Data Science", "Module Assessment", examDate, "ADM-2026-0103"),
  buildRequest("EXR-1003", "BCOM", "Module Assessment", "2026-10-30", "ADM-2026-0115"),
];
