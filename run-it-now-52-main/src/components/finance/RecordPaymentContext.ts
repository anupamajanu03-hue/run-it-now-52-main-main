import { createContext, useContext } from "react";

type RecordPaymentContextValue = { open: (personId?: string) => void };

export const RecordPaymentContext = createContext<RecordPaymentContextValue | null>(null);

export function useRecordPayment() {
  const context = useContext(RecordPaymentContext);
  if (!context) throw new Error("useRecordPayment must be used inside RecordPaymentProvider");
  return context;
}
