import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SendHorizonal } from "lucide-react";

import {
  fetchVisitorMessages,
  sendVisitorMessage,
  type ChatMessage,
} from "@/lib/chat.functions";
import { chatTime, getVisitorKey } from "@/lib/site-chat";
import { ChatText } from "@/components/ChatText";

/** Переписка клиента с менеджером прямо на сайте. */
export function SiteChatPanel() {
  const load = useServerFn(fetchVisitorMessages);
  const send = useServerFn(sendVisitorMessage);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const visitorKey = getVisitorKey();
    if (!visitorKey) return;

    const tick = async () => {
      try {
        const res = await load({ data: { visitorKey } });
        if (!cancelled) setMessages(res.messages);
      } catch {
        /* тихо игнорируем: покажем при отправке */
      }
    };
    void tick();
    window.addEventListener("rm-chat-refresh", tick);
    const timer = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.removeEventListener("rm-chat-refresh", tick);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await send({
        data: {
          visitorKey: getVisitorKey(),
          body,
          page: window.location.pathname,
        },
      });
      setMessages((prev) => [...prev, res.message]);
      setText("");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Не удалось отправить. Попробуйте ещё раз.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div
        ref={listRef}
        className="flex max-h-[260px] min-h-[140px] flex-col gap-2 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <div className="rounded-xl bg-site-navy-soft px-3 py-2.5 text-sm text-site-navy">
            Здравствуйте! Напишите ваш вопрос — ответим в рабочее время. Если срочно,
            позвоните или напишите в WhatsApp.
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm " +
                (m.direction === "in"
                  ? "self-end bg-site-gold text-site-navy"
                  : "self-start bg-site-navy-soft text-site-navy")
              }
            >
              <ChatText text={m.body} />
              <p className="mt-0.5 text-[10px] opacity-60">{chatTime(m.created_at)}</p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-site-line p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(e as unknown as React.FormEvent);
            }
          }}
          rows={1}
          placeholder="Ваше сообщение…"
          className="max-h-24 min-h-10 flex-1 resize-none rounded-xl border border-site-line px-3 py-2 text-sm text-site-navy outline-none focus:border-site-gold"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          aria-label="Отправить"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-site-navy text-white transition-opacity disabled:opacity-40"
        >
          <SendHorizonal className="size-4" />
        </button>
      </form>
      {error && <p className="px-4 pb-3 text-xs text-destructive">{error}</p>}
    </div>
  );
}
