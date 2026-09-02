import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionTabs } from "@/components/SectionTabs";
import { fetchProperties } from "@/lib/properties";
import { fetchComplexes } from "@/lib/complexes";
import {
  MONTHS,
  WEEKDAYS_SHORT,
  addDays,
  eachDay,
  fetchRentals,
  formatDateRu,
  parseISODate,
  toISODate,
} from "@/lib/rentals";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
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
  const { data: rentals = [] } = useQuery({
    queryKey: ["rentals", from, to],
    queryFn: () => fetchRentals(from, to),
  });

  const complexMap = useMemo(
    () => new Map(complexes.map((c) => [c.id, c.name])),
    [complexes],
  );

  const rows = useMemo(
    () => properties.filter((p) => p.status !== "archived"),
    [properties],
  );

  const todayIso = toISODate(today);
  const rentalsByProperty = useMemo(() => {
    const map = new Map<string, typeof rentals>();
    for (const r of rentals) {
      const list = map.get(r.property_id) ?? [];
      list.push(r);
      map.set(r.property_id, list);
    }
    return map;
  }, [rentals]);

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
      <h1 className="text-2xl font-semibold tracking-tight">Календарь</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Шахматка занятости объектов по дням.
      </p>
      <SectionTabs active="calendar" />

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
                  return (
                    <div
                      key={d.toISOString()}
                      style={{ width: DAY_WIDTH }}
                      className={cn(
                        "shrink-0 border-r border-border py-1 text-center",
                        weekend && "bg-muted/50",
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
            const list = rentalsByProperty.get(property.id) ?? [];
            const busyNow = list.some(
              (r) => r.start_date <= todayIso && r.end_date >= todayIso,
            );
            const complexName =
              (property.complex_id ? complexMap.get(property.complex_id) : null) ??
              property.complex_name;

            return (
              <div key={property.id} className="flex">
                <div className="sticky left-0 z-20 w-[260px] shrink-0 border-b border-r border-border bg-card px-4 py-3">
                  <div className="truncate text-sm font-medium">{property.title}</div>
                  {complexName ? (
                    <div className="truncate text-xs text-muted-foreground">{complexName}</div>
                  ) : null}
                  <span
                    className={cn(
                      "mt-1 inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
                      busyNow
                        ? "bg-status-rented-soft text-status-rented"
                        : "bg-status-free-soft text-status-free",
                    )}
                  >
                    {busyNow ? "Занят" : "Свободен"}
                  </span>
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
                          )}
                        >
                          {isToday ? (
                            <span className="absolute inset-y-0 left-0 w-px bg-site-gold" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {list.map((rental) => {
                    const start = parseISODate(
                      rental.start_date < from ? from : rental.start_date,
                    );
                    const end = parseISODate(rental.end_date > to ? to : rental.end_date);
                    const offset = Math.round(
                      (start.getTime() - fromDate.getTime()) / 86400000,
                    );
                    const length =
                      Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
                    if (length <= 0) return null;
                    return (
                      <div
                        key={rental.id}
                        title={`${formatDateRu(rental.start_date)} — ${formatDateRu(rental.end_date)}`}
                        style={{
                          left: offset * DAY_WIDTH + 2,
                          width: length * DAY_WIDTH - 4,
                        }}
                        className="absolute top-1/2 flex h-8 -translate-y-1/2 items-center overflow-hidden rounded-md border border-status-free/30 bg-status-free-soft px-2.5"
                      >
                        <span className="truncate text-xs font-medium text-status-free">
                          {rental.tenant_name || "Занято"}
                        </span>
                      </div>
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
