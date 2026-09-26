import { Link } from "@tanstack/react-router";

const ITEMS = [
  { to: "/maintenance/objects", label: "Объекты", active: "objects" },
  { to: "/maintenance/tasks", label: "Задачи", active: "tasks" },
  { to: "/maintenance/services", label: "Услуги", active: "services" },
] as const;

export function MaintenanceTabs({
  active,
}: {
  active: "objects" | "tasks" | "services";
}) {
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
