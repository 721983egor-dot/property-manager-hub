import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createTelegramLinkCode,
  getTelegramStatus,
  registerTelegramWebhook,
  unlinkTelegramAccount,
} from "@/lib/telegram.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/system/telegram")({
  head: () => ({
    meta: [
      { title: "Ассистент в Telegram — RM OS" },
      {
        name: "description",
        content: "Подключение Telegram-бота Ассистента RM OS и привязка аккаунтов менеджеров.",
      },
    ],
  }),
  component: TelegramSettingsPage,
});

function TelegramSettingsPage() {
  const queryClient = useQueryClient();
  const status = useServerFn(getTelegramStatus);
  const createCode = useServerFn(createTelegramLinkCode);
  const unlink = useServerFn(unlinkTelegramAccount);
  const register = useServerFn(registerTelegramWebhook);

  const [code, setCode] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>(
    typeof window === "undefined" ? "" : window.location.origin,
  );

  const query = useQuery({ queryKey: ["telegram-status"], queryFn: () => status({ data: {} }) });

  const codeMutation = useMutation({
    mutationFn: () => createCode({ data: {} }),
    onSuccess: (r) => setCode(r.code),
    onError: (e: Error) => toast.error(e.message),
  });

  const unlinkMutation = useMutation({
    mutationFn: (id: string) => unlink({ data: { id } }),
    onSuccess: () => {
      toast.success("Аккаунт отвязан");
      void queryClient.invalidateQueries({ queryKey: ["telegram-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const webhookMutation = useMutation({
    mutationFn: () => register({ data: { baseUrl } }),
    onSuccess: (r) => {
      toast.success(`Бот подключён к ${r.url}`);
      void queryClient.invalidateQueries({ queryKey: ["telegram-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = query.data;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Ассистент в Telegram</h1>
        <p className="text-sm text-muted-foreground">
          Пишите Ассистенту текстом или голосом прямо в Telegram. Изменения он предлагает
          кнопками — выполняются только после подтверждения.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Бот</CardTitle>
          <CardDescription>
            {query.isLoading
              ? "Проверяем подключение…"
              : data?.connected
                ? `Подключён: ${data.botName}`
                : `Бот не отвечает: ${data?.error ?? "нет подключения"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            Адрес приёма сообщений:{" "}
            <span className="break-all font-medium">{data?.webhookUrl || "не задан"}</span>
          </div>
          {data?.error && data.connected && (
            <p className="text-sm text-destructive">Последняя ошибка Telegram: {data.error}</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://rm-os.residence-more.ru"
            />
            <Button
              onClick={() => webhookMutation.mutate()}
              disabled={webhookMutation.isPending || !baseUrl}
            >
              {webhookMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Включить приём сообщений
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Код привязки</CardTitle>
          <CardDescription>
            Отправьте код боту одним сообщением — аккаунт получит доступ. Код действует 30 минут.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={() => codeMutation.mutate()} disabled={codeMutation.isPending}>
            {codeMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Получить код
          </Button>
          {code && (
            <>
              <span className="rounded-md bg-muted px-3 py-2 font-mono text-lg tracking-widest">
                {code}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(code);
                  toast.success("Скопировано");
                }}
              >
                <Copy className="size-4" />
                Копировать
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Кто может писать боту</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.accounts ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Пока никто не привязан.</p>
          )}
          {(data?.accounts ?? []).map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{a.display_name || "Без имени"}</div>
                <div className="truncate text-muted-foreground">
                  {a.username ? `@${a.username}` : `ID ${a.telegram_user_id}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => unlinkMutation.mutate(a.id)}
                disabled={unlinkMutation.isPending}
              >
                <Trash2 className="size-4" />
                Отвязать
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
