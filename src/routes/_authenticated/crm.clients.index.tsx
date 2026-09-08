import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmTabs } from "@/components/CrmTabs";
import { ClientDialog } from "@/components/ClientDialog";
import {
  fetchAllBookings,
  normalizePhone,
  sourceLabel,
  type Booking,
} from "@/lib/bookings";
import {
  clientStatusLabel,
  clientStatusOf,
  currentBookingOf,
  fetchCrmClients,
  upcomingBookingOf,
  type ClientStatus,
} from "@/lib/clients";
import { fetchProperties, internalTitle } from "@/lib/properties";
import { formatDateRu } from "@/lib/rentals";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/crm/clients/")({
  head: () => ({
    meta: [
      { title: "Клиенты — CRM RM OS" },
      {
        name: "description",
        content:
          "База клиентов долгосрочной аренды: автоматические статусы по бронированиям, поиск, фильтры и чёрный список.",
      },
      { property: "og:title", content: "Клиенты — CRM RM OS" },
      {
        property: "og:description",
        content: "CRM RM OS: клиенты, их бронирования и автоматические статусы аренды.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});

type FilterKey = ClientStatus | "all" | "blacklist";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "renting", label: "Арендует" },
  { key: "booked", label: "Забронировал" },
  { key: "left", label: "Съехал" },
  { key: "blacklist", label: "Чёрный список" },
  { key: "none", label: "Без бронирований" },
];

const statusStyles: Record<ClientStatus, string> = {
  renting: "bg-emerald-50 text-emerald-700",
  booked: "bg-amber-50 text-amber-700",
  left: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
};

function ClientsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["crm-clients"],
    queryFn: fetchCrmClients,
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ["crm-bookings"],
    queryFn: fetchAllBookings,
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });

  const byClient = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const list = map.get(b.client_id) ?? [];
      list.push(b);
      map.set(b.client_id, list);
    }
    return map;
  }, [bookings]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = normalizePhone(search);
    return clients
      .map((client) => {
        const list = byClient.get(client.id) ?? [];
        const status = clientStatusOf(list);
        const active = currentBookingOf(list) ?? upcomingBookingOf(list);
        const property = properties.find((p) => p.id === active?.property_id) ?? null;
        const latest = list[0] ?? null;
        return {
          client,
          status,
          active,
          propertyName: property ? internalTitle(property) : null,
          source: active?.source ?? latest?.source ?? null,
          total: list.length,
        };
      })
      .filter((row) => {
        if (q) {
          const nameMatch = row.client.full_name.toLowerCase().includes(q);
          const phoneMatch =
            digits.length > 0 && normalizePhone(row.client.phone).includes(digits);
          if (!nameMatch && !phoneMatch) return false;
        }
        if (filter === "all") return true;
        if (filter === "blacklist") return row.client.blacklisted;
        return row.status === filter;
      });
  }, [clients, byClient, properties, search, filter]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">CRM</h1>
        <Button size="lg" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Добавить клиента
        </Button>
      </header>

      <CrmTabs active="clients" />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ФИО или телефону..."
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Клиент</th>
              <th className="px-4 py-3 font-medium">Телефон</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Объект</th>
              <th className="px-4 py-3 font-medium">Даты</th>
              <th className="px-4 py-3 font-medium">Источник</th>
              <th className="px-4 py-3 font-medium">Броней</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                  Загрузка...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                  Клиенты не найдены
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.client.id}
                  onClick={() =>
                    navigate({ to: "/crm/clients/$id", params: { id: row.client.id } })
                  }
                  className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      {row.client.full_name}
                      {row.client.blacklisted ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          <ShieldAlert className="size-3" />
                          Чёрный список
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.client.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                        statusStyles[row.status],
                      )}
                    >
                      {clientStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.propertyName ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.active
                      ? `${formatDateRu(row.active.start_date)} — ${formatDateRu(row.active.end_date)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{sourceLabel(row.source)}</td>
                  <td className="px-4 py-3">{row.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ClientDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
