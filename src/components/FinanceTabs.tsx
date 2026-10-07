import "./finance-ui.css";
import { Link } from "@tanstack/react-router";

const ITEMS = [
  { to: "/finance", label: "Дашборд", active: "dashboard" },
  { to: "/finance/calendar", label: "Календарь", active: "calendar" },
  { to: "/finance/objects", label: "Объекты", active: "objects" },
  { to: "/finance/counterparties", label: "Контрагенты", active: "counterparties" },
  { to: "/finance/reports", label: "Отчёты", active: "reports" },
  { to: "/finance/settings", label: "Настройки", active: "settings" },
] as const;

export function FinanceTabs({
  active,
}: {
  active: "objects" | "dashboard" | "calendar" | "counterparties" | "reports" | "settings";
}) {
  return (
    <div className="finance-nav mt-6 border-b border-border">
      <div className="flex gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap sm:gap-2">
        {ITEMS.map((item) => {
          const isActive = item.active === active;
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.active === "dashboard" }}
              className={
                "-mb-px border-b-2 px-3 pb-3 text-sm font-medium transition-colors " +
                (isActive
                  ? "border-[#383838] text-[#383838]"
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
