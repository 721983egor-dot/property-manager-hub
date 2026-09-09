import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  DownloadCloud,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  Terminal,
} from "lucide-react";

import { getDeployStatus, triggerDeploy, triggerRollback } from "@/lib/deploy.functions";
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

const PROGRESS_STEPS = [
  "Проверка обновлений…",
  "Создание резервной копии базы…",
  "Получение новой версии из GitHub…",
  "Сборка приложения…",
  "Применение изменений базы данных…",
  "Переключение на новую версию…",
  "Проверка работоспособности…",
];

/** Обрыв связи из-за перезапуска приложения, а не реальная ошибка обновления. */
function isRestartError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (!message.trim()) return true;
  return /invariant failed|failed to fetch|networkerror|load failed|network request failed|502|503|504|aborted|terminated/i.test(
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

function SystemUpdatePage() {

  const queryClient = useQueryClient();
  const loadStatus = useServerFn(getDeployStatus);
  const doDeploy = useServerFn(triggerDeploy);
  const doRollback = useServerFn(triggerRollback);

  const { data: status, isLoading } = useQuery({
    queryKey: ["deploy-status"],
    queryFn: () => loadStatus({ data: undefined }),
    refetchInterval: 15000,
  });

  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(-1);
  const [operation, setOperation] = useState<"idle" | "deploy" | "rollback">("idle");

  useEffect(() => {
    if (operation === "idle") {
      setProgress(0);
      setActiveStep(-1);
      return;
    }
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev;
        const next = prev + Math.random() * 6;
        const step = Math.min(Math.floor((next / 100) * PROGRESS_STEPS.length), PROGRESS_STEPS.length - 1);
        setActiveStep(step);
        return Math.min(next, 95);
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [operation]);

  const deployMutation = useMutation({
    mutationFn: async () => {
      try {
        return await doDeploy({ data: undefined });
      } catch (err) {
        // Во время обновления приложение перезапускается, поэтому ответ на запрос
        // теряется. Это не ошибка — дожидаемся, пока приложение снова поднимется.
        if (!isRestartError(err)) throw err;
        setActiveStep(PROGRESS_STEPS.length - 1);
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


  const agentConfigured = !(status && status.message?.includes("Deploy-агент не настроен"));

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
              Обновите сайт и RM OS до последней версии из Lovable / GitHub
            </p>
          </div>
        </div>

        {!agentConfigured && (
          <Alert variant="destructive">
            <ShieldAlert className="size-4" />
            <AlertTitle>Deploy-агент не подключён</AlertTitle>
            <AlertDescription>
              Чтобы обновлять сайт по кнопке, нужен российский сервер с установленным deploy-агентом.
              Передайте мне доступ к серверу — я настрою всё и добавлю сюда реальные данные.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="size-5 text-primary" />
              Текущее состояние
            </CardTitle>
            <CardDescription>
              {isLoading
                ? "Загружаем информацию о версии…"
                : status?.message || "Нет данных"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Установленная версия</p>
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
                  {operation === "deploy" ? "Идёт обновление…" : "Идёт откат…"}
                </p>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {activeStep >= 0 ? PROGRESS_STEPS[activeStep] : "Запускаем…"}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => deployMutation.mutate()}
                disabled={operation !== "idle" || deployMutation.isPending || rollbackMutation.isPending}
              >
                {deployMutation.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <DownloadCloud className="mr-2 size-4" />
                )}
                Обновить систему
              </Button>
              <Button
                variant="outline"
                onClick={() => rollbackMutation.mutate()}
                disabled={operation !== "idle" || deployMutation.isPending || rollbackMutation.isPending}
              >
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
                disabled={isLoading}
              >
                <RefreshCw className="mr-2 size-4" />
                Обновить статус
              </Button>
            </div>

            {(deployMutation.error || rollbackMutation.error) && (
              <Alert variant="destructive">
                <Terminal className="size-4" />
                <AlertTitle>Ошибка</AlertTitle>
                <AlertDescription>
                  {deployMutation.error?.message || rollbackMutation.error?.message}
                </AlertDescription>
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
            <CardDescription>После подключения сервера здесь появится история деплоев</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
                <span>Пока обновлений не было</span>
                <span>—</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Как это работает</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Вы вносите изменения в Lovable и они попадают в GitHub.</li>
            <li>На этой странице нажимаете «Обновить систему».</li>
            <li>Сервер в России забирает свежий код, собирает приложение и переключает трафик.</li>
            <li>Перед обновлением автоматически делается резервная копия базы данных.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
