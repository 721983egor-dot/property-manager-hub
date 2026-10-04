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
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Финансы</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Контрагенты собираются из платежей и клиентов CRM. Отдельная карточка контрагента — позже.
        </p>
      </header>

      <FinanceTabs active="counterparties" />

      <div className="mt-6 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && counterparties.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Пока нет контрагентов. Они появятся после первых платежей в календаре.
          </p>
        )}
        {counterparties.map((item) => (
          <div
            key={item.key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {item.clientId ? (
                  <Link
                    to="/crm/clients/$id"
                    params={{ id: item.clientId }}
                    className="hover:text-primary"
                  >
                    {item.name}
                  </Link>
                ) : (
                  item.name
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.roles.join(" · ") || "Прочее"} · платежей: {item.paymentCount}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted-foreground">Открыто</p>
              <p className="font-medium">{formatMoney(item.openAmount)}</p>
            </div>
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
