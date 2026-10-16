import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAccess } from "@/hooks/useAccess";
import { fetchCrmCommissionPayments } from "@/lib/crm-commission";
import { commissionTotals } from "@/lib/crm-commission-model";
import { formatBudget, type Deal } from "@/lib/deals";
import { Button } from "@/components/ui/button";
export function CrmCommissionAnalytics({
  deals,
  from,
  to,
}: {
  deals: Deal[];
  from: string;
  to: string;
}) {
  const { isAdmin } = useAccess();
  const [turnover, setTurnover] = useState(false);
  const payments = useQuery({
    queryKey: ["crm-commission-payments"],
    queryFn: fetchCrmCommissionPayments,
    enabled: isAdmin,
  });
  if (!isAdmin) return null;
  const ids = new Set(deals.map((d) => d.id));
  const totals = commissionTotals(
    (payments.data ?? []).filter((p) => ids.has(p.deal_id)),
    from,
    to,
  );
  return (
    <section className="crm-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Доход компании · по датам платежей</h2>
        <Button variant="outline" size="sm" onClick={() => setTurnover(!turnover)}>
          {turnover ? "Скрыть оборот аренды" : "Показать оборот аренды"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        За выбранные даты, по всем связанным договорам, включая закрытые раньше. Разовая комиссия и
        управление с учётом сезонных цен. Получено — по дате фактической оплаты.
      </p>
      {payments.isError ? (
        <p className="text-sm text-destructive">
          Не удалось загрузить доходы.{" "}
          <Button variant="link" onClick={() => payments.refetch()}>
            Повторить
          </Button>
        </p>
      ) : payments.isPending ? (
        <p>Загрузка…</p>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-3">
            {[
              ["Комиссия по плану", totals.planned],
              ["Получено комиссий", totals.received],
              ["Осталось получить по плану", totals.outstanding],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{formatBudget(Number(value))}</p>
              </div>
            ))}
          </div>
          {turnover && (
            <div className="rounded-md bg-muted p-4">
              <p className="font-medium">
                Оборот аренды по графику: {formatBudget(totals.turnover)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Полная арендная плата по датам плановых платежей. Она показана для сравнения и не
                включена в доход компании.
              </p>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Старые сделки без финансового графика сюда не входят. Частичные оплаты учитываются суммарно
        по сохранённой дате фактической оплаты.
      </p>
    </section>
  );
}
