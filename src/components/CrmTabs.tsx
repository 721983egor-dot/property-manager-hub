import { Link } from "@tanstack/react-router";

/** Вкладки верхнего уровня раздела «CRM». */
export function CrmTabs({ active }: { active: "clients" }) {
  return (
    <div className="mt-6 border-b border-border">
      <div className="flex gap-6">
        <Link
          to="/crm/clients"
          className={
            "-mb-px border-b-2 pb-3 text-sm font-medium transition-colors " +
            (active === "clients"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground")
          }
        >
          Клиенты
        </Link>
      </div>
    </div>
  );
}
