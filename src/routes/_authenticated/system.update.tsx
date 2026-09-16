import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  DownloadCloud,
  ExternalLink,
  FlaskConical,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  Terminal,
} from "lucide-react";

import { getDeployStatus, triggerDeploy, triggerPreviewDeploy, triggerRollback } from "@/lib/deploy.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/_authenticated/system/update")({
  head: () => ({
    meta: [{ title: "Обновление системы — RM OS" }],
  }),
  component: () => (
    <AdminOnly>
      <SystemUpdatePage />
    </AdminOnly>
  ),
});

const PROGRESS_STEPS = {
  preview: [
    "Получение тестовой версии из GitHub…",
    "Сборка тестовой копии…",
    "Выкладка на preview.residence-more.ru…",
    "Проверка, что рабочий сайт не тронут…",
  ],
  deploy: [
    "Проверка обновлений…",
    "Создание резервной копии базы…",
    "Получение проверенной версии из GitHub…",
    "Сборка приложения…",
    "Применение изменений базы данных…",
    "Переключение рабочего сайта и RM OS…",
    "Проверка работоспособности…",
  ],
  rollback: [
    "Поиск предыдущей рабочей версии…",
    "Восстановление базы из копии…",
    "Сборка предыдущей версии…",
    "Возврат рабочего сайта…",
  ],
} as const;

/** Обрыв связи из-за перезапуска приложения, а не реальная ошибка обновления. */
function isRestartError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (!message.trim()) return true;
  // Node undici: "fetch failed"; браузер: "Failed to fetch" / "Load failed"
  return /invariant failed|failed to fetch|fetch failed|networkerror|load failed|network request failed|502|503|504|aborted|terminated|econnrefused|econnreset|etimedout|socket hang up/i.test(
    message,
  );
}

/** Ждём, пока приложение снова начнёт отвечать после перезапуска. */
async function waitForAppRestart(timeoutMs = 5 * 60 * 1000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const res = await fetch("/api/public/health", { cache: "no-store" });
      if (res.ok) return true;
    } catch {
      // приложение ещё перезапускается
    }
  }
  return false;
}

type DeployStatus = {
  ok?: boolean;
  preview_version?: string;
  message?: string;
  deployments?: { target?: string; status?: string; at?: string; error?: string }[];
};

/** Сборка теста долгая: браузер часто показывает Failed to fetch, пока Docker ещё собирает. */
async function waitForPreviewReady(
  loadStatus: () => Promise<DeployStatus>,
  previousVersion: string | undefined,
  startedAt: number,
  timeoutMs = 12 * 60 * 1000,
): Promise<DeployStatus | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const next = await loadStatus();
      const latest = [...(next.deployments ?? [])]
        .reverse()
        .find((item) => item.target === "preview");
      const at = latest?.at ? Date.parse(latest.at) : 0;
      if (latest?.status === "failed" && at >= startedAt - 15_000) {
        throw new Error(latest.error || "Тестовая выкладка не удалась");
      }
      if (
        latest?.status === "success" &&
        at >= startedAt - 15_000 &&
        next.preview_version &&
        next.preview_version !== previousVersion
      ) {
        return next;
      }
    } catch (error) {
      if (error instanceof Error && /не удалась/i.test(error.message)) throw error;
    }
  }
  return null;
}

