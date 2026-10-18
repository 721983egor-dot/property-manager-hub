import "./finance-flow-selector.css";
import { objectFlowLabels, type ObjectMoneyFlow } from "@/lib/finance-object-flow";
export function FinanceObjectFlowSelector({
  value,
  onChange,
  label = "Поток денег объекта",
}: {
  label?: string;
  value: ObjectMoneyFlow;
  onChange: (value: ObjectMoneyFlow) => void;
}) {
  return (
    <div className="finance-object-flow" role="group" aria-label={label}>
      {(Object.keys(objectFlowLabels) as ObjectMoneyFlow[]).map((flow) => (
        <button
          type="button"
          key={flow}
          data-flow={flow}
          aria-pressed={value === flow}
          onClick={() => onChange(flow)}
        >
          {objectFlowLabels[flow]}
        </button>
      ))}
    </div>
  );
}
