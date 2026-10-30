import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getTaskCalendar, saveTaskCalendar } from "@/lib/apple-calendar/functions";

export function TaskAppleCalendar({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false),
    [scope, setScope] = useState<"mine" | "all">("mine");
  const [credentials, setCredentials] = useState<Awaited<
    ReturnType<typeof saveTaskCalendar>
  > | null>(null);
  const [confirm, setConfirm] = useState<"enable" | "disable" | null>(null);
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: ["task-calendar", userId],
    queryFn: () => getTaskCalendar(),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: (action: "enable" | "disable") => saveTaskCalendar({ data: { action, scope } }),
    onSuccess: (result) => {
      setCredentials(result.enabled ? result : null);
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ["task-calendar", userId] });
      toast.success(result.enabled ? "Подключение подготовлено" : "Доступ календаря отключён");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Скопировано");
    } catch {
      toast.error("Выделите и скопируйте значение");
    }
  };
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CalendarDays className="mr-1.5 size-4" />
        Apple Календарь
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          setConfirm(null);
          if (!value) setCredentials(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Задачи в Apple Календаре</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Отдельный календарь RM OS на iPhone и Mac. Срок, название и заметки обычной задачи
            обновляются в обе стороны. Задачи без времени показываются на весь день; без даты и
            выполненные — скрываются.
          </p>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
            <p>
              Новое событие в календаре RM OS создаёт задачу на вас. Удаление события убирает срок,
              сохраняя саму задачу в RM OS.
            </p>
            <p>
              Повторение, исполнитель, чеклист и выполнение меняются в RM OS. Финансовые задачи пока
              остаются в системе.
            </p>
            <p>
              Обновление зависит от расписания загрузки на устройстве, поэтому изменения могут
              появляться с задержкой.
            </p>
          </div>
          {state.isPending ? (
            <p>Загружаю подключение…</p>
          ) : state.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error.message}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">
                {state.data.account?.enabled ? "Подключение включено" : "Подключение выключено"}
              </p>
              {!credentials && (
                <>
                  <label className="text-sm font-medium" htmlFor="calendar-scope">
                    Какие задачи показывать
                  </label>
                  <select
                    id="calendar-scope"
                    className="w-full rounded-md border bg-background p-2"
                    value={scope}
                    onChange={(e) => setScope(e.target.value as "mine" | "all")}
                  >
                    <option value="mine">Только назначенные мне</option>
                    <option value="all">Все обычные задачи</option>
                  </select>
                  {state.data.account?.enabled && (
                    <p className="text-xs text-muted-foreground">
                      Сейчас:{" "}
                      {state.data.account.scope === "all"
                        ? "все обычные задачи"
                        : "только назначенные вам"}
                      . Новый пароль отключит прежние подключения.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={save.isPending} onClick={() => setConfirm("enable")}>
                      {state.data.account?.enabled
                        ? "Создать новый пароль"
                        : "Подготовить подключение"}
                    </Button>
                    {state.data.account?.enabled && (
                      <Button
                        variant="outline"
                        disabled={save.isPending}
                        onClick={() => setConfirm("disable")}
                      >
                        Отключить доступ
                      </Button>
                    )}
                  </div>
                </>
              )}
              {confirm && (
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-sm">
                    {confirm === "enable"
                      ? `Создать отдельный пароль с правом читать и менять ${scope === "all" ? "все обычные задачи" : "назначенные вам задачи"}? Прежний пароль, если был, перестанет работать.`
                      : "Отключить чтение и изменение задач через Apple Календарь на всех подключённых устройствах? Уже загруженные данные могут оставаться на устройствах."}
                  </p>
                  <div className="flex gap-2">
                    <Button disabled={save.isPending} onClick={() => save.mutate(confirm)}>
                      Подтвердить
                    </Button>
                    <Button
                      variant="outline"
                      disabled={save.isPending}
                      onClick={() => setConfirm(null)}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              )}
              {credentials && (
                <div className="space-y-4">
                  <p className="text-sm font-medium">Добавьте учётную запись CalDAV</p>
                  <p className="text-sm">
                    iPhone: Настройки → Приложения → Календарь → Учётные записи → Добавить → Другое
                    → CalDAV.
                    <br />
                    Mac: Календарь → Добавить учётную запись → Другая учётная запись CalDAV →
                    Вручную / Дополнительно.
                  </p>
                  {(
                    [
                      ["Адрес сервера", origin.replace("https://", "")],
                      ["Имя пользователя", credentials.username],
                      ["Отдельный пароль", credentials.password],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <label className="text-xs font-medium">{label}</label>
                      <div className="mt-1 flex gap-2">
                        <input
                          aria-label={label}
                          readOnly
                          value={value}
                          autoComplete="off"
                          className="min-w-0 flex-1 rounded-md border bg-muted/30 px-2 py-2 text-xs font-mono"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={`Скопировать: ${label}`}
                          onClick={() => void copy(value)}
                        >
                          <Copy className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    SSL включён, порт 443. Если устройство просит адрес и путь отдельно: сервер —{" "}
                    {origin.replace("https://", "")}, путь — {credentials.path}. Пароль показывается
                    только сейчас; при потере создайте новый. Пароль Apple ID не нужен.
                  </p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
