import { useState } from "react";
import { financePropertyLabel, type FinancePropertyOption } from "@/lib/finance";
import type { FinanceObjectAssignment } from "@/lib/finance-objects";
export function OwnerPropertyPicker({
  properties,
  assignments,
  ownerId,
  selected,
  onChange,
}: {
  properties: FinancePropertyOption[];
  assignments: FinanceObjectAssignment[];
  ownerId: string | null;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = properties.filter(
    (p) =>
      (p.status !== "archived" || selected.includes(p.id)) &&
      financePropertyLabel(p).toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className="space-y-2">
      <p className="text-sm font-medium">Объекты собственника · {selected.length}</p>
      <input
        className="w-full rounded-md border px-3 py-2 text-sm"
        aria-label="Поиск объектов собственника"
        placeholder="Найти объект"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-52 overflow-auto rounded-md border divide-y">
        {visible.map((p) => {
          const cfg = assignments.find((a) => a.property_id === p.id);
          const occupied = !!cfg?.owner_counterparty_id && cfg.owner_counterparty_id !== ownerId;
          return (
            <label key={p.id} className="flex items-start gap-3 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(p.id)}
                disabled={occupied}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id),
                  )
                }
              />
              <span>
                {financePropertyLabel(p)}
                {occupied && (
                  <small className="block text-muted-foreground">
                    Уже прикреплён другой собственник
                  </small>
                )}
                {!occupied && p.status === "archived" && (
                  <small className="block text-muted-foreground">Архивный объект</small>
                )}
              </span>
            </label>
          );
        })}
        {!visible.length && <p className="p-3 text-sm text-muted-foreground">Объекты не найдены</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        Можно выбрать несколько объектов. Эта же привязка используется в финансах и выплатах
        собственнику. День выплаты задаётся в брони.
      </p>
    </section>
  );
}
