import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
  getMessengerStatus,
  registerMaxChatWebhook,
  saveMaxBotToken,
  saveTelegramChatBotToken,
} from "@/lib/messengers.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/system/messengers")({
  head: () => ({
    meta: [
      { title: "Мессенджеры — RM OS" },
      {
        name: "description",
        content: "Подключение Telegram и MAX для переписки с клиентами в разделе Чаты.",
      },
    ],
  }),
  component: () => (
    <AdminOnly>
      <MessengersSettingsPage />
    </AdminOnly>
  ),
});

function MessengersSettingsPage() {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getMessengerStatus);
  const saveTg = useServerFn(saveTelegramChatBotToken);
  const saveMax = useServerFn(saveMaxBotToken);
  const registerMax = useServerFn(registerMaxChatWebhook);

  const [tgToken, setTgToken] = useState("");
  const [maxToken, setMaxToken] = useState("");

  const query = useQuery({
    queryKey: ["messenger-status"],
    queryFn: () => statusFn(undefined as never),
  });

  const tgMutation = useMutation({
    mutationFn: () => saveTg({ data: { token: tgToken } }),
    onSuccess: (r) => {
      toast.success(`Telegram подключён: ${r.botName}`);
      setTgToken("");
      void queryClient.invalidateQueries({ queryKey: ["messenger-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const maxMutation = useMutation({
    mutationFn: () => saveMax({ data: { token: maxToken } }),
    onSuccess: (r) => {
      toast.success(`MAX подключён: ${r.botName}`);
      setMaxToken("");
      void queryClient.invalidateQueries({ queryKey: ["messenger-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const webhookMutation = useMutation({
    mutationFn: () => registerMax(undefined as never),
    onSuccess: (r) => {
      toast.success(`Приём сообщений MAX: ${r.url}`);
      void queryClient.invalidateQueries({ queryKey: ["messenger-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = query.data;

  const copy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Мессенджеры</h1>
        <p className="text-sm text-muted-foreground">
          Клиенты пишут ботам Telegram и MAX — переписка появляется в разделе «Чаты». Ответ
          менеджера уходит обратно в мессенджер. Это отдельные боты, не Ассистент.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telegram</CardTitle>
          <CardDescription>
            {query.isLoading
              ? "Проверяем…"
              : data?.telegram.connected
                ? `Подключён: ${data.telegram.botName}`
                : data?.telegram.configured
                  ? `Токен есть, но бот не отвечает: ${data.telegram.error}`
                  : "Создайте бота у @BotFather и вставьте токен"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.telegram.clientLink ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input value={data.telegram.clientLink} readOnly />
              <Button
                type="button"
                variant="outline"
                onClick={() => void copy(data.telegram.clientLink)}
              >
                <Copy className="size-4" />
                Ссылка для клиентов
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              autoComplete="off"
              placeholder="Токен от @BotFather"
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
            />
            <Button
              onClick={() => tgMutation.mutate()}
              disabled={tgMutation.isPending || tgToken.trim().length < 20}
            >
              {tgMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Сохранить
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Сообщения забирает серверный опрос (как у Ассистента). После «Обновить систему» опрос
            запустится автоматически.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">MAX</CardTitle>
          <CardDescription>
            {query.isLoading
              ? "Проверяем…"
              : data?.max.connected
                ? `Подключён: ${data.max.botName}`
                : data?.max.configured
                  ? `Токен есть, но бот не отвечает: ${data.max.error}`
                  : "Токен бота — в MAX для бизнеса → Чат-боты → Настройки"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.max.clientLink ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input value={data.max.clientLink} readOnly />
              <Button
                type="button"
                variant="outline"
                onClick={() => void copy(data.max.clientLink)}
              >
                <Copy className="size-4" />
                Ссылка для клиентов
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              autoComplete="off"
              placeholder="Токен бота MAX"
              value={maxToken}
              onChange={(e) => setMaxToken(e.target.value)}
            />
            <Button
              onClick={() => maxMutation.mutate()}
              disabled={maxMutation.isPending || maxToken.trim().length < 16}
            >
              {maxMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Сохранить
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            По умолчанию сообщения забираются опросом. Webhook нужен только если сервер принимает
            входящий HTTPS снаружи.
          </p>
          <Button
            variant="outline"
            onClick={() => webhookMutation.mutate()}
            disabled={webhookMutation.isPending || !data?.max.configured}
          >
            {webhookMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Включить webhook (опционально)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
