import { objectFlowLabels, type ObjectMoneyFlow } from "@/lib/finance-object-flow";
export function FinanceObjectFlowSelector({
  value,
  onChange,
}: {
  value: ObjectMoneyFlow;
  onChange: (value: ObjectMoneyFlow) => void;
}) {
  return (
    <div className="finance-object-flow" role="group" aria-label="Поток денег объекта">
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
