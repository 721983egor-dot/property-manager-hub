import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CheckCheck, ChevronLeft, ListPlus, SendHorizonal, Trash2, UserPlus } from "lucide-react";

import {
  createLeadFromThread,
  deleteThread,
  fetchThreadMessages,
  fetchThreads,
  markThreadRead,
  sendOperatorMessage,
  setThreadStatus,
  updateThreadContact,
} from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { ChatText } from "@/components/ChatText";
import { SendSelectionDialog } from "@/components/SendSelectionDialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chats/")({
  head: () => ({
    meta: [{ title: "Чаты — RM OS" }, { name: "robots", content: "noindex" }],
  }),
  component: ChatsPage,
});

function ChatsPage() {
  const queryClient = useQueryClient();
  const loadThreads = useServerFn(fetchThreads);
  const loadMessages = useServerFn(fetchThreadMessages);
  const reply = useServerFn(sendOperatorMessage);
  const markRead = useServerFn(markThreadRead);
  const setStatus = useServerFn(setThreadStatus);
  const removeThread = useServerFn(deleteThread);
  const saveContact = useServerFn(updateThreadContact);
  const makeLead = useServerFn(createLeadFromThread);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectionOpen, setSelectionOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: threadsData } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: () => loadThreads({ data: undefined }),
    refetchInterval: 8000,
  });
  const threads = threadsData?.threads ?? [];
  const active = threads.find((t) => t.id === activeId) ?? null;

  const { data: messagesData } = useQuery({
    queryKey: ["chat-messages", activeId],
    queryFn: () => loadMessages({ data: { threadId: activeId! } }),
    enabled: Boolean(activeId),
    refetchInterval: 5000,
  });
  const messages = messagesData?.messages ?? [];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, activeId]);

  useEffect(() => {
    if (!active) return;
    setName(active.name);
    setPhone(active.phone);
  }, [active?.id]);

  useEffect(() => {
    if (!activeId) return;
    void markRead({ data: { threadId: activeId } }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] }),
    );
  }, [activeId, messages.length]);

  const replyMutation = useMutation({
    mutationFn: (body: string) => reply({ data: { threadId: activeId!, body } }),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["chat-messages", activeId] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось отправить"),
  });

  const contactMutation = useMutation({
    mutationFn: () => saveContact({ data: { threadId: activeId!, name, phone } }),
    onSuccess: () => {
      toast.success("Контакт сохранён");
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
  });

  const leadMutation = useMutation({
    mutationFn: () => makeLead({ data: { threadId: activeId! } }),
    onSuccess: () => toast.success("Заявка создана"),
    onError: (e: Error) => toast.error(e.message || "Не удалось создать заявку"),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "open" | "closed") =>
      setStatus({ data: { threadId: activeId!, status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-threads"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => removeThread({ data: { threadId: activeId! } }),
    onSuccess: () => {
      setActiveId(null);
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-4 sm:h-16 sm:px-6">
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">Чаты с сайта</h1>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={
            "w-full shrink-0 overflow-y-auto border-r border-border lg:block lg:w-72 " +
            (activeId ? "hidden" : "block")
          }
        >
          {threads.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Пока нет сообщений с сайта.
            </p>
          )}
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={
                "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent " +
                (t.id === activeId ? "bg-accent" : "")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {t.name.trim() || t.phone.trim() || "Посетитель сайта"}
                </span>
                {t.unread_count > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                    {t.unread_count}
                  </span>
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {t.last_direction === "out" ? "Вы: " : ""}
                {t.last_body || "—"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {format(new Date(t.last_message_at), "d MMM, HH:mm", { locale: ru })}
                {t.status === "closed" ? " · закрыт" : ""}
              </span>
            </button>
          ))}
        </aside>

        <section
          className={
            "min-w-0 flex-1 flex-col lg:flex " + (active ? "flex" : "hidden lg:flex")
          }
        >
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Выберите диалог слева
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="grid size-9 shrink-0 place-items-center rounded-md border border-border lg:hidden"
                    aria-label="Назад к списку"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium lg:hidden">
                    {active.name.trim() || active.phone.trim() || "Посетитель сайта"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Имя клиента"
                    className="h-9 w-full sm:w-40"
                  />
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Телефон"
                    className="h-9 w-full sm:w-40"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => contactMutation.mutate()}
                  >
                    Сохранить
                  </Button>
                  <div className="col-span-2 grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:items-center">
                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setSelectionOpen(true)}
                    >
                      <ListPlus className="size-4" />
                      Подборка
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => leadMutation.mutate()}
                    >
                      <UserPlus className="size-4" />
                      В заявки
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        statusMutation.mutate(active.status === "closed" ? "open" : "closed")
                      }
                    >
                      <CheckCheck className="size-4" />
                      {active.status === "closed" ? "Открыть" : "Закрыть"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => deleteMutation.mutate()}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>


              <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm " +
                      (m.direction === "in"
                        ? "bg-muted text-foreground"
                        : "ml-auto bg-primary text-primary-foreground")
                    }
                  >
                    <ChatText text={m.body} />
                    <p className="mt-0.5 text-[10px] opacity-70">
                      {format(new Date(m.created_at), "d MMM, HH:mm", { locale: ru })}
                    </p>
                  </div>
                ))}
              </div>

              <form
                className="flex items-end gap-2 border-t border-border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = text.trim();
                  if (body) replyMutation.mutate(body);
                }}
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const body = text.trim();
                      if (body) replyMutation.mutate(body);
                    }
                  }}
                  rows={2}
                  placeholder="Ответ клиенту… (Enter — отправить)"
                  className="max-h-32 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <Button type="submit" disabled={replyMutation.isPending || !text.trim()}>
                  <SendHorizonal className="size-4" />
                  Отправить
                </Button>
              </form>

              <SendSelectionDialog
                open={selectionOpen}
                onOpenChange={setSelectionOpen}
                threadId={active.id}
                onSent={() => {
                  queryClient.invalidateQueries({ queryKey: ["chat-messages", active.id] });
                  queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
                }}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
