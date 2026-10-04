import { Link } from "@tanstack/react-router";

const ITEMS = [
  { to: "/finance/calendar", label: "Календарь", active: "calendar" },
  { to: "/finance/counterparties", label: "Контрагенты", active: "counterparties" },
  { to: "/finance/reports", label: "Отчёты", active: "reports" },
] as const;

export function FinanceTabs({ active }: { active: "calendar" | "counterparties" | "reports" }) {
  return (
    <div className="mt-6 border-b border-border">
      <div className="flex gap-5 overflow-x-auto whitespace-nowrap sm:gap-6">
        {ITEMS.map((item) => {
          const isActive = item.active === active;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={
                "-mb-px border-b-2 pb-3 text-sm font-medium transition-colors " +
                (isActive
                  ? "border-primary text-primary"
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
