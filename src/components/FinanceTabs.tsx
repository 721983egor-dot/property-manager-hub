import { Link } from "@tanstack/react-router";

const ITEMS = [
  { to: "/finance/calendar", label: "Календарь", active: "calendar" },
  { to: "/finance/counterparties", label: "Контрагенты", active: "counterparties" },
  { to: "/finance/reports", label: "Отчёты", active: "reports" },
] as const;

export function FinanceTabs({ active }: { active: "calendar" | "counterparties" | "reports" }) {
  return (
    <div className="mt-6 border-b border-border">
      <div className="flex gap-1 overflow-x-auto whitespace-nowrap sm:gap-2">
        {ITEMS.map((item) => {
          const isActive = item.active === active;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={
                "-mb-px border-b-2 px-3 pb-3 text-sm font-medium transition-colors " +
                (isActive
                  ? "border-teal-700 text-teal-800"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
