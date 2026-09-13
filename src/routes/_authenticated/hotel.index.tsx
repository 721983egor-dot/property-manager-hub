import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BedDouble, CalendarDays, Users } from "lucide-react";

import { HotelTabs } from "@/components/HotelTabs";
import { Button } from "@/components/ui/button";
import { fetchBookings } from "@/lib/bookings";
import { occupancyOf, groupHotelRooms } from "@/lib/hotel";
import { listHotelCategories } from "@/lib/hotel.functions";
import { fetchProperties, internalTitle } from "@/lib/properties";
import { formatDateRu, toISODate } from "@/lib/rentals";

export const Route = createFileRoute("/_authenticated/hotel/")({
  head: () => ({
    meta: [
      { title: "Апарт-отель N-11 — RM OS" },
      {
        name: "description",
        content: "Управление апарт-отелем N-11: загрузка, номера, собственники и синхронизация Bnovo.",
      },
    ],
  }),
  component: HotelSummaryPage,
});

function HotelSummaryPage() {
  const loadCategories = useServerFn(listHotelCategories);
  const now = new Date();
  const from = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings", from, to],
    queryFn: () => fetchBookings(from, to),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["hotel-categories"],
    queryFn: () => loadCategories(undefined as never),
  });

  const rooms = useMemo(
    () => properties.filter((p) => p.portfolio === "n11" && p.status !== "archived"),
    [properties],
  );
  const hotelBookings = useMemo(
    () => bookings.filter((b) => rooms.some((r) => r.id === b.property_id)),
    [bookings, rooms],
  );
  const occupancy = occupancyOf(rooms, hotelBookings, from, to);
  const groups = groupHotelRooms(rooms, categories);
  const today = toISODate(new Date());
  const occupiedNow = rooms.filter((room) =>
    hotelBookings.some(
      (b) =>
        b.status !== "cancelled" &&
        b.property_id === room.id &&
        b.start_date <= today &&
        b.end_date >= today,
    ),
  ).length;
  const arrivals = hotelBookings.filter((b) => b.status === "active" && b.start_date === today);
  const unmapped = rooms.filter((r) => !r.bnovo_room_id).length;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Апарт-отель N-11</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Навагинская, центр Сочи. Календарь общий с РМ — номера N-11 стоят сверху.
          </p>
        </div>
        <Button asChild>
          <Link to="/calendar">
            Календарь
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </header>
      <HotelTabs active="summary" />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat
          icon={BedDouble}
          label="Номеров"
          value={`${rooms.length}`}
          hint={`${occupiedNow} занято сегодня`}
        />
        <Stat
          icon={CalendarDays}
          label={`Загрузка ${formatDateRu(from)} — ${formatDateRu(to)}`}
          value={`${occupancy.percent}%`}
          hint={`${occupancy.occupied} из ${occupancy.roomNights} номеро-ночей`}
        />
        <Stat
          icon={Users}
          label="Заезды сегодня"
          value={String(arrivals.length)}
          hint={unmapped ? `${unmapped} номеров без ID Bnovo` : "Сопоставление Bnovo в порядке"}
        />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Категории</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Категория</th>
                <th className="px-4 py-3 font-medium">Номеров</th>
                <th className="px-4 py-3 font-medium">Загрузка месяца</th>
                <th className="px-4 py-3 font-medium">Собственники / номера</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                    Номеров пока нет — добавьте их во вкладке «Номера».
                  </td>
                </tr>
              ) : (
                groups.map((group) => {
                  const stat = occupancyOf(group.rooms, hotelBookings, from, to);
                  return (
                    <tr key={group.category?.id ?? "none"} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">
                        {group.category?.name ?? "Без категории"}
                      </td>
                      <td className="px-4 py-3">{group.rooms.length}</td>
                      <td className="px-4 py-3">{stat.percent}%</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {group.rooms.map((r) => internalTitle(r)).join(", ")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
