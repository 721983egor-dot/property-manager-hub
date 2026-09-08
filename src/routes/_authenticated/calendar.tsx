import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingDialog } from "@/components/BookingDialog";
import { fetchProperties, internalTitle } from "@/lib/properties";
import { fetchComplexes } from "@/lib/complexes";
import { type Booking, fetchBookings, shortName } from "@/lib/bookings";
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

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Календарь занятости — RM OS" },
      {
        name: "description",
        content:
          "Шахматка занятости объектов долгосрочной аренды: периоды аренды по дням, выбор диапазона дат и месяцев.",
      },
      { property: "og:title", content: "Календарь занятости — RM OS" },
      {
        property: "og:description",
        content: "Шахматка занятости объектов долгосрочной аренды в RM OS.",
      },
    ],
  }),
  component: CalendarPage,
});

const DAY_WIDTH = 40;

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => toISODate(monthStart(new Date())));
  const [to, setTo] = useState(() => toISODate(monthEnd(new Date())));

  const fromDate = parseISODate(from);
  const toDate = parseISODate(to);
  const days = useMemo(
    () => (toDate >= fromDate ? eachDay(fromDate, toDate) : [fromDate]),
    [from, to],
  );

  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });
  const { data: complexes = [] } = useQuery({
    queryKey: ["complexes"],
    queryFn: fetchComplexes,
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings", from, to],
    queryFn: () => fetchBookings(from, to),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);

  const complexMap = useMemo(
    () => new Map(complexes.map((c) => [c.id, c.name])),
    [complexes],
  );

  const rows = properties.filter((p) => p.service_type !== "commission_only");

  const todayIso = toISODate(today);
  const bookingsByProperty = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const list = map.get(b.property_id) ?? [];
      list.push(b);
      map.set(b.property_id, list);
    }
    return map;
  }, [bookings]);

  const shift = (dir: 1 | -1) => {
    const length = days.length || 30;
    setFrom(toISODate(addDays(fromDate, dir * length)));
    setTo(toISODate(addDays(toDate, dir * length)));
  };

  const goToday = () => {
    setFrom(toISODate(monthStart(today)));
    setTo(toISODate(monthEnd(today)));
  };

  const applyMonthYear = (month: number, year: number, months = 1) => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + months, 0);
    setFrom(toISODate(start));
    setTo(toISODate(end));
  };

  const [span, setSpan] = useState("1");
  const activeMonth = fromDate.getMonth();
  const activeYear = fromDate.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 1 + i);

  // Группировка колонок по месяцам для верхней строки.
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

  const gridWidth = days.length * DAY_WIDTH;

  return (
    <div className="mx-auto max-w-[1600px] px-8 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Календарь</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Шахматка занятости объектов по дням.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => {
            setActiveBooking(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-4" />
          Создать бронирование
        </Button>
      </div>

      <BookingDialog open={dialogOpen} onOpenChange={setDialogOpen} booking={activeBooking} />


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
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-[150px]"
          />
          <span className="text-xs text-muted-foreground">по</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-[150px]"
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
        <div className="min-w-max">
          {/* Шапка */}
          <div className="sticky top-0 z-30 flex bg-card">
            <div className="sticky left-0 z-40 w-[260px] shrink-0 border-b border-r border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
              Объект
            </div>
            <div style={{ width: gridWidth }} className="shrink-0 border-b border-border">
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
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = toISODate(d) === todayIso;
                  return (
                    <div
                      key={d.toISOString()}
                      style={{ width: DAY_WIDTH }}
                      className={cn(
                        "shrink-0 border-r border-border py-1 text-center",
                        weekend && "bg-muted/50",
                        isToday && "bg-sky-100",
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

          {/* Строки объектов */}
          {rows.map((property) => {
            const list = bookingsByProperty.get(property.id) ?? [];
            const complexName =
              (property.complex_id ? complexMap.get(property.complex_id) : null) ??
              property.complex_name;

            return (
              <div key={property.id} className="flex">
                <div className="sticky left-0 z-20 w-[260px] shrink-0 border-b border-r border-border bg-card px-4 py-3">
                  <div className="truncate text-sm font-medium">{internalTitle(property)}</div>
                  {complexName ? (
                    <div className="truncate text-xs text-muted-foreground">{complexName}</div>
                  ) : null}
                </div>

                <div
                  style={{ width: gridWidth }}
                  className="relative shrink-0 border-b border-border"
                >
                  <div className="flex h-full">
                    {days.map((d) => {
                      const weekend = d.getDay() === 0 || d.getDay() === 6;
                      const isToday = toISODate(d) === todayIso;
                      return (
                        <div
                          key={d.toISOString()}
                          style={{ width: DAY_WIDTH }}
                          className={cn(
                            "relative h-[68px] shrink-0 border-r border-border",
                            weekend && "bg-muted/40",
                            isToday && "bg-sky-100",
                          )}
                        />
                      );
                    })}
                  </div>

                  {list.map((booking) => {
                    const start = parseISODate(
                      booking.start_date < from ? from : booking.start_date,
                    );
                    const end = parseISODate(booking.end_date > to ? to : booking.end_date);
                    const offset = Math.round(
                      (start.getTime() - fromDate.getTime()) / 86400000,
                    );
                    const length =
                      Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
                    if (length <= 0) return null;
                    const past = booking.end_date < todayIso;
                    return (
                      <button
                        type="button"
                        key={booking.id}
                        onClick={() => {
                          setActiveBooking(booking);
                          setDialogOpen(true);
                        }}
                        title={`${formatDateRu(booking.start_date)} — ${formatDateRu(booking.end_date)}`}
                        style={{
                          left: offset * DAY_WIDTH + 2,
                          width: length * DAY_WIDTH - 4,
                        }}
                        className={cn(
                          "absolute top-1/2 flex h-8 -translate-y-1/2 items-center overflow-hidden rounded-md border px-2.5 text-left transition-opacity hover:opacity-90",
                          past
                            ? "border-border bg-muted"
                            : "border-status-free/30 bg-status-free-soft",
                        )}
                      >
                        <span
                          className={cn(
                            "truncate text-xs font-medium",
                            past ? "text-muted-foreground" : "text-status-free",
                          )}
                        >
                          {booking.client ? shortName(booking.client.full_name) : "Занято"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Объектов пока нет.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
