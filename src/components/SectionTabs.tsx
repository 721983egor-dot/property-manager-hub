import { Link } from "@tanstack/react-router";

const ITEMS = [
  { to: "/", label: "Объекты" },
  { to: "/complexes", label: "Комплексы" },
] as const;

/** Вкладки верхнего уровня внутри раздела «Объекты». */
export function SectionTabs({ active }: { active: "objects" | "complexes" }) {
  return (
    <div className="mt-6 border-b border-border">
      <div className="flex gap-6">
        {ITEMS.map((item) => {
          const isActive =
            (item.to === "/" && active === "objects") ||
            (item.to === "/complexes" && active === "complexes");
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
