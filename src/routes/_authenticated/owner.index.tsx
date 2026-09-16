import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { getOwnerCabinet } from "@/lib/owner.functions";
import { groupHotelRooms, occupancyOf } from "@/lib/hotel";
import { shortName, type Booking } from "@/lib/bookings";
import { internalTitle } from "@/lib/properties";
import {
  eachDay,
  formatDateRu,
  parseISODate,
  toISODate,
} from "@/lib/rentals";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { N11Logo } from "@/components/N11Logo";

export const Route = createFileRoute("/_authenticated/owner/")({
  head: () => ({
    meta: [{ title: "Кабинет собственника Н11" }],
  }),
  component: OwnerCabinetPage,
});

const DAY_WIDTH = 36;

function OwnerCabinetPage() {
  const load = useServerFn(getOwnerCabinet);
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() =>
    toISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [to, setTo] = useState(() =>
    toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["owner-cabinet", from, to],
    queryFn: () => load({ data: { from, to } }),
  });

  const days = useMemo(() => eachDay(parseISODate(from), parseISODate(to)), [from, to]);
  const groups = useMemo(
    () => (data ? groupHotelRooms(data.rooms, data.categories) : []),
    [data],
  );
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

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-muted-foreground">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <N11Logo variant="compact" className="h-8 sm:h-9" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Кабинет собственника</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {data?.owner.full_name ?? "Н11"} · только ваши номера и загрузка по категориям
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <div className="text-sm text-muted-foreground">Номеров</div>
          <div className="mt-1 text-2xl font-semibold">{data?.occupancy.rooms ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-sm text-muted-foreground">Загрузка периода</div>
          <div className="mt-1 text-2xl font-semibold">{data?.occupancy.percent ?? 0}%</div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-sm text-muted-foreground">Категории</div>
          <div className="mt-1 text-sm">
            {(data?.occupancyByCategory ?? [])
              .map((row) => `${row.category.name} ${row.occupancy.percent}%`)
              .join(" · ") || "—"}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFrom(toISODate(new Date(today.getFullYear(), today.getMonth(), 1)));
            setTo(toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
          }}
        >
          Этот месяц
        </Button>
        <Input type="date" className="h-8 w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="h-8 w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="mt-6 overflow-auto rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Загрузка календаря…</div>
        ) : groups.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">К вам пока не привязаны номера.</div>
        ) : (
          groups.map((group) => {
            const stat = occupancyOf(group.rooms, data?.bookings ?? [], from, to);
            return (
              <div key={group.category?.id ?? "none"}>
                <div className="sticky left-0 border-b border-border bg-muted/60 px-4 py-2 text-sm font-semibold">
                  {group.category?.name ?? "Без категории"} · загрузка {stat.percent}%
                </div>
                {group.rooms.map((room) => {
                  const list = bookingsByRoom.get(room.id) ?? [];
                  return (
                    <div key={room.id} className="flex border-b border-border">
                      <div className="sticky left-0 z-10 w-40 shrink-0 bg-card px-3 py-3 text-sm font-medium">
                        {internalTitle(room)}
                      </div>
                      <div className="relative" style={{ width: days.length * DAY_WIDTH, height: 44 }}>
                        {days.map((d) => (
                          <div
                            key={d.toISOString()}
                            className={cn(
                              "absolute top-0 h-full border-r border-border/60",
                              (d.getDay() === 0 || d.getDay() === 6) && "bg-muted/40",
                            )}
                            style={{ left: days.indexOf(d) * DAY_WIDTH, width: DAY_WIDTH }}
                          />
                        ))}
                        {list.map((booking) => {
                          const start = Math.max(
                            0,
                            Math.round(
                              (parseISODate(booking.start_date).getTime() -
                                parseISODate(from).getTime()) /
                                86400000,
                            ),
                          );
                          const end = Math.min(
                            days.length,
                            Math.round(
                              (parseISODate(booking.end_date).getTime() -
                                parseISODate(from).getTime()) /
                                86400000,
                            ) + 1,
                          );
                          if (end <= 0 || start >= days.length) return null;
                          return (
                            <div
                              key={booking.id}
                              title={`${shortName(booking.client?.full_name ?? "Гость")}: ${formatDateRu(booking.start_date)} — ${formatDateRu(booking.end_date)}`}
                              className="absolute top-1.5 h-8 overflow-hidden rounded-md bg-emerald-600/80 px-2 text-[11px] leading-8 text-white"
                              style={{
                                left: start * DAY_WIDTH + 2,
                                width: Math.max(DAY_WIDTH - 4, (end - start) * DAY_WIDTH - 4),
                              }}
                            >
                              {shortName(booking.client?.full_name ?? "Гость")}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
