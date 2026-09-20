import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getVideoHostStatus, saveVideoHostSettingsFn } from "@/lib/video-hosts.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/system/video")({
  head: () => ({
    meta: [
      { title: "Видеоканалы — RM OS" },
      {
        name: "description",
        content: "Подключение Rutube, VK Видео и YouTube для выгрузки роликов с объектов.",
      },
    ],
  }),
  component: () => (
    <AdminOnly>
      <VideoHostsPage />
    </AdminOnly>
  ),
});

function VideoHostsPage() {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getVideoHostStatus);
  const saveFn = useServerFn(saveVideoHostSettingsFn);

  const query = useQuery({
    queryKey: ["video-host-status"],
    queryFn: () => statusFn(undefined as never),
  });

  const [rutubeEmail, setRutubeEmail] = useState("");
  const [rutubePassword, setRutubePassword] = useState("");
  const [rutubeToken, setRutubeToken] = useState("");
  const [rutubeAuthorId, setRutubeAuthorId] = useState("");
  const [vkToken, setVkToken] = useState("");
  const [vkGroupId, setVkGroupId] = useState("");
  const [youtubeClientId, setYoutubeClientId] = useState("");
  const [youtubeClientSecret, setYoutubeClientSecret] = useState("");
  const [youtubeRefreshToken, setYoutubeRefreshToken] = useState("");
  const [extraHashtags, setExtraHashtags] = useState("");

  const data = query.data;
  useEffect(() => {
    if (!data) return;
    setExtraHashtags(data.extraHashtags);
    setRutubeAuthorId(data.rutubeAuthorId);
    setVkGroupId(data.vkGroupId);
    setYoutubeClientId(data.youtubeClientId);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          rutubeEmail,
          rutubePassword,
          rutubeToken,
          rutubeAuthorId,
          vkToken,
          vkGroupId,
          youtubeClientId,
          youtubeClientSecret,
          youtubeRefreshToken,
          extraHashtags,
        },
      }),
    onSuccess: () => {
      toast.success("Настройки видеоканалов сохранены");
      setRutubePassword("");
      setRutubeToken("");
      setVkToken("");
      setYoutubeClientSecret("");
      setYoutubeRefreshToken("");
      void queryClient.invalidateQueries({ queryKey: ["video-host-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Видеоканалы</h1>
        <p className="text-sm text-muted-foreground">
          Когда в карточке объекта есть видеофайл, RM OS выгружает его на Rutube, VK Видео и YouTube
          с описанием, хештегами и контактами. Ссылка Rutube уходит в ЦИАН, Авито и Яндекс.Недвижимость.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rutube</CardTitle>
          <CardDescription>
            Главный канал для площадок. {data?.rutube ? "Подключён." : "Пока не подключён."} Нужны
            почта и пароль аккаунта канала (или готовый Token API). Author ID — из кабинета канала.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            type="email"
            placeholder="Почта Rutube"
            value={rutubeEmail}
            onChange={(e) => setRutubeEmail(e.target.value)}
          />
          <Input
            type="password"
            placeholder={data?.rutube ? "Пароль (оставьте пустым, чтобы не менять)" : "Пароль"}
            value={rutubePassword}
            onChange={(e) => setRutubePassword(e.target.value)}
          />
          <Input
            placeholder="Token API, если уже есть"
            value={rutubeToken}
            onChange={(e) => setRutubeToken(e.target.value)}
          />
          <Input
            placeholder="Author ID канала"
            value={rutubeAuthorId}
            onChange={(e) => setRutubeAuthorId(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VK Видео</CardTitle>
          <CardDescription>
            {data?.vk ? "Подключён." : "Пока не подключён."} Токен пользователя или сообщества с правом
            video. После Rutube ролик добавляется в сообщество как видеозапись.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            placeholder={data?.vk ? "Токен VK (оставьте пустым, чтобы не менять)" : "Токен VK"}
            value={vkToken}
            onChange={(e) => setVkToken(e.target.value)}
          />
          <Input
            placeholder="ID сообщества без минуса, например 123456789"
            value={vkGroupId}
            onChange={(e) => setVkGroupId(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>YouTube</CardTitle>
          <CardDescription>
            {data?.youtube ? "Подключён." : "Пока не подключён."} В Google Cloud включите YouTube Data
            API, создайте OAuth-клиент и получите refresh token с правом youtube.upload (OAuth Playground,
            access_type=offline).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            placeholder="Client ID"
            value={youtubeClientId}
            onChange={(e) => setYoutubeClientId(e.target.value)}
          />
          <Input
            type="password"
            placeholder={data?.youtube ? "Client secret (не менять — оставьте пустым)" : "Client secret"}
            value={youtubeClientSecret}
            onChange={(e) => setYoutubeClientSecret(e.target.value)}
          />
          <Input
            placeholder={data?.youtube ? "Refresh token (не менять — оставьте пустым)" : "Refresh token"}
            value={youtubeRefreshToken}
            onChange={(e) => setYoutubeRefreshToken(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Хештеги в описании</CardTitle>
          <CardDescription>
            К ролику всегда добавляются контакты Residence More, ссылка на объект и эти хештеги.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={extraHashtags}
            onChange={(e) => setExtraHashtags(e.target.value)}
            placeholder="#residencemore #сочи"
          />
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Сохранить
      </Button>
    </div>
  );
}
