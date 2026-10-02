import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  ExternalLink,
  LogIn,
  LogOut,
  MessageCircle,
  Phone,
  RefreshCw,
  Users,
} from "lucide-react";

import { HotelTabs } from "@/components/HotelTabs";
import { N11Logo } from "@/components/N11Logo";
import { Button } from "@/components/ui/button";
import { getBnovoStatus } from "@/lib/bnovo.functions";
import { fetchBookings } from "@/lib/bookings";
import { occupancyOf, groupHotelRooms } from "@/lib/hotel";
import { listHotelCategories } from "@/lib/hotel.functions";
import { fetchN11ChatStats } from "@/lib/n11-chat.functions";
import {
  N11_ADDRESS,
  N11_PHONE_DISPLAY,
  N11_PHONE_TEL,
  N11_SITE,
  N11_TAGLINE,
} from "@/lib/portfolios";
import { fetchProperties, internalTitle } from "@/lib/properties";
import { formatDateRu, toISODate } from "@/lib/rentals";

export const Route = createFileRoute("/_authenticated/hotel/")({
  head: () => ({
    meta: [
      { title: "H11 Резиденция — RM OS" },
      {
        name: "description",
        content:
          "Управление H11 Резиденция: загрузка, номера, чат с сайта, собственники и синхронизация Bnovo.",
      },
    ],
  }),
  component: HotelSummaryPage,
});

function HotelSummaryPage() {
  const loadCategories = useServerFn(listHotelCategories);
  const loadBnovo = useServerFn(getBnovoStatus);
  const loadChatStats = useServerFn(fetchN11ChatStats);
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
  const { data: bnovo } = useQuery({
    queryKey: ["bnovo-status"],
    queryFn: () => loadBnovo(undefined as never),
  });
  const { data: chatStats } = useQuery({
    queryKey: ["n11-chat-stats"],
    queryFn: () => loadChatStats(undefined as never),
    refetchInterval: 15_000,
  });

  const rooms = useMemo(
    () =>
      properties.filter(
        (p) => p.portfolio === "n11" && p.status !== "archived" && !p.is_unassigned_lane,
      ),
    [properties],
  );
  const unassignedBookings = useMemo(() => {
    const lanes = new Set(
      properties.filter((p) => p.portfolio === "n11" && p.is_unassigned_lane).map((p) => p.id),
    );
    return bookings.filter((b) => b.status !== "cancelled" && lanes.has(b.property_id));
  }, [bookings, properties]);
  const hotelBookings = useMemo(
    () => bookings.filter((b) => rooms.some((r) => r.id === b.property_id)),
    [bookings, rooms],
  );
  const occupancy = occupancyOf(rooms, hotelBookings, from, to);
  const groups = groupHotelRooms(rooms, categories);
  const today = toISODate(new Date());
  const roomTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const room of rooms) map.set(room.id, internalTitle(room));
    return map;
  }, [rooms]);

  const occupiedNow = rooms.filter((room) =>
    hotelBookings.some(
      (b) =>
        b.status !== "cancelled" &&
        b.property_id === room.id &&
        b.start_date <= today &&
        b.end_date > today,
    ),
  ).length;
  const arrivals = hotelBookings.filter((b) => b.status === "active" && b.start_date === today);
  const departures = hotelBookings.filter((b) => b.status === "active" && b.end_date === today);
  const untyped = categories.filter((c) => !c.bnovo_room_type_id).length;
  const unreadChats = chatStats?.threads ?? 0;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1>
            <N11Logo variant="full" className="h-11 sm:h-14" />
            <span className="sr-only">H11 Резиденция</span>
          </h1>
          <p className="mt-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">
            {N11_TAGLINE}
          </p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Апарт-отель · {N11_ADDRESS}. Отдельный проект рядом с Резиденция&Море: календарь
            общий, портфель и чат сайта — свои.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <a
              href={N11_PHONE_TEL}
              className="inline-flex items-center gap-1.5 text-foreground hover:text-primary"
            >
              <Phone className="size-3.5" />
              {N11_PHONE_DISPLAY}
            </a>
            <a
              href={N11_SITE}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-foreground hover:text-primary"
            >
              <ExternalLink className="size-3.5" />
              n11-residence.ru
            </a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/chats" search={{ source: "n11" }}>
              <MessageCircle className="size-4" />
              Чаты H11
              {unreadChats > 0 ? (
                <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {unreadChats}
                </span>
              ) : null}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/calendar">
              Календарь
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>
      <HotelTabs active="summary" />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          label="Заезды / выезды сегодня"
          value={`${arrivals.length} / ${departures.length}`}
          hint={
            unassignedBookings.length
              ? `${unassignedBookings.length} без номера — назначьте в календаре`
              : untyped
                ? `${untyped} категорий без ID Bnovo`
                : "Категории сопоставлены с Bnovo"
          }
        />
        <Stat
          icon={MessageCircle}
          label="Чаты с сайта H11"
          value={String(unreadChats)}
          hint={
            unreadChats
              ? `${chatStats?.messages ?? 0} непрочитанных сообщений`
              : "Нет непрочитанных — Bitrix не используется"
          }
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <LogIn className="size-4 text-muted-foreground" />
            Сегодня: заезды
          </h2>
          <DayList
            items={arrivals}
            empty="Заездов на сегодня нет"
            roomTitle={roomTitle}
            kind="arrival"
          />
        </section>
        <section className="rounded-xl border border-border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <LogOut className="size-4 text-muted-foreground" />
            Сегодня: выезды
          </h2>
          <DayList
            items={departures}
            empty="Выездов на сегодня нет"
            roomTitle={roomTitle}
            kind="departure"
          />
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <RefreshCw className="size-4 text-muted-foreground" />
              Bnovo
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Источник правды по слотам. В RM OS — выгрузка броней и шахматка; прямую бронь по
              телефону пока ставят в Bnovo.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/hotel/sync">Настройки и выгрузка</Link>
          </Button>
        </div>
        <p className="mt-3 text-sm">
          Статус:{" "}
          <span className="font-medium">
            {bnovo?.configured ? "ключи заданы" : "не подключено"}
          </span>
          {bnovo?.accountId ? ` · аккаунт ${bnovo.accountId}` : ""}
        </p>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold">Категории</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/hotel/rooms">Управление номерами</Link>
          </Button>
        </div>
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
                        {group.category?.bnovo_room_type_id ? (
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            Bnovo type {group.category.bnovo_room_type_id}
                          </span>
                        ) : null}
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

function DayList({
  items,
  empty,
  roomTitle,
  kind,
}: {
  items: Array<{
    id: string;
    property_id: string;
    start_date: string;
    end_date: string;
    source: string | null;
    client: { full_name: string } | null;
  }>;
  empty: string;
  roomTitle: Map<string, string>;
  kind: "arrival" | "departure";
}) {
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {items.map((b) => (
        <li
          key={b.id}
          className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium">{b.client?.full_name?.trim() || "Гость"}</p>
            <p className="text-xs text-muted-foreground">
              {roomTitle.get(b.property_id) ?? "Номер"}
              {b.source ? ` · ${b.source}` : ""}
            </p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">
            {kind === "arrival"
              ? `до ${formatDateRu(b.end_date)}`
              : `с ${formatDateRu(b.start_date)}`}
          </p>
        </li>
      ))}
    </ul>
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
        <Icon className="size-4 shrink-0" />
        <span className="leading-snug">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