function formatWhen(iso?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function SystemUpdatePage() {
  const queryClient = useQueryClient();
  const loadStatus = useServerFn(getDeployStatus);
  const doPreview = useServerFn(triggerPreviewDeploy);
  const doDeploy = useServerFn(triggerDeploy);
  const doRollback = useServerFn(triggerRollback);

  const { data: status, isLoading } = useQuery({
    queryKey: ["deploy-status"],
    queryFn: () => loadStatus({ data: undefined }),
    refetchInterval: 15000,
  });

  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(-1);
  const [operation, setOperation] = useState<"idle" | "preview" | "deploy" | "rollback">("idle");

  useEffect(() => {
    if (operation === "idle") {
      setProgress(0);
      setActiveStep(-1);
      return;
    }
    const steps = PROGRESS_STEPS[operation];
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev;
        const next = prev + Math.random() * 6;
        const step = Math.min(Math.floor((next / 100) * steps.length), steps.length - 1);
        setActiveStep(step);
        return Math.min(next, 95);
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [operation]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const previousVersion = status?.preview_version;
      const startedAt = Date.now();
      try {
        return await doPreview({ data: undefined });
      } catch (err) {
        if (!isRestartError(err)) throw err;
        const ready = await waitForPreviewReady(
          () => loadStatus({ data: undefined }),
          previousVersion,
          startedAt,
        );
        if (!ready) {
          throw new Error(
            "Сборка теста ещё идёт или связь оборвалась. Подождите 5–10 минут и нажмите «Обновить статус». Рабочий сайт не менялся.",
          );
        }
        return {
          ...ready,
          message:
            ready.message ||
            `Тестовая версия ${ready.preview_version} готова. Рабочий сайт не изменён.`,
        };
      }
    },
    onMutate: () => {
      setOperation("preview");
      setProgress(5);
      setActiveStep(0);
    },
    onSettled: () => {
      setOperation("idle");
      setProgress(100);
      setActiveStep(-1);
      queryClient.invalidateQueries({ queryKey: ["deploy-status"] });
    },
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      try {
        return await doDeploy({ data: undefined });
      } catch (err) {
        if (!isRestartError(err)) throw err;
        setActiveStep(PROGRESS_STEPS.deploy.length - 1);
        const back = await waitForAppRestart();
        if (!back) {
          throw new Error(
            "Приложение не ответило после обновления. Подождите минуту и обновите страницу.",
          );
        }
        return {
          ok: true,
          message: "Обновление применено, приложение перезапущено",
        };
      }
    },
    onMutate: () => {
      setOperation("deploy");
      setProgress(5);
      setActiveStep(0);
    },
    onSettled: () => {
      setOperation("idle");
      setProgress(100);
      setActiveStep(-1);
      queryClient.invalidateQueries({ queryKey: ["deploy-status"] });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async () => {
      try {
        return await doRollback({ data: undefined });
      } catch (err) {
        if (!isRestartError(err)) throw err;
        const back = await waitForAppRestart();
        if (!back) {
          throw new Error(
            "Приложение не ответило после отката. Подождите минуту и обновите страницу.",
          );
        }
        return { ok: true, message: "Откат применён, приложение перезапущено" };
      }
    },
    onMutate: () => {
      setOperation("rollback");
      setProgress(5);
      setActiveStep(0);
    },
    onSettled: () => {
      setOperation("idle");
      setProgress(100);
      setActiveStep(-1);
      queryClient.invalidateQueries({ queryKey: ["deploy-status"] });
    },
  });

  const busy = operation !== "idle" || previewMutation.isPending || deployMutation.isPending || rollbackMutation.isPending;
  const agentConfigured = !(status && status.message?.includes("Deploy-агент не настроен"));
  const previewUrl = status?.preview_url ?? "https://preview.residence-more.ru";
  const previewRmOsUrl = status?.preview_rm_os_url ?? "https://preview-rm-os.residence-more.ru";
  const steps = operation === "idle" ? [] : PROGRESS_STEPS[operation];
  const errorMessage =
    previewMutation.error?.message || deployMutation.error?.message || rollbackMutation.error?.message;
  const successMessage =
    previewMutation.data?.message || deployMutation.data?.message || rollbackMutation.data?.message;

  return (
    <div className="min-h-screen bg-background p-6 lg:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <a href="/objects">
              <ArrowLeft className="size-5" />
            </a>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Обновление системы</h1>
            <p className="text-sm text-muted-foreground">
              Сначала тест на Beget, затем рабочий сайт и RM OS. Lovable не используется.
            </p>
          </div>
        </div>

        {!agentConfigured && (
          <Alert variant="destructive">
            <ShieldAlert className="size-4" />
            <AlertTitle>Deploy-агент не подключён</AlertTitle>
            <AlertDescription>
              Чтобы обновлять сайт по кнопке, нужен сервер Beget с установленным deploy-агентом.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FlaskConical className="size-5 text-primary" />
              1. Посмотреть на тесте
            </CardTitle>
            <CardDescription>
              Сюда попадает ветка <span className="font-medium text-foreground">preview</span> из GitHub.
              Сборка занимает 5–10 минут: если браузер покажет Failed to fetch, подождите и обновите
              статус — тест мог уже выложиться. Рабочие{" "}
              <span className="font-medium text-foreground">residence-more.ru</span> и{" "}
              <span className="font-medium text-foreground">rm-os.residence-more.ru</span> не меняются.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Тестовая версия</p>
              <p className="mt-1 text-lg font-semibold">{status?.preview_version ?? "—"}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => previewMutation.mutate()} disabled={busy}>
                {previewMutation.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <FlaskConical className="mr-2 size-4" />
                )}
                Выложить на тест
              </Button>
              <Button variant="outline" asChild>
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 size-4" />
                  Тестовый сайт
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={previewRmOsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 size-4" />
                  Тестовый RM OS
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="size-5 text-primary" />
              2. Обновить рабочую систему
            </CardTitle>
            <CardDescription>
              Нажимайте, только когда тест выглядит как нужно. На Beget уйдёт та же версия, что на тесте.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Рабочая версия</p>
                <p className="mt-1 text-lg font-semibold">{status?.version ?? "—"}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Статус</p>
                <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
                  {status?.ok ? (
                    <>
                      <CheckCircle2 className="size-5 text-green-500" />
                      Работает
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="size-5 text-destructive" />
                      Требует настройки
                    </>
                  )}
                </p>
              </div>
            </div>

            {operation !== "idle" && (
              <div className="space-y-2 rounded-lg border bg-muted/50 p-4">
                <p className="text-sm font-medium">
                  {operation === "preview"
                    ? "Выкладываем тест…"
                    : operation === "deploy"
                      ? "Обновляем рабочую систему…"
                      : "Возвращаем предыдущую версию…"}
                </p>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {activeStep >= 0 ? steps[activeStep] : "Запускаем…"}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => deployMutation.mutate()} disabled={busy}>
                {deployMutation.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <DownloadCloud className="mr-2 size-4" />
                )}
                Обновить систему
              </Button>
              <Button variant="outline" onClick={() => rollbackMutation.mutate()} disabled={busy}>
                {rollbackMutation.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 size-4" />
                )}
                Вернуть предыдущую версию
              </Button>
              <Button
                variant="ghost"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["deploy-status"] })}
                disabled={isLoading || busy}
              >
                <RefreshCw className="mr-2 size-4" />
                Обновить статус
              </Button>
            </div>

            {errorMessage && (
              <Alert variant="destructive">
                <Terminal className="size-4" />
                <AlertTitle>Ошибка</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            {!errorMessage && successMessage && operation === "idle" && (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertTitle>Готово</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="size-5 text-primary" />
              Журнал обновлений
            </CardTitle>
            <CardDescription>Тест и рабочая система пишутся отдельно</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              {(status?.deployments ?? []).length === 0 ? (
                <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
                  <span>Пока обновлений не было</span>
                  <span>—</span>
                </div>
              ) : (
                [...(status?.deployments ?? [])].reverse().map((item, index) => (
                  <div
                    key={`${item.at ?? "row"}-${index}`}
                    className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm last:border-b-0"
                  >
                    <div>
                      <p className="font-medium">
                        {item.target === "preview" ? "Тест" : "Рабочая система"} · {item.version ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.status === "failed" ? item.error || "Ошибка" : item.source || "rm-os"}
                      </p>
                    </div>
                    <span className="shrink-0 text-muted-foreground">{formatWhen(item.at)}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Как это работает</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Агент в Cursor правит код и пушит ветку preview на GitHub.</li>
            <li>На этой странице нажимаете «Выложить на тест» и открываете preview.residence-more.ru — браузер спросит пароль.</li>
            <li>Если не нравится — рабочий сайт не трогаем, продолжаем правки в Cursor.</li>
            <li>Если всё ок — «Обновить систему»: Beget ставит ту же версию на residence-more.ru и rm-os.residence-more.ru.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
