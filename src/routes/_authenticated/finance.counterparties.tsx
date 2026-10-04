import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { FinanceTabs } from "@/components/FinanceTabs";
import { buildCounterparties, fetchPayments } from "@/lib/finance";
import { fetchCrmClients, CLIENT_PARTY_KINDS } from "@/lib/clients";
import { formatMoney } from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/finance/counterparties")({
  head: () => ({
    meta: [
      { title: "Финансы — контрагенты — RM OS" },
      {
        name: "description",
        content: "Контрагенты по платежам: арендаторы, собственники, подрядчики.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinanceCounterpartiesPage,
});

function FinanceCounterpartiesPage() {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments", "all-for-counterparties"],
    queryFn: () => fetchPayments({}),
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["crm-clients"],
    queryFn: fetchCrmClients,
  });

  const counterparties = useMemo(() => buildCounterparties(payments), [payments]);

  const ownersWithoutPayments = useMemo(() => {
    const linked = new Set(counterparties.map((c) => c.clientId).filter(Boolean));
    return clients.filter((c) => c.party_kind === "owner" && !linked.has(c.id));
  }, [clients, counterparties]);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Контрагенты</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Из платежей и CRM. Отдельная карточка контрагента — позже.
        </p>
      </header>

      <FinanceTabs active="counterparties" />

      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <div className="hidden grid-cols-[1fr_10rem_8rem] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Контрагент</span>
          <span>Роль</span>
          <span className="text-right">Открыто</span>
        </div>
        {isLoading && (
          <p className="px-4 py-8 text-sm text-muted-foreground">Загрузка…</p>
        )}
        {!isLoading && counterparties.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Пока нет контрагентов. Они появятся после первых операций в календаре.
          </p>
        )}
        {counterparties.map((item) => (
          <div
            key={item.key}
            className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_10rem_8rem] sm:items-center sm:gap-3"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {item.clientId ? (
                  <Link
                    to="/crm/clients/$id"
                    params={{ id: item.clientId }}
                    className="hover:text-teal-800"
                  >
                    {item.name}
                  </Link>
                ) : (
                  item.name
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                {item.roles.join(" · ") || "Прочее"} · платежей: {item.paymentCount}
              </p>
              <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                платежей: {item.paymentCount}
              </p>
            </div>
            <p className="hidden text-sm text-muted-foreground sm:block">
              {item.roles.join(" · ") || "Прочее"}
            </p>
            <p
              className={
                "text-sm font-semibold tabular-nums sm:text-right " +
                (item.openAmount > 0 ? "text-red-700" : "text-muted-foreground")
              }
            >
              {formatMoney(item.openAmount)}
            </p>
          </div>
        ))}
      </div>

      {ownersWithoutPayments.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-muted-foreground">
            Собственники в CRM без платежей
          </h2>
          <div className="mt-3 space-y-2">
            {ownersWithoutPayments.map((client) => (
              <div
                key={client.id}
                className="rounded-xl border border-dashed border-border px-4 py-3 text-sm"
              >
                <Link
                  to="/crm/clients/$id"
                  params={{ id: client.id }}
                  className="font-medium hover:text-primary"
                >
                  {client.full_name}
                </Link>
                <span className="ml-2 text-muted-foreground">
                  {CLIENT_PARTY_KINDS.find((k) => k.value === client.party_kind)?.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
