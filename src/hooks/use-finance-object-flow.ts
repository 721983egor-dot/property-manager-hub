import { useEffect, useState } from "react";
import type { ObjectMoneyFlow } from "@/lib/finance-object-flow";
const key = "rm-os-finance-object-flow";
export function useFinanceObjectFlow() {
  const [flow, setFlow] = useState<ObjectMoneyFlow>("company");
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved === "company" || saved === "owner" || saved === "total") setFlow(saved);
    } catch {
      /* Storage is optional. */
    }
  }, []);
  return [
    flow,
    (value: ObjectMoneyFlow) => {
      setFlow(value);
      try {
        sessionStorage.setItem(key, value);
      } catch {
        /* Storage is optional. */
      }
    },
  ] as const;
}
