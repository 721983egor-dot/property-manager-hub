import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { getOwnerCabinet } from "@/lib/owner.functions";
import { groupHotelRooms, UNASSIGNED_LANE_LABEL } from "@/lib/hotel";
import { shortName, type Booking } from "@/lib/bookings";
import { internalTitle, type Property } from "@/lib/properties";
import {
  MONTHS,
  WEEKDAYS_SHORT,
  addDays,
  eachDay,
  formatDateRu,
  parseISODate,
  toISODate,
} from "@/lib/rentals";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/DateField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { N11Logo } from "@/components/N11Logo";

export const Route = createFileRoute("/_authenticated/owner/")({
  head: () => ({
    meta: [{ title: "Кабинет собственника H11" }],
  }),
  component: OwnerCabinetPage,
});

const DAY_WIDTH = 36;
const MONTH_LEAD_DAYS = 3;

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function monthViewFrom(date: Date) {
  return addDays(monthStart(date), -MONTH_LEAD_DAYS);
}

function OwnerCabinetPage() {
  const load = useServerFn(getOwnerCabinet);
  const today = useMemo(() => new Date(), []);
  const todayIso = toISODate(today);
  const [from, setFrom] = useState(() => toISODate(monthViewFrom(new Date())));
  const [to, setTo] = useState(() => toISODate(monthEnd(new Date())));
  const [span, setSpan] = useState("1");

  const { data, isLoading, error } = useQuery({
    queryKey: ["owner-cabinet", from, to],
    queryFn: () => load({ data: { from, to } }),
  });

  const days = useMemo(
    () => eachDay(parseISODate(from), parseISODate(to)),
    [from, to],
  );
  const fromDate = parseISODate(from);
  const toDate = parseISODate(to);
  const activeMonth = fromDate.getMonth();
  const activeYear = fromDate.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 1 + i);

  const groups = useMemo(() => {
    if (!data) return [];
    const grouped = groupHotelRooms(data.calendarRooms, data.categories);
    return grouped.map((group) => ({
      ...group,
      rooms: [...group.rooms].sort((a, b) => {
        const au = a.is_unassigned_lane ? 0 : 1;
        const bu = b.is_unassigned_lane ? 0 : 1;
        if (au !== bu) return au - bu;
        return 0;
      }),
    }));
  }, [data]);
  const bookingsByRoom = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const booking of data?.bookings ?? []) {
      if (booking.status === "cancelled") continue;
      const list = map.get(booking.property_id) ?? [];
      list.push(booking);
      map.set(booking.property_id, list);
    }
    return map;
  }, [data]);

  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; count: number }[] = [];
    for (const d of days) {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.count += 1;
      else groups.push({ key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, count: 1 });
    }
    return groups;
  }, [days]);

  const shift = (dir: 1 | -1) => {
    const length = days.length || 30;
    setFrom(toISODate(addDays(fromDate, dir * length)));
    setTo(toISODate(addDays(toDate, dir * length)));
  };

  const goToday = () => {
    setFrom(toISODate(monthViewFrom(today)));
    setTo(toISODate(monthEnd(today)));
    setSpan("1");
  };

  const applyMonthYear = (month: number, year: number, months = 1) => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + months, 0);
    setFrom(toISODate(addDays(start, -MONTH_LEAD_DAYS)));
    setTo(toISODate(end));
  };

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-muted-foreground">
        {(error as Error).message}
      </div>
    );
  }

  const basePrices = (data?.categories ?? []).filter((c) => c.price_night != null);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <N11Logo variant="compact" className="h-7 sm:h-8" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Кабинет собственника</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {data?.owner.full_name ?? "H11"} · календарь по вашим номерам · загрузка по котловану
        категории
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ваших номеров" value={data?.rooms.length ?? "—"} />
        <StatCard
          label="Загрузка периода"
          value={`${data?.occupancy.percent ?? 0}%`}
          hint={
            data?.occupancy.rooms
              ? `котлован: ${data.occupancy.occupied} из ${data.occupancy.roomNights} номеро-ночей (${data.occupancy.rooms} в категории)`
              : undefined
          }
        />
        <StatCard
          label="Категории"
          value={
            (data?.occupancyByCategory ?? [])
              .map((row) => `${row.category.name} ${row.occupancy.percent}%`)
              .join(" · ") || "—"
          }
          compact
        />
        <StatCard
          label="Ближайшие заезды"
          value={data?.nextArrivals.length ? String(data.nextArrivals.length) : "нет"}
        />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold">Ваши апартаменты</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(data?.rooms ?? []).length === 0 && !isLoading ? (
              <li className="text-muted-foreground">К вам пока не привязаны номера.</li>
            ) : (
              (data?.rooms ?? []).map((room) => {
                const category = data?.categories.find((c) => c.id === room.room_category_id);
                const night =
                  room.price_night != null
                    ? room.price_night
                    : category?.price_night != null
                      ? category.price_night
                      : null;
                return (
                  <li key={room.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{internalTitle(room)}</span>
                    {category ? (
                      <span className="text-muted-foreground">· {category.name}</span>
                    ) : null}
                    {night != null ? (
                      <span className="text-muted-foreground">
                        · от {night.toLocaleString("ru-RU")} ₽/ночь
                      </span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
          {basePrices.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Базовая цена в карточке категории RM OS — не открытые тарифы Bnovo по датам.
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Цены по тарифу на даты из Bnovo в кабинет пока не подтягиваются (см. документацию H11).
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold">Ближайшие заезды</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(data?.nextArrivals ?? []).length === 0 && !isLoading ? (
              <li className="text-muted-foreground">Нет заездов с сегодняшнего дня.</li>
            ) : (
              (data?.nextArrivals ?? []).slice(0, 8).map((row) => (
                <li key={row.bookingId} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="font-medium tabular-nums">{formatDateRu(row.startDate)}</span>
                  <span>
                    {row.guestName}
                    <span className="text-muted-foreground">
                      {" "}
                      · {row.unassigned ? UNASSIGNED_LANE_LABEL : row.propertyLabel}
                      {row.categoryName ? ` · ${row.categoryName}` : ""}
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={goToday}>
          Сегодня
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">с</span>
          <DateField
            value={from}
            onValueChange={setFrom}
            className="h-8 w-[150px]"
            aria-label="Дата начала периода"
          />
          <span className="text-xs text-muted-foreground">по</span>
          <DateField
            value={to}
            onValueChange={setTo}
            className="h-8 w-[150px]"
            aria-label="Дата конца периода"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={String(activeMonth)}
            onValueChange={(v) => applyMonthYear(Number(v), activeYear, Number(span))}
          >
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(activeYear)}
            onValueChange={(v) => applyMonthYear(activeMonth, Number(v), Number(span))}
          >
            <SelectTrigger className="h-8 w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={span}
            onValueChange={(v) => {
              setSpan(v);
              applyMonthYear(activeMonth, activeYear, Number(v));
            }}
          >
            <SelectTrigger className="h-8 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 месяц</SelectItem>
              <SelectItem value="2">2 месяца</SelectItem>
              <SelectItem value="3">3 месяца</SelectItem>
              <SelectItem value="6">6 месяцев</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 overflow-auto rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Загрузка календаря…</div>
        ) : groups.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">К вам пока не привязаны номера.</div>
        ) : (
          <>
            <div className="flex border-b border-border">
              <div className="sticky left-0 z-10 w-40 shrink-0 bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
                Номер
              </div>
              <div className="shrink-0" style={{ width: days.length * DAY_WIDTH }}>
                <div className="flex">
                  {monthGroups.map((g) => (
                    <div
                      key={g.key}
                      style={{ width: g.count * DAY_WIDTH }}
                      className="border-r border-border px-2 py-1.5 text-xs font-semibold tracking-tight"
                    >
                      {g.label}
                    </div>
                  ))}
                </div>
                <div className="flex border-t border-border">
                  {days.map((d) => {
                    const iso = toISODate(d);
                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div
                        key={iso}
                        style={{ width: DAY_WIDTH }}
                        className={cn(
                          "shrink-0 border-r border-border py-1 text-center",
                          weekend && "bg-muted/50",
                          iso === todayIso && "bg-sky-100",
                        )}
                      >
                        <div className="text-[13px] font-medium leading-4">{d.getDate()}</div>
                        <div className="text-[10px] leading-4 text-muted-foreground">
                          {WEEKDAYS_SHORT[d.getDay()]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {groups.map((group) => {
              const poolStat = (data?.occupancyByCategory ?? []).find(
                (row) => row.category.id === group.category?.id,
              )?.occupancy;
              return (
                <div key={group.category?.id ?? "none"}>
                  <div className="sticky left-0 border-b border-border bg-muted/60 px-4 py-2 text-sm font-semibold">
                    {group.category?.name ?? "Без категории"} · загрузка категории{" "}
                    {poolStat?.percent ?? 0}%
                  </div>
                  {group.rooms.map((room) => (
                    <OwnerRoomRow
                      key={room.id}
                      room={room}
                      days={days}
                      from={from}
                      todayIso={todayIso}
                      bookings={bookingsByRoom.get(room.id) ?? []}
                    />
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Полоса «новая бронь» — брони категории без назначенного апартамента; они входят в загрузку
        котлована. Чужие номера и телефоны гостей не показываются.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  compact = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-semibold", compact ? "text-sm leading-snug" : "text-2xl")}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function OwnerRoomRow({
  room,
  days,
  from,
  todayIso,
  bookings,
}: {
  room: Property;
  days: Date[];
  from: string;
  todayIso: string;
  bookings: Booking[];
}) {
  const unassigned = Boolean(room.is_unassigned_lane);
  return (
    <div className={cn("flex border-b border-border", unassigned && "bg-amber-50/40")}>
      <div
        className={cn(
          "sticky left-0 z-10 w-40 shrink-0 px-3 py-3 text-sm font-medium",
          unassigned ? "bg-amber-50 text-amber-900" : "bg-card",
        )}
      >
        {unassigned ? UNASSIGNED_LANE_LABEL : internalTitle(room)}
        {unassigned ? (
          <div className="text-xs font-normal text-amber-800/80">категория</div>
        ) : null}
      </div>
      <div className="relative" style={{ width: days.length * DAY_WIDTH, height: 44 }}>
        {days.map((d, index) => {
          const iso = toISODate(d);
          return (
            <div
              key={iso}
              className={cn(
                "absolute top-0 h-full border-r border-border/60",
                (d.getDay() === 0 || d.getDay() === 6) && "bg-muted/40",
                iso === todayIso && "bg-sky-100/70",
                unassigned &&
                  d.getDay() !== 0 &&
                  d.getDay() !== 6 &&
                  iso !== todayIso &&
                  "bg-amber-50/50",
              )}
              style={{ left: index * DAY_WIDTH, width: DAY_WIDTH }}
            />
          );
        })}
        {bookings.map((booking) => {
          const start = Math.max(
            0,
            Math.round(
              (parseISODate(booking.start_date).getTime() - parseISODate(from).getTime()) /
                86400000,
            ),
          );
          const end = Math.min(
            days.length,
            Math.round(
              (parseISODate(booking.end_date).getTime() - parseISODate(from).getTime()) /
                86400000,
            ) + 1,
          );
          if (end <= 0 || start >= days.length) return null;
          return (
            <div
              key={booking.id}
              title={`${unassigned ? `${UNASSIGNED_LANE_LABEL} · ` : ""}${shortName(booking.client?.full_name ?? "Гость")}: ${formatDateRu(booking.start_date)} — ${formatDateRu(booking.end_date)}`}
              className={cn(
                "absolute top-1.5 h-8 overflow-hidden rounded-md px-2 text-[11px] leading-8 text-white",
                unassigned ? "bg-amber-600/85" : "bg-emerald-600/80",
              )}
              style={{
                left: start * DAY_WIDTH + 2,
                width: Math.max(DAY_WIDTH - 4, (end - start) * DAY_WIDTH - 4),
              }}
            >
              {unassigned
                ? `${UNASSIGNED_LANE_LABEL} · ${shortName(booking.client?.full_name ?? "Гость")}`
                : shortName(booking.client?.full_name ?? "Гость")}
            </div>
          );
        })}
      </div>
    </div>
  );
}
