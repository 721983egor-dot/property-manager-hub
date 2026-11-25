import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  advanceEmployeeTestChat,
  canUsePrivateEmployeeChat,
  loadEmployeeTestChat,
  saveEmployeeTestRule,
  startEmployeeTestChat,
} from "@/lib/ai-manager/private-employee-chat.functions";
import type {
  PrivateEmployeeDialog,
  PrivateEmployeeId,
} from "@/lib/ai-manager/private-employee-chat";

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Moscow",
});

export function PrivateEmployeeTestChat({ employeeId }: { employeeId: PrivateEmployeeId }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const canUse = useServerFn(canUsePrivateEmployeeChat);
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setSessionId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);
  const access = useQuery({
    queryKey: ["private-employee-test-access", sessionId],
    queryFn: () => canUse(),
    enabled: Boolean(sessionId),
    gcTime: 0,
  });
  if (!sessionId || access.data !== true || access.isError) return null;
  return (
    <section className="rounded-xl border bg-muted/20 p-3">
      <Button
        size="sm"
        type="button"
        variant="outline"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <FlaskConical className="size-4" />{" "}
        {open ? "Свернуть личный тест" : "Личный тестовый диалог"}
      </Button>
      {open && (
        <PrivateTestPanel
          key={sessionId + employeeId}
          sessionId={sessionId}
          employeeId={employeeId}
        />
      )}
    </section>
  );
}

function PrivateTestPanel({
  sessionId,
  employeeId,
}: {
  sessionId: string;
  employeeId: PrivateEmployeeId;
}) {
  const [selected, setSelected] = useState<string>();
  const [role, setRole] = useState<"client" | "operator">("client");
  const [text, setText] = useState("");
  const cache = useQueryClient();
  const load = useServerFn(loadEmployeeTestChat);
  const start = useServerFn(startEmployeeTestChat);
  const advance = useServerFn(advanceEmployeeTestChat);
  const save = useServerFn(saveEmployeeTestRule);
  const baseKey = ["private-employee-test", sessionId, employeeId];
  const current = useQuery({
    queryKey: [...baseKey, selected],
    queryFn: () => load({ data: selected ? { employeeId, dialogId: selected } : { employeeId } }),
    gcTime: 0,
  });
  const item = current.data?.dialog;
  const retain = (dialog: PrivateEmployeeDialog) => {
    setSelected(dialog.id);
    cache.setQueryData([...baseKey, dialog.id], {
      dialog,
      history: [
        {
          id: dialog.id,
          version: dialog.version,
          updated_at: new Date().toISOString(),
          hasPendingRule: Boolean(dialog.pending_rule),
        },
        ...(current.data?.history ?? []).filter(({ id }) => id !== dialog.id),
      ],
    });
    void cache.invalidateQueries({ queryKey: baseKey });
  };
  const create = useMutation({
    mutationFn: () => start({ data: { employeeId } }),
    onSuccess: (dialog) => {
      setRole("client");
      setText("");
      retain(dialog);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const send = useMutation({
    mutationFn: async () => {
      const dialog = item ?? (await start({ data: { employeeId } }));
      return advance({
        data: { employeeId, dialogId: dialog.id, version: dialog.version, role, text },
      });
    },
    onSuccess: (dialog) => {
      setText("");
      retain(dialog);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      void cache.invalidateQueries({ queryKey: baseKey });
    },
  });
  const approve = useMutation({
    mutationFn: (rule: string) => {
      if (!item) throw Error("Откройте диалог с правилом");
      return save({ data: { employeeId, dialogId: item.id, version: item.version, rule } });
    },
    onSuccess: (message) => {
      toast.success(message);
      void cache.invalidateQueries({ queryKey: baseKey });
      void cache.invalidateQueries({ queryKey: ["ai-employee-handbooks"] });
      void cache.invalidateQueries({ queryKey: ["marina-operator-rules"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = create.isPending || send.isPending || approve.isPending;
  const name = employeeId === "marina" ? "Марина" : "Александр";
  const draft = [...(item?.messages ?? [])].reverse().find(({ role }) => role === "draft");
  const labels = {
    client: "Вы · клиент",
    operator: "Вы · правка",
    draft: name,
    memory_request: "Вы · запрос на запоминание",
  };
  if (current.isError)
    return (
      <p role="alert" className="mt-3 text-sm">
        Личный диалог недоступен.
      </p>
    );
  return (
    <div className="mt-3 space-y-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LockKeyhole className="size-4" /> Только для вас. Используйте вымышленные данные.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {(current.data?.history.length ?? 0) > 0 && (
          <select
            aria-label="История личных тестов"
            value={item?.id ?? ""}
            disabled={busy}
            className="max-w-full rounded-md border bg-background p-2 text-sm"
            onChange={(event) => {
              setSelected(event.target.value);
              setText("");
            }}
          >
            {current.data?.history.map((row) => (
              <option key={row.id} value={row.id}>
                Диалог · {dateTime.format(new Date(row.updated_at))}
              </option>
            ))}
          </select>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy || current.isPending}
          onClick={() => create.mutate()}
        >
          Новый диалог
        </Button>
      </div>
      {draft && (
        <div className="rounded-lg border bg-background p-3" aria-live="polite">
          <h4 className="text-sm font-semibold">Текущий черновик ответа</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm">{draft.text}</p>
        </div>
      )}
      {(item?.messages.length ?? 0) > 0 && (
        <div className="max-h-64 space-y-2 overflow-y-auto" aria-label="История диалога">
          {item?.messages.map((turn, index) => (
            <div
              key={index}
              className={
                "rounded-md p-2.5 text-sm " +
                (turn.role === "draft" ? "bg-background" : "bg-primary/10")
              }
            >
              <p className="mb-1 text-xs font-medium">{labels[turn.role]}</p>
              <p className="whitespace-pre-wrap">{turn.text}</p>
            </div>
          ))}
        </div>
      )}
      {item?.pending_rule && (
        <RuleProposal
          key={item.version}
          initial={item.pending_rule}
          disabled={busy}
          onApprove={(rule) => approve.mutate(rule)}
        />
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() && !busy) send.mutate();
        }}
        className="space-y-2"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={role === "client" ? "default" : "outline"}
            onClick={() => setRole("client")}
          >
            Я клиент
          </Button>
          <Button
            type="button"
            size="sm"
            variant={role === "operator" ? "default" : "outline"}
            onClick={() => setRole("operator")}
          >
            Внутренняя правка
          </Button>
        </div>
        <Textarea
          aria-label="Сообщение личного теста"
          placeholder={
            role === "operator" ? "Что исправить или запомнить?" : "Напишите как клиент…"
          }
          value={text}
          rows={3}
          maxLength={2000}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
        />
        <Button size="sm" type="submit" disabled={busy || current.isPending || !text.trim()}>
          {send.isPending ? "Готовлю черновик…" : "Проверить ответ"}
        </Button>
      </form>
    </div>
  );
}

function RuleProposal({
  initial,
  disabled,
  onApprove,
}: {
  initial: string;
  disabled: boolean;
  onApprove: (rule: string) => void;
}) {
  const [rule, setRule] = useState(initial);
  return (
    <section className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
      <h4 className="text-sm font-semibold">Предложение для инструкций</h4>
      <Textarea
        aria-label="Формулировка постоянного правила"
        value={rule}
        rows={2}
        maxLength={400}
        onChange={(event) => setRule(event.target.value)}
      />
      <Button
        size="sm"
        disabled={disabled || rule.trim().length < 3}
        onClick={() => onApprove(rule)}
      >
        Подтвердить и сохранить правило
      </Button>
    </section>
  );
}
