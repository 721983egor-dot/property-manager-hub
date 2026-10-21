import { PaymentUndoButton } from "./PaymentUndoButton";
import { Check } from "lucide-react";
import type { Payment, PaymentStatus } from "@/lib/finance";
import "./payment-completion.css";

/** Same completion indicator in the calendar, day details and counterparty ledger. */
export function PaymentCompletion({
  status,
  payment,
  label,
  onComplete,
  disabled = false,
}: {
  status: PaymentStatus;
  payment?: Payment;
  label: string;
  onComplete: () => void;
  disabled?: boolean;
}) {
  if (status === "paid")
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="finance-payment-completion is-paid"
          role="img"
          aria-label="Операция исполнена"
          title="Операция исполнена"
        >
          <Check size={18} strokeWidth={2.8} aria-hidden="true" />
        </span>
        {payment && <PaymentUndoButton payment={payment} disabled={disabled} />}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      {status === "partial" && payment && (
        <PaymentUndoButton payment={payment} disabled={disabled} />
      )}
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
    </span>
  );
}
