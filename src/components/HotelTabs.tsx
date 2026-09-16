import { Link } from "@tanstack/react-router";

const ITEMS = [
  { to: "/hotel", label: "Сводка" },
  { to: "/hotel/rooms", label: "Номера" },
  { to: "/hotel/owners", label: "Собственники" },
  { to: "/hotel/sync", label: "Bnovo" },
] as const;

export function HotelTabs({
  active,
}: {
  active: "summary" | "rooms" | "owners" | "sync";
}) {
  return (
    <div className="mt-6 border-b border-border">
      <div className="flex gap-5 overflow-x-auto whitespace-nowrap sm:gap-6">
        {ITEMS.map((item) => {
          const isActive =
            (item.to === "/hotel" && active === "summary") ||
            (item.to === "/hotel/rooms" && active === "rooms") ||
            (item.to === "/hotel/owners" && active === "owners") ||
            (item.to === "/hotel/sync" && active === "sync");
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
