import { Check } from "lucide-react";
import type { PaymentStatus } from "@/lib/finance";
import "./payment-completion.css";

/** Same completion indicator in the calendar, day details and counterparty ledger. */
export function PaymentCompletion({
  status,
  label,
  onComplete,
  disabled = false,
}: {
  status: PaymentStatus;
  label: string;
  onComplete: () => void;
  disabled?: boolean;
}) {
  if (status === "paid")
    return (
      <span
        className="finance-payment-completion is-paid"
        role="img"
        aria-label="Операция исполнена"
        title="Операция исполнена"
      >
        <Check size={18} strokeWidth={2.8} aria-hidden="true" />
      </span>
    );
  return (
    <button
      type="button"
      className="finance-payment-completion"
      aria-label={`Провести операцию: ${label}`}
      title="Отметить исполненной"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onComplete();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Check size={18} aria-hidden="true" />
    </button>
  );
}
