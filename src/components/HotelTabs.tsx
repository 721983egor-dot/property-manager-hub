import { Link } from "@tanstack/react-router";

const ITEMS = [
  { to: "/hotel", label: "Сводка", active: "summary" as const },
  { to: "/hotel/rooms", label: "Номера", active: "rooms" as const },
  { to: "/hotel/owners", label: "Собственники", active: "owners" as const },
  { to: "/hotel/sync", label: "Bnovo", active: "sync" as const },
  {
    to: "/chats",
    label: "Чаты сайта",
    active: "chats" as const,
    search: { source: "n11" as const },
  },
] as const;

export function HotelTabs({
  active,
}: {
  active: "summary" | "rooms" | "owners" | "sync" | "chats";
}) {
  return (
    <div className="mt-6 border-b border-border">
      <div className="flex gap-5 overflow-x-auto whitespace-nowrap sm:gap-6">
        {ITEMS.map((item) => {
          const isActive = item.active === active;
          return (
            <Link
              key={item.to + item.label}
              to={item.to}
              {...("search" in item ? { search: item.search } : {})}
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
