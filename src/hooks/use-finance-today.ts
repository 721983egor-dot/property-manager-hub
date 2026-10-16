import { useEffect, useState } from "react";
import { financeToday } from "@/lib/finance-payment-status";

/** Обновляет открытый календарь после наступления нового финансового дня. */
export function useFinanceToday() {
  const [today, setToday] = useState(financeToday);
  useEffect(() => {
    const refresh = () => setToday(financeToday());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return today;
}
