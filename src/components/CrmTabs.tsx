import { Link } from "@tanstack/react-router";

const ITEMS = [
  { to: "/crm/clients", label: "Клиенты", key: "clients" },
  { to: "/crm/leads", label: "Заявки", key: "leads" },
] as const;

/** Вкладки верхнего уровня раздела «CRM». */
export function CrmTabs({ active }: { active: "clients" | "leads" }) {
  return (
    <div className="mt-6 border-b border-border">
      <div className="flex gap-5 overflow-x-auto whitespace-nowrap sm:gap-6">
        {ITEMS.map((item) => {
          const isActive = item.key === active;
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
