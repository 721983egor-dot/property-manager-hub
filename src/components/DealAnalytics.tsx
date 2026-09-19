import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEAL_SOURCES, formatBudget, type Deal, type DealStage } from "@/lib/deals";
import { toISODate } from "@/lib/rentals";

type Period = "all" | "7" | "30" | "90" | "365";
type StatusFilter = "all" | "open" | "closed";

const PERIODS: { key: Period; label: string; days: number | null }[] = [
  { key: "all", label: "Всё время", days: null },
  { key: "7", label: "7 дней", days: 7 },
  { key: "30", label: "30 дней", days: 30 },
  { key: "90", label: "90 дней", days: 90 },
  { key: "365", label: "Год", days: 365 },
];

const NONE = "__all__";

type Props = {
  deals: Deal[];
  stages: DealStage[];
  staffName: Map<string, string>;
};

function kindOf(deal: Deal, stages: Map<string, DealStage["kind"]>): "open" | "won" | "lost" {
  return stages.get(deal.stage_id) ?? "open";
}

function inRange(iso: string, from: string | null) {
  if (!from) return true;
  return iso.slice(0, 10) >= from;
}

function weekKey(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const weekday = date.getDay();
  date.setDate(date.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return toISODate(date);
}

function formatWeek(iso: string) {
  const from = new Date(`${iso}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return `${from.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}–${to.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}`;
}

function sourceOf(deal: Deal) {
  return deal.source.trim() || "Не указан";
}

function dealAmount(deal: Deal, kind: "open" | "won" | "lost") {
  if (kind === "won") return deal.price_month ?? deal.budget ?? 0;
  return deal.budget ?? 0;
}

/** Сводка по открытым и закрытым сделкам: график, фильтры и источники. */
export function DealAnalytics({ deals, stages, staffName }: Props) {
  const [period, setPeriod] = useState<Period>("90");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [source, setSource] = useState(NONE);
  const [responsible, setResponsible] = useState(NONE);

  const kindByStage = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage.kind])),
    [stages],
  );

  const fromDate = useMemo(() => {
    const days = PERIODS.find((item) => item.key === period)?.days;
    if (!days) return null;
    return toISODate(new Date(Date.now() - (days - 1) * 86_400_000));
  }, [period]);

  const filtered = useMemo(() => {
    return deals.filter((deal) => {
      const kind = kindOf(deal, kindByStage);
      if (status === "open" && kind !== "open") return false;
      if (status === "closed" && kind === "open") return false;
      if (source !== NONE && sourceOf(deal) !== source) return false;
      if (responsible !== NONE && (deal.responsible_id ?? "") !== responsible) return false;
      const stamp = kind === "open" ? deal.created_at : deal.updated_at || deal.created_at;
      return inRange(stamp, fromDate);
    });
  }, [deals, kindByStage, status, source, responsible, fromDate]);

  const open = filtered.filter((deal) => kindOf(deal, kindByStage) === "open");
  const won = filtered.filter((deal) => kindOf(deal, kindByStage) === "won");
  const lost = filtered.filter((deal) => kindOf(deal, kindByStage) === "lost");
  const closedDeals = [...won, ...lost];
  const closed = closedDeals.length;
  const conversion = closed > 0 ? Math.round((won.length / closed) * 100) : 0;
  const openSum = open.reduce((sum, deal) => sum + dealAmount(deal, "open"), 0);
  const closedSum = closedDeals.reduce(
    (sum, deal) => sum + dealAmount(deal, kindOf(deal, kindByStage)),
    0,
  );

  const chart = useMemo(() => {
    const weeks = new Map<string, { week: string; open: number; won: number; lost: number }>();
    for (const deal of filtered) {
      const key = weekKey(deal.created_at);
      const row = weeks.get(key) ?? { week: key, open: 0, won: 0, lost: 0 };
      row[kindOf(deal, kindByStage)] += 1;
      weeks.set(key, row);
    }
    return [...weeks.values()]
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((row) => ({ ...row, label: formatWeek(row.week) }));
  }, [filtered, kindByStage]);

  const sourcesClosed = useMemo(() => countSources(closedDeals), [closedDeals]);

  const staffOptions = useMemo(() => {
    const ids = [...new Set(deals.map((deal) => deal.responsible_id).filter(Boolean))] as string[];
    return ids.map((id) => ({ id, name: staffName.get(id) || "Сотрудник" }));
  }, [deals, staffName]);

  const sourceOptions = useMemo(() => {
    const extra = deals.map(sourceOf).filter((name) => !DEAL_SOURCES.includes(name) && name !== "Не указан");
    return ["Не указан", ...DEAL_SOURCES, ...[...new Set(extra)]];
  }, [deals]);

  return (
    <div className="mt-5 grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={period === item.key ? "default" : "outline"}
            onClick={() => setPeriod(item.key)}
          >
            {item.label}
          </Button>
        ))}
        <div className="flex rounded-md border border-border p-0.5">
          {(
            [
              ["all", "Все"],
              ["open", "Открытые"],
              ["closed", "Закрытые"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={status === key ? "default" : "ghost"}
              className="h-8 px-3"
              onClick={() => setStatus(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Источник" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Все источники</SelectItem>
            {sourceOptions.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={responsible} onValueChange={setResponsible}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="Ответственный" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Все менеджеры</SelectItem>
            {staffOptions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Открытые" value={open.length} hint="сейчас в работе" />
        <StatCard label="Сумма открытых" value={formatBudget(openSum)} hint="бюджет клиентов в работе" />
        <StatCard label="Успешные" value={won.length} hint="закрыты с договором" />
        <StatCard label="Отказы" value={lost.length} hint="закрыты без сделки" />
        <StatCard label="Сумма закрытых" value={formatBudget(closedSum)} hint="успешные — цена в месяц, отказы — бюджет" />
        <StatCard label="Конверсия" value={`${conversion}%`} hint="успешные среди закрытых" />
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold">Сделки по неделям создания</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Сколько сделок завели на неделе и в каком статусе они сейчас.
        </p>
        {chart.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет данных за выбранный период.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="open" name="Открытые" stroke="#2563eb" strokeWidth={2} />
                <Line type="monotone" dataKey="won" name="Успешные" stroke="#059669" strokeWidth={2} />
                <Line type="monotone" dataKey="lost" name="Отказы" stroke="#dc2626" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SourceTable title="Источники закрытых сделок" rows={sourcesClosed} />
        <div className="rounded-lg border border-border bg-background p-4">
          <h2 className="text-sm font-semibold">График по источникам</h2>
          {sourcesClosed.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Источников пока нет.</p>
          ) : (
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourcesClosed}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Закрытые" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function countSources(deals: Deal[]) {
  const counts = new Map<string, number>();
  for (const deal of deals) {
    const name = sourceOf(deal);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function SourceTable({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Пока пусто.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.name} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
              <div>
                <div className="flex justify-between gap-2">
                  <span>{row.name}</span>
                  <span className="text-muted-foreground">
                    {row.count} · {total ? Math.round((row.count / total) * 100) : 0}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${total ? (row.count / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
