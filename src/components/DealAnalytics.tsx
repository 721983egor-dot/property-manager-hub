import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatBudget, type Deal, type DealStage } from "@/lib/deals";
import {
  crmSources,
  filterCrmResults,
  moscowDay,
  resultKind,
  type ResultMode,
} from "@/lib/crm-results-model";
const ALL = "__all__";
export function DealAnalytics({
  deals,
  stages,
  staffName,
  onOpen,
}: {
  deals: Deal[];
  stages: DealStage[];
  staffName: Map<string, string>;
  onOpen?: (deal: Deal) => void;
}) {
  const today = moscowDay(new Date().toISOString());
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [mode, setMode] = useState<ResultMode>("inquiries");
  const [source, setSource] = useState(ALL);
  const [staff, setStaff] = useState(ALL);
  const scoped = useMemo(
    () => deals.filter((d) => staff === ALL || d.responsible_id === staff),
    [deals, staff],
  );
  const period = useMemo(
    () => filterCrmResults(scoped, stages, mode, from, to),
    [scoped, stages, mode, from, to],
  );
  const sources = crmSources(period, stages, mode);
  const rows = period
    .filter(
      (d) =>
        source === ALL ||
        (mode === "won" ? d.closing_source : d.source)?.trim() === source ||
        (source === "Не указан" && !(mode === "won" ? d.closing_source : d.source)?.trim()),
    )
    .sort((a, b) =>
      (mode === "inquiries" ? b.created_at : (b.closed_at ?? "")).localeCompare(
        mode === "inquiries" ? a.created_at : (a.closed_at ?? ""),
      ),
    );
  const grouped = crmSources(rows, stages, mode);
  const won = rows.filter((d) => resultKind(d, stages) === "won");
  const lost = rows.filter((d) => resultKind(d, stages) === "lost");
  const unknown = scoped.filter((d) => resultKind(d, stages) === mode && !d.closed_at).length;
  const reasons = Object.entries(
    lost.reduce<Record<string, number>>((acc, d) => {
      const name = d.loss_reason_name || "Причина не указана";
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const metrics =
    mode === "inquiries"
      ? [
          ["Создано сделок из обращений", rows.length],
          ["Из них успешные", won.length],
          ["Из них проваленные", lost.length],
          ["Ещё в работе", rows.length - won.length - lost.length],
        ]
      : mode === "won"
        ? [
            ["Успешные сделки", rows.length],
            [
              "Аренда по договорам / мес.",
              formatBudget(rows.reduce((s, d) => s + (d.price_month ?? 0), 0)),
            ],
            [
              "Доход компании / мес.",
              rows.some((d) => d.income_month != null)
                ? formatBudget(rows.reduce((s, d) => s + (d.income_month ?? 0), 0))
                : "Не указан",
            ],
            [
              "Средний срок до сделки",
              rows.some((d) => d.closed_at)
                ? Math.round(
                    rows
                      .filter((d) => d.closed_at)
                      .reduce(
                        (s, d) =>
                          s +
                          Math.max(
                            0,
                            (Date.parse(d.closed_at!) - Date.parse(d.created_at)) / 86400000,
                          ),
                        0,
                      ) / rows.filter((d) => d.closed_at).length,
                  ) + " дн."
                : "—",
            ],
          ]
        : [
            ["Проваленные сделки", rows.length],
            ["Причин провала", reasons.length],
            ["С указанием причины", lost.filter((d) => d.loss_reason_name).length],
            ["Без причины (старые)", lost.filter((d) => !d.loss_reason_name).length],
          ];
  return (
    <div className="crm-analytics">
      <div className="crm-filter">
        <span className="text-xs text-muted-foreground">
          {mode === "inquiries" ? "Период создания" : "Период закрытия"}
        </span>
        <Input
          aria-label="Начало периода"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-auto"
        />
        <span>—</span>
        <Input
          aria-label="Конец периода"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-auto"
        />
        <Button
          variant="outline"
          onClick={() => {
            setFrom(today.slice(0, 7) + "-01");
            setTo(today);
          }}
        >
          Этот месяц
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          Всё время
        </Button>
        <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
          {(
            [
              ["inquiries", "Обращения"],
              ["won", "Успешные"],
              ["lost", "Проваленные"],
            ] as const
          ).map(([v, label]) => (
            <Button
              key={v}
              size="sm"
              variant={mode === v ? "secondary" : "ghost"}
              onClick={() => {
                setMode(v);
                setSource(ALL);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {from && to && from > to ? (
        <p className="text-destructive">Начало периода позже окончания.</p>
      ) : null}
      <div className="crm-filter">
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все источники</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s.name} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={staff} onValueChange={setStaff}>
          <SelectTrigger className="w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все менеджеры</SelectItem>
            {[...staffName].map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {mode !== "inquiries" && unknown > 0 && (
        <p className="text-xs text-muted-foreground">
          У {unknown} старых сделок нет подтверждённой даты закрытия. Они доступны за «Всё время» и
          не включаются в произвольный период.
        </p>
      )}
      <div className="crm-metrics">
        {metrics.map(([label, value]) => (
          <div key={label} className="crm-panel">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </div>
      {mode === "won" && (
        <p className="text-xs text-muted-foreground">
          Доход указан у {rows.filter((d) => d.income_month != null).length} из {rows.length}{" "}
          сделок. Это условия договоров, получение денег отмечается отдельно.{" "}
          {deals[0]?.pipeline === "intake"
            ? "Для новых объектов финансовые показатели не заполняются автоматически."
            : ""}
        </p>
      )}
      <section className="crm-panel">
        <h2 className="text-sm font-semibold">
          {mode === "inquiries"
            ? "Откуда создавались сделки"
            : mode === "won"
              ? "Площадки успешных сделок"
              : "Источники проваленных сделок"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {mode === "inquiries"
            ? "Источник обращения при создании, включая сделки в работе и отказы"
            : "За выбранный период"}
        </p>
        {!grouped.length ? (
          <p className="mt-5 text-sm text-muted-foreground">Нет данных.</p>
        ) : (
          grouped.map((s) => (
            <div key={s.name} className="crm-source">
              <span>{s.name}</span>
              <div className="h-2 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-primary/80"
                  style={{
                    width: `${(s.total / Math.max(...grouped.map((x) => x.total))) * 100}%`,
                  }}
                />
              </div>
              <b>{s.total}</b>
              <span className="text-muted-foreground">
                {Math.round((s.total / rows.length) * 100)}%
              </span>
            </div>
          ))
        )}
      </section>
      {mode === "inquiries" && (
        <section className="crm-panel overflow-x-auto">
          <h2 className="mb-4 text-sm font-semibold">Обращения и результат по источникам</h2>
          <table className="crm-table">
            <thead>
              <tr>
                {[
                  "Источник",
                  "Создано",
                  "Успешные",
                  "Проваленные",
                  "В работе",
                  "Доля успешных",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>{s.total}</td>
                  <td>{s.won}</td>
                  <td>{s.lost}</td>
                  <td>{s.open}</td>
                  <td>{Math.round((s.won / s.total) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-muted-foreground">
            Доля успешных среди всех созданных сделок этого источника. Часть ещё в работе.
          </p>
        </section>
      )}
      {mode === "lost" && (
        <section className="crm-panel">
          <h2 className="mb-3 text-sm font-semibold">Причины провала</h2>
          {reasons.map(([name, n]) => (
            <div key={name} className="flex justify-between border-b border-border py-3 text-sm">
              <span>{name}</span>
              <b>{n}</b>
            </div>
          ))}
        </section>
      )}
      <section className="crm-panel overflow-x-auto">
        <h2 className="mb-4 text-sm font-semibold">
          {mode === "inquiries"
            ? "Обращения"
            : mode === "won"
              ? "Успешные сделки"
              : "Проваленные сделки"}{" "}
          <span className="ml-2 font-normal text-muted-foreground">{rows.length}</span>
        </h2>
        <table className="crm-table">
          <thead>
            <tr>
              {[
                "Сделка",
                mode === "inquiries" ? "Создана" : "Закрыта",
                "Источник обращения",
                mode === "won" ? "Площадка сделки" : "Результат",
                "Ответственный",
                mode === "lost" ? "Причина" : "Аренда / мес.",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>
                  <button
                    className="text-left font-medium hover:text-primary"
                    onClick={() => onOpen?.(d)}
                  >
                    {d.title || "Без названия"}
                  </button>
                </td>
                <td>
                  {mode === "inquiries"
                    ? moscowDay(d.created_at)
                    : d.closed_at
                      ? moscowDay(d.closed_at)
                      : "Дата неизвестна"}
                </td>
                <td>{d.source || "Не указан"}</td>
                <td>
                  {mode === "won"
                    ? d.closing_source || "Не указана"
                    : { open: "В работе", won: "Успешно", lost: "Провалена" }[
                        resultKind(d, stages)
                      ]}
                </td>
                <td>{staffName.get(d.responsible_id ?? "") || "Не назначен"}</td>
                <td>
                  {mode === "lost"
                    ? d.loss_reason_name || "Не указана"
                    : formatBudget(d.price_month)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="py-5 text-sm text-muted-foreground">За выбранный период сделок нет.</p>
        )}
      </section>
    </div>
  );
}
