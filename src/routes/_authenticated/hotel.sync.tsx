import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { HotelTabs } from "@/components/HotelTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccess } from "@/hooks/useAccess";
import {
  getBnovoStatus,
  listBnovoSyncRuns,
  runBnovoSync,
  saveBnovoSettings,
  testBnovoConnection,
} from "@/lib/bnovo.functions";
import { formatDateRu } from "@/lib/rentals";

export const Route = createFileRoute("/_authenticated/hotel/sync")({
  head: () => ({
    meta: [{ title: "Синхронизация Bnovo — N-11" }],
  }),
  component: HotelSyncPage,
});

function HotelSyncPage() {
  const { isAdmin } = useAccess();
  const qc = useQueryClient();
  const statusFn = useServerFn(getBnovoStatus);
  const saveFn = useServerFn(saveBnovoSettings);
  const testFn = useServerFn(testBnovoConnection);
  const syncFn = useServerFn(runBnovoSync);
  const runsFn = useServerFn(listBnovoSyncRuns);

  const { data: status } = useQuery({
    queryKey: ["bnovo-status"],
    queryFn: () => statusFn(undefined as never),
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["bnovo-runs"],
    queryFn: () => runsFn(undefined as never),
  });

  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const filled = Boolean(accountId || password || baseUrl);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          accountId: accountId || status?.accountId || "",
          password,
          baseUrl: baseUrl || status?.baseUrl || "",
        },
      }),
    onSuccess: async () => {
      toast.success("Настройки Bnovo сохранены");
      setPassword("");
      await qc.invalidateQueries({ queryKey: ["bnovo-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bnovo API v1</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Сейчас доступна односторонняя выгрузка броней: список за период и карточка по id. Номера
          и категории заводим в RM OS и сопоставляем по ID комнаты Bnovo.
        </p>
      </header>
      <HotelTabs active="sync" />

      <section className="mt-6 space-y-4 rounded-xl border border-border p-4">
        <p className="text-sm">
          Статус:{" "}
          <span className="font-medium">
            {status?.configured ? "ключи заданы" : "не подключено"}
          </span>
          {status?.accountId ? ` · аккаунт ${status.accountId}` : ""}
        </p>
        {isAdmin ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>ID аккаунта Bnovo</Label>
              <Input
                className="mt-1.5"
                inputMode="numeric"
                value={accountId}
                placeholder={status?.accountId || "только цифры"}
                onChange={(e) => setAccountId(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">Число с экрана Octopus → API-доступ, не ключ.</p>
            </div>
            <div>
              <Label>API-ключ (пароль)</Label>
              <Input
                className="mt-1.5"
                type="password"
                value={password}
                placeholder={status?.hasPassword ? "задан, введите новый чтобы заменить" : "длинная строка"}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Базовый URL (если Bnovo выдаст другой)</Label>
              <Input
                className="mt-1.5"
                value={baseUrl}
                placeholder={status?.baseUrl || "https://api.pms.bnovo.ru"}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !filled}>
              Сохранить ключи
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void testFn(undefined as never)
                  .then(() => toast.success("Авторизация Bnovo прошла"))
                  .catch((e: Error) => toast.error(e.message))
              }
            >
              Проверить связь
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void syncFn({ data: {} })
                  .then(async (r) => {
                    toast.success(r.summary);
                    await qc.invalidateQueries({ queryKey: ["bnovo-runs"] });
                    await qc.invalidateQueries({ queryKey: ["bookings"] });
                    await qc.invalidateQueries({ queryKey: ["crm-clients"] });
                  })
                  .catch((e: Error) => toast.error(e.message))
              }
            >
              Выгрузить брони сейчас
            </Button>
          </div>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Журнал выгрузок</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Когда</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Итог</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={3}>
                    Выгрузок ещё не было.
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr key={run.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDateRu(run.started_at.slice(0, 10))}
                      <div className="text-xs text-muted-foreground">
                        {run.started_at.slice(11, 16)}
                      </div>
                    </td>
                    <td className="px-4 py-3">{run.status}</td>
                    <td className="px-4 py-3">
                      {run.summary}
                      {Array.isArray(run.details?.warnings) &&
                      (run.details.warnings as string[]).length > 0 ? (
                        <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                          {(run.details.warnings as string[]).slice(0, 8).map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
