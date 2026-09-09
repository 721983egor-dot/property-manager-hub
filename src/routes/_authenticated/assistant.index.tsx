import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Check, SendHorizonal, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { askAssistant, runAssistantAction } from "@/lib/assistant.functions";
import type { AssistantAction, AssistantChatMessage } from "@/lib/assistant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/assistant/")({
  head: () => ({
    meta: [{ title: "Ассистент — RM OS" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <AdminOnly>
      <AssistantPage />
    </AdminOnly>
  ),
});

type Bubble = AssistantChatMessage & { actions?: AssistantAction[] };

const SUGGESTIONS = [
  "Сколько просмотров и звонков за 30 дней по площадкам?",
  "Собери подборку из свободных двушек до 80 000 ₽",
  "Что мешает опубликовать объекты на ЦИАН?",
  "Покажи ближайшие заезды и выезды",
  "Что менялось в системе за неделю?",
];

function AssistantPage() {
  const ask = useServerFn(askAssistant);
  const runAction = useServerFn(runAssistantAction);

  const [messages, setMessages] = useState<Bubble[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(value: string) {
    const content = value.trim();
    if (!content || busy) return;
    const history: Bubble[] = [...messages, { role: "user", content }];
    setMessages(history);
    setText("");
    setBusy(true);
    try {
      const reply = await ask({
        data: { messages: history.map((m) => ({ role: m.role, content: m.content })) },
      });
      if (reply.error) {
        toast.error(reply.error);
        setMessages([...history, { role: "assistant", content: `Ошибка: ${reply.error}` }]);
      } else {
        setMessages([
          ...history,
          { role: "assistant", content: reply.text || "…", actions: reply.actions },
        ]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(action: AssistantAction) {
    setDone((d) => ({ ...d, [action.id]: "…" }));
    const res = await runAction({ data: { action } });
    setDone((d) => ({ ...d, [action.id]: res.ok ? res.message : `Ошибка: ${res.message}` }));
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-6">
        <Sparkles className="ai-glow size-5" />
        <h1 className="text-[15px] font-semibold tracking-tight">Ассистент</h1>
        <span className="text-sm text-muted-foreground">
          знает все объекты, сделки, клиентов, календарь и журнал системы
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm font-medium">С чего начнём?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                    : "w-full rounded-lg border border-border bg-card px-4 py-3 text-sm"
                }
              >
                {m.role === "user" ? (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                )}

                {(m.actions ?? []).map((a) => (
                  <div
                    key={a.id}
                    className="mt-3 rounded-md border border-border bg-background p-3"
                  >
                    <p className="text-sm font-medium">{a.summary}</p>
                    {done[a.id] ? (
                      <p className="mt-1 text-xs text-muted-foreground">{done[a.id]}</p>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => void confirm(a)}>
                          <Check className="size-4" />
                          Подтвердить
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDone((d) => ({ ...d, [a.id]: "Отменено" }))}
                        >
                          <X className="size-4" />
                          Отмена
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {busy && <p className="text-sm text-muted-foreground">Думаю…</p>}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="shrink-0 border-t border-border px-6 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Спросите про объекты, статистику или попросите что-то изменить"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !text.trim()}>
            <SendHorizonal className="size-4" />
            Отправить
          </Button>
        </div>
      </form>
    </div>
  );
}
