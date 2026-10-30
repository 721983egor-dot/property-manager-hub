import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminOnly } from "@/components/AdminOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getYandexConnection,
  saveYandexConnection,
  getYandexAdvertising,
  prepareYandexChange,
  confirmYandexChange,
} from "@/lib/yandex-marketing/functions";
import type { Change } from "@/lib/yandex-marketing/model";

export const Route = createFileRoute("/_authenticated/system/advertising")({
  head: () => ({ meta: [{ title: "Реклама — RM OS" }] }),
  component: () => (
    <AdminOnly>
      <AdvertisingPage />
    </AdminOnly>
  ),
});
const number = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const date = (v: string | null) =>
  v ? new Date(v).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "ещё не загружено";
const statuses: Record<string, string> = {
  ON: "Включена",
  OFF: "Выключена",
  SUSPENDED: "Остановлена",
  ARCHIVED: "Архив",
  MODERATION: "На модерации",
  DRAFT: "Черновик",
  ACCEPTED: "Одобрена",
  REJECTED: "Отклонена",
  ENDED: "Завершена",
};

function AdvertisingPage() {
  const client = useQueryClient();
  const statusFn = useServerFn(getYandexConnection),
    saveFn = useServerFn(saveYandexConnection),
    reportFn = useServerFn(getYandexAdvertising);
  const prepareFn = useServerFn(prepareYandexChange),
    confirmFn = useServerFn(confirmYandexChange);
  const [days, setDays] = useState(30),
    [refresh, setRefresh] = useState(false);
  const status = useQuery({ queryKey: ["yandex-connection"], queryFn: () => statusFn() });
  const report = useQuery({
    queryKey: ["yandex-advertising", days, refresh],
    queryFn: () => reportFn({ data: { days, refresh } }),
    enabled: Boolean(status.data?.directConfigured || status.data?.metrikaConfigured),
    retry: false,
  });
  const [login, setLogin] = useState(""),
    [counter, setCounter] = useState("");
  const [directToken, setDirectToken] = useState(""),
    [metrikaToken, setMetrikaToken] = useState("");
  const [tenantGoal, setTenantGoal] = useState(""),
    [ownerGoal, setOwnerGoal] = useState("");
  const [editing, setEditing] = useState<number | null>(null),
    [operation, setOperation] = useState<Change["operation"]>("suspend");
  const [phrases, setPhrases] = useState(""),
    [budget, setBudget] = useState(""),
    [cpc, setCpc] = useState(""),
    [reason, setReason] = useState("");
  const [proposal, setProposal] = useState<{ proposalId: string; summary: string } | null>(null);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          login: login || status.data?.login || "residence-more",
          counterId: Number(counter || status.data?.counterId || 97013300),
          tenantGoalId: Number(tenantGoal || status.data?.tenantGoalId || 676665001),
          ownerGoalId: Number(ownerGoal || status.data?.ownerGoalId || 676665229),
          directToken,
          metrikaToken,
        },
      }),
    onSuccess: () => {
      setDirectToken("");
      setMetrikaToken("");
      toast.success("Подключение сохранено. Проверяем получение данных");
      void client.invalidateQueries({ queryKey: ["yandex-connection"] });
      void client.invalidateQueries({ queryKey: ["yandex-advertising"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const prepare = useMutation({
    mutationFn: () =>
      prepareFn({
        data: {
          campaignId: editing!,
          operation,
          reason,
          ...(operation === "addNegativeKeywords"
            ? {
                negativeKeywords: phrases
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean),
              }
            : {}),
          ...(operation === "setSearchClickLimits"
            ? {
                ...(budget ? { periodBudgetRub: Number(budget) } : {}),
                ...(cpc ? { averageCpcRub: Number(cpc) } : {}),
              }
            : {}),
        },
      }),
    onSuccess: setProposal,
    onError: (e: Error) => toast.error(e.message),
  });
  const confirm = useMutation({
    mutationFn: () => confirmFn({ data: { proposalId: proposal!.proposalId } }),
    onSuccess: (message) => {
      toast.success(message);
      setProposal(null);
      setEditing(null);
      void client.invalidateQueries({ queryKey: ["yandex-advertising"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setProposal(null);
    },
  });
  const data = report.data;
  const sources = data
    ? ([
        ["Кампании", data.campaigns],
        ["Расходы", data.performance],
        ["Объявления", data.ads],
        ["Поисковые запросы", data.queries],
        ["Метрика", data.metrika],
      ] as const)
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Реклама</h1>
        <p className="text-sm text-muted-foreground">
          Директ, Метрика и заявки РМ ОС. Изменения кампаний применяются после вашего подтверждения.
        </p>
      </div>
      {status.error && (
        <p role="alert" className="text-destructive">
          {status.error.message}
        </p>
      )}
      <details
        className="rounded-lg border p-4"
        open={!status.data?.directConfigured && !status.data?.metrikaConfigured}
      >
        <summary className="cursor-pointer font-medium">
          Подключение Яндекса ·{" "}
          {status.data?.directConfigured ? "ключ Директа сохранён" : "Директ не подключён"} ·{" "}
          {status.data?.metrikaConfigured ? "ключ Метрики сохранён" : "Метрика не подключена"}
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Логин кабинета
            <Input
              value={login}
              placeholder={status.data?.login || "residence-more"}
              onChange={(e) => setLogin(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Номер счётчика
            <Input
              type="number"
              value={counter}
              placeholder={String(status.data?.counterId || 97013300)}
              onChange={(e) => setCounter(e.target.value)}
            />
          </label>
          <label className="text-sm">
            ID цели заявки арендатора
            <Input
              type="number"
              value={tenantGoal}
              placeholder={String(status.data?.tenantGoalId || 676665001)}
              onChange={(e) => setTenantGoal(e.target.value)}
            />
          </label>
          <label className="text-sm">
            ID цели заявки собственника
            <Input
              type="number"
              value={ownerGoal}
              placeholder={String(status.data?.ownerGoalId || 676665229)}
              onChange={(e) => setOwnerGoal(e.target.value)}
            />
          </label>
          <label className="text-sm">
            OAuth-токен Директа
            <Input
              type="password"
              autoComplete="off"
              value={directToken}
              onChange={(e) => setDirectToken(e.target.value)}
              placeholder="Пусто — сохранить прежний"
            />
          </label>
          <label className="text-sm">
            OAuth-токен Метрики
            <Input
              type="password"
              autoComplete="off"
              value={metrikaToken}
              onChange={(e) => setMetrikaToken(e.target.value)}
              placeholder="Пусто — сохранить прежний"
            />
          </label>
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Подключение выполняется один раз: приложение Яндекса с доступом к API Директа и чтению
            Метрики (metrika:read). Для Директа Яндекс может запросить одобрение заявки. Один токен
            с обоими правами можно указать в обоих полях. Ключи не передаются Ассистенту и не
            показываются после сохранения.
          </p>
          <p className="text-sm sm:col-span-2">
            <a
              className="underline"
              href="https://yandex.ru/dev/direct/"
              target="_blank"
              rel="noreferrer"
            >
              Подключить API Директа
            </a>{" "}
            ·{" "}
            <a
              className="underline"
              href="https://yandex.ru/dev/metrika/ru/intro/authorization"
              target="_blank"
              rel="noreferrer"
            >
              Доступ к Метрике
            </a>
          </p>
          <Button onClick={() => save.mutate()} disabled={save.isPending || status.isPending}>
            {save.isPending ? "Сохраняем…" : "Сохранить подключение"}
          </Button>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Период{" "}
          <select
            className="rounded border bg-background p-2"
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setRefresh(false);
            }}
          >
            {[1, 7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "Сегодня" : `${d} дней`}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          disabled={report.isFetching || !report.isEnabled}
          onClick={() => {
            setRefresh(true);
            if (refresh) void report.refetch();
          }}
        >
          {report.isFetching ? "Обновляем…" : "Обновить статистику"}
        </Button>
        <span className="text-sm text-muted-foreground">
          Даты по Москве · суммы без НДС · автоматическое обновление раз в час
        </span>
      </div>
      {report.error && (
        <p role="alert" className="text-destructive">
          {report.error.message}
        </p>
      )}
      {data && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map(([name, source]) => (
              <div className="rounded border p-3 text-sm" key={name}>
                <b>{name}</b>
                <div>Обновлено: {date(source.syncedAt)}</div>
                {source.stale && <div className="text-amber-600">Требует обновления</div>}
                {source.error && <p className="text-destructive">{source.error}</p>}
                {Boolean((source.data as { truncated?: boolean } | null)?.truncated) && (
                  <p className="text-amber-600">Показана часть строк отчёта</p>
                )}
              </div>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                Кампании · {data.period.start} — {data.period.end}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data.rows.length ? (
                <p>Кампании ещё не загружены. Проверьте подключение и статус API выше.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        {[
                          "Кампания",
                          "Состояние",
                          "Расход, ₽",
                          "Клики",
                          "Заявки CRM",
                          "Цена заявки, ₽",
                          "Сделки / успешные",
                          "",
                        ].map((h) => (
                          <th className="p-2" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => (
                        <tr key={row.id} className="border-b align-top">
                          <td className="p-2">
                            <a
                              className="font-medium underline"
                              target="_blank"
                              rel="noreferrer"
                              href={`https://direct.yandex.ru/dna/campaigns-edit?ulogin=${encodeURIComponent(data.connection.login)}&campaigns-ids=${row.id}`}
                            >
                              {row.name}
                            </a>
                            <div className="text-xs text-muted-foreground">
                              №{row.id} · {row.utm || "UTM не сопоставлена"}
                              {row.mappingAmbiguous ? " · неоднозначная UTM" : ""}
                            </div>
                          </td>
                          <td className="p-2">
                            {statuses[row.state] || row.state}
                            <div>{statuses[row.status] || row.status}</div>
                          </td>
                          <td className="p-2">{number(row.costExVat)}</td>
                          <td className="p-2">{number(row.clicks)}</td>
                          <td className="p-2">{number(row.crmLeads)}</td>
                          <td className="p-2">{number(row.costPerCrmLeadExVat)}</td>
                          <td className="p-2">
                            {row.linkedDeals
                              ? `${row.linkedDeals.total} / ${row.linkedDeals.won}${row.linkedDeals.truncated ? " (неполно)" : ""}`
                              : "—"}
                          </td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditing(row.id);
                                setOperation("suspend");
                                setReason("");
                                setPhrases("");
                                setBudget("");
                                setCpc("");
                              }}
                            >
                              Изменить
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Заявок без источника: {data.crm.unattributed}. Тестовых исключено:{" "}
                {data.crm.excludedTests}.
                {data.crm.truncated
                  ? " Внимание: выборка CRM неполная, CPL не рассчитывается."
                  : ""}{" "}
                Цена заявки — сравнение расходов и обращений за период; это не окупаемость.
              </p>
            </CardContent>
          </Card>
          <ReportTable title="Объявления — расходы и результаты" payload={data.ads.data} />
          <ReportTable
            title="Поисковые запросы — расходы и результаты"
            payload={data.queries.data}
          />
          <MetrikaTable payload={data.metrika.data} />
          <Card>
            <CardContent className="space-y-2 pt-5 text-sm">
              <p>
                Ассистент уже использует этот отчёт. Например: «Сравни кампании за неделю, сопоставь
                расходы с заявками и предложи минус-фразы».
              </p>
              {data.notes.map((note) => (
                <p key={note} className="text-xs text-muted-foreground">
                  {note}
                </p>
              ))}
            </CardContent>
          </Card>
        </>
      )}
      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open && !confirm.isPending) {
            setEditing(null);
            setProposal(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Кампания №{editing}</DialogTitle>
          </DialogHeader>
          {proposal ? (
            <>
              <p className="whitespace-pre-wrap text-sm">{proposal.summary}</p>
              <p className="text-xs text-muted-foreground">
                Предложение действует 30 минут. Перед исполнением настройки кампании будут проверены
                повторно.
              </p>
              <Button disabled={confirm.isPending} onClick={() => confirm.mutate()}>
                {confirm.isPending ? "Применяем…" : "Подтвердить изменение в Директе"}
              </Button>
              <Button
                variant="outline"
                disabled={confirm.isPending}
                onClick={() => setProposal(null)}
              >
                Назад
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                Действие
                <select
                  className="mt-1 w-full rounded border bg-background p-2"
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as Change["operation"])}
                >
                  <option value="suspend">Остановить показы</option>
                  <option value="resume">Возобновить показы</option>
                  <option value="addNegativeKeywords">Добавить минус-фразы</option>
                  <option value="setSearchClickLimits">Изменить бюджет / среднюю цену клика</option>
                </select>
              </label>
              {operation === "addNegativeKeywords" && (
                <label className="block text-sm">
                  Минус-фразы, по одной на строке
                  <textarea
                    className="mt-1 w-full rounded border bg-background p-2"
                    rows={5}
                    value={phrases}
                    onChange={(e) => setPhrases(e.target.value)}
                  />
                </label>
              )}
              {operation === "setSearchClickLimits" && (
                <>
                  <label className="block text-sm">
                    Бюджет на прежний период, ₽ без НДС
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="Не менять"
                    />
                  </label>
                  <label className="block text-sm">
                    Средняя цена клика, ₽ без НДС
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={cpc}
                      onChange={(e) => setCpc(e.target.value)}
                      placeholder="Не менять"
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Для поисковой ЕПК со средней ценой клика и бюджетом на период. Тип стратегии,
                    сроки и площадки сохраняются.
                  </p>
                </>
              )}
              <label className="block text-sm">
                Причина
                <Input
                  value={reason}
                  maxLength={1000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <Button
                disabled={prepare.isPending || !reason.trim()}
                onClick={() => prepare.mutate()}
              >
                {prepare.isPending ? "Проверяем…" : "Подготовить изменение"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ReportTable({ title, payload }: { title: string; payload: unknown }) {
  const data = payload as { rows: Record<string, string>[]; truncated: boolean } | null;
  if (!data) return null;
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        {title} · {data.rows.length} строк{data.truncated ? " (выборка неполная)" : ""}
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {Object.keys(data.rows[0] ?? {}).map((h) => (
                <th key={h} className="p-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 100).map((r, i) => (
              <tr className="border-t" key={i}>
                {Object.entries(r).map(([k, v]) => (
                  <td className="p-2" key={k}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        В таблице первые 100 строк; Ассистент видит сохранённую выборку до 10 000. Цели показаны
        отдельно по ID, модель AUTO. Расходы без НДС.
      </p>
    </details>
  );
}
function MetrikaTable({ payload }: { payload: unknown }) {
  const data = payload as {
    rows: { dimensions: { name: string | null }[]; metrics: number[] }[];
    sampled: boolean;
    truncated: boolean;
    sampleShare?: number;
  } | null;
  if (!data) return null;
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        Метрика по UTM · {data.rows.length} строк
      </summary>
      {data.sampled && (
        <p className="text-amber-600">
          Семплированные данные: {number((data.sampleShare ?? 0) * 100)}% выборки
        </p>
      )}
      {data.truncated && <p className="text-amber-600">Показана часть строк Метрики</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {[
                "Источник",
                "Канал",
                "Кампания",
                "Визиты",
                "Посетители",
                "Отказы, %",
                "Глубина",
                "Время, сек",
                "Цель арендатора",
                "Цель собственника",
              ].map((h) => (
                <th key={h} className="p-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 100).map((r, i) => (
              <tr key={i} className="border-t">
                {r.dimensions.map((d, j) => (
                  <td className="p-2" key={j}>
                    {d.name || "—"}
                  </td>
                ))}
                {r.metrics.map((m, j) => (
                  <td className="p-2" key={j}>
                    {number(m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
