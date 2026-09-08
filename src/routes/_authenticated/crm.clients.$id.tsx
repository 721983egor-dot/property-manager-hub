import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { BookingDialog } from "@/components/BookingDialog";
import { ClientDialog } from "@/components/ClientDialog";
import {
  fetchClientBookings,
  priceOn,
  sourceLabel,
  statusLabel,
  type Booking,
} from "@/lib/bookings";
import {
  bookingTone,
  clientStatusLabel,
  clientStatusOf,
  deleteClient,
  fetchCrmClient,
} from "@/lib/clients";
import { fetchProperties, formatMoney, internalTitle } from "@/lib/properties";
import { formatDateRu, toISODate } from "@/lib/rentals";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/crm/clients/$id")({
  head: () => ({
    meta: [
      { title: "Карточка клиента — CRM RM OS" },
      {
        name: "description",
        content: "Карточка клиента: контакты, автоматический статус и все бронирования.",
      },
      { property: "og:title", content: "Карточка клиента — CRM RM OS" },
      {
        property: "og:description",
        content: "Контакты клиента, статус аренды и полная история бронирований.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientPage,
});

function ClientPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);

  const { data: client, isLoading } = useQuery({
    queryKey: ["crm-client", id],
    queryFn: () => fetchCrmClient(id),
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ["client-bookings", id],
    queryFn: () => fetchClientBookings(id),
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });

  const remove = useMutation({
    mutationFn: () => deleteClient(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["crm-clients"] });
      await qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Клиент удалён");
      navigate({ to: "/crm/clients" });
    },
    onError: () =>
      toast.error("Не удалось удалить клиента: сначала удалите его бронирования"),
  });

  if (isLoading) {
    return <div className="px-6 py-10 text-muted-foreground">Загрузка...</div>;
  }
  if (!client) {
    return <div className="px-6 py-10 text-muted-foreground">Клиент не найден</div>;
  }

  const status = clientStatusOf(bookings);
  const today = toISODate(new Date());

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link
        to="/crm/clients"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        К списку клиентов
      </Link>

      <div className="mt-4 rounded-xl border border-border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{client.full_name}</h1>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {clientStatusLabel(status)}
              </span>
              {client.blacklisted ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  <ShieldAlert className="size-3" />
                  Чёрный список
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{client.phone || "Телефон не указан"}</p>
            {client.blacklisted && client.blacklist_reason ? (
              <p className="mt-2 text-sm text-red-700">Причина: {client.blacklist_reason}</p>
            ) : null}
            {client.comment ? <p className="mt-2 text-sm">{client.comment}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setActiveBooking(null);
                setBookingOpen(true);
              }}
            >
              <Plus className="size-4" />
              Создать бронирование
            </Button>
            <Button onClick={() => setEditOpen(true)}>Редактировать</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm("Удалить клиента?")) remove.mutate();
              }}
            >
              {remove.isPending ? "Удаление..." : "Удалить"}
            </Button>
          </div>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Бронирования</h2>
        {bookings.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">У клиента пока нет бронирований</p>
        ) : (
          <div className="mt-3 space-y-3">
            {bookings.map((b) => {
              const property = properties.find((p) => p.id === b.property_id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setActiveBooking(b);
                    setBookingOpen(true);
                  }}
                  className={cn(
                    "w-full rounded-xl border p-4 text-left transition-shadow hover:shadow-sm",
                    bookingTone(b, today),
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-medium">
                      {property ? internalTitle(property) : "Объект удалён"}
                    </span>
                    <span className="text-sm text-muted-foreground">{statusLabel(b.status)}</span>
                  </div>
                  <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Item
                      label="Даты"
                      value={`${formatDateRu(b.start_date)} — ${formatDateRu(b.end_date)}`}
                    />
                    <Item label="Стоимость в месяц" value={formatMoney(priceOn(b, today))} />
                    <Item label="День оплаты" value={`${b.payment_day} число`} />
                    <Item label="Депозит" value={formatMoney(b.deposit)} />
                    <Item label="Источник" value={sourceLabel(b.source)} />
                    <Item label="Комментарий" value={b.comment || "—"} />
                  </dl>
                  {b.price_type === "periodic" && b.periods.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                      {b.periods.map((p, i) => (
                        <li key={p.id ?? i}>
                          {formatDateRu(p.start_date)} — {formatDateRu(p.end_date)}:{" "}
                          {formatMoney(p.price_month)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <ClientDialog open={editOpen} onOpenChange={setEditOpen} client={client} />
      <BookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        booking={activeBooking}
        defaultClientId={client.id}
      />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
