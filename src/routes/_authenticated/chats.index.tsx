import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  CheckCheck,
  ChevronLeft,
  Handshake,
  ListPlus,
  MailOpen,
  RefreshCw,
  SendHorizonal,
  Trash2,
  Zap,
} from "lucide-react";

import {
  chatSourceLabel,
  deleteThread,
  fetchQuickReplies,
  fetchThreadMessages,
  fetchThreads,
  markAllThreadsRead,
  markThreadRead,
  sendOperatorMessage,
  setThreadStatus,
  syncAvitoChatThreads,
  syncCianChatThreads,
  syncPlatformChats,
  updateThreadContact,
  type ChatThread,
} from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { ChatText } from "@/components/ChatText";
import { CreateDealFromChatDialog } from "@/components/CreateDealFromChatDialog";
import { SendSelectionDialog } from "@/components/SendSelectionDialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chats/")({
  head: () => ({
    meta: [{ title: "Чаты — RM OS" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <AdminOnly>
      <ChatsPage />
    </AdminOnly>
  ),
});

function ChatsPage() {
  const queryClient = useQueryClient();
  const loadThreads = useServerFn(fetchThreads);
  const loadMessages = useServerFn(fetchThreadMessages);
  const loadQuickReplies = useServerFn(fetchQuickReplies);
  const reply = useServerFn(sendOperatorMessage);
  const markRead = useServerFn(markThreadRead);
  const markAllRead = useServerFn(markAllThreadsRead);
  const setStatus = useServerFn(setThreadStatus);
  const removeThread = useServerFn(deleteThread);
  const saveContact = useServerFn(updateThreadContact);
  const syncCian = useServerFn(syncCianChatThreads);
  const syncAvito = useServerFn(syncAvitoChatThreads);
  const syncPlatforms = useServerFn(syncPlatformChats);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const { data: threadsData } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: () => loadThreads({ data: undefined }),
    refetchInterval: 3000,
  });
  const threads = threadsData?.threads ?? [];
  const active = threads.find((t) => t.id === activeId) ?? null;
  const unreadTotal = threads.reduce((sum, t) => sum + t.unread_count, 0);

  const { data: messagesData } = useQuery({
    queryKey: ["chat-messages", activeId],
    queryFn: () => loadMessages({ data: { threadId: activeId! } }),
    enabled: Boolean(activeId),
    refetchInterval: 2000,
  });
  const messages = messagesData?.messages ?? [];

  const { data: quickData } = useQuery({
    queryKey: ["chat-quick-replies"],
    queryFn: () => loadQuickReplies({ data: undefined }),
  });
  const quickReplies = quickData?.replies ?? [];

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

  /** Пока открыт раздел — тихо тянем Авито/ЦИАН, чтобы сообщения появлялись почти сразу. */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (syncingRef.current || cancelled) return;
      syncingRef.current = true;
      try {
        await syncPlatforms({ data: undefined });
        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
          if (activeId) queryClient.invalidateQueries({ queryKey: ["chat-messages", activeId] });
        }
      } catch {
        // Тихий фон: ошибки не мешают работе оператора.
      } finally {
        syncingRef.current = false;
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), 15_000);
    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeId, queryClient, syncPlatforms]);

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

  const syncMutation = useMutation({
    mutationFn: () => syncCian({ data: undefined }),
    onSuccess: (result) => {
      toast.success(`ЦИАН обновлён: ${result.chats} чатов`);
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      if (activeId) queryClient.invalidateQueries({ queryKey: ["chat-messages", activeId] });
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось обновить ЦИАН"),
  });

  const syncAvitoMutation = useMutation({
    mutationFn: () => syncAvito({ data: undefined }),
    onSuccess: (result) => {
      toast.success(`Авито обновлён: ${result.chats} чатов`);
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      if (activeId) queryClient.invalidateQueries({ queryKey: ["chat-messages", activeId] });
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось обновить Авито"),
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllRead({ data: undefined }),
    onSuccess: () => {
      toast.success("Все сообщения прочитаны");
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось отметить прочитанными"),
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4 sm:h-16 sm:px-6">
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">Чаты</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending || unreadTotal === 0}
          >
            <MailOpen className="size-4" />
            Прочитать все
          </Button>
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw className={`size-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Обновить ЦИАН
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncAvitoMutation.mutate()}
            disabled={syncAvitoMutation.isPending}
          >
            <RefreshCw className={`size-4 ${syncAvitoMutation.isPending ? "animate-spin" : ""}`} />
            Обновить Авито
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={
            "w-full shrink-0 overflow-y-auto border-r border-border lg:block lg:w-72 " +
            (activeId ? "hidden" : "block")
          }
        >
          {threads.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Пока нет сообщений.</p>
          )}
          {threads.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              active={t.id === activeId}
              onSelect={() => setActiveId(t.id)}
            />
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
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{chatSourceLabel(active.source)}</div>
                    {active.property_title && active.property_id ? (
                      <Link
                        to="/objects/$id/"
                        params={{ id: active.property_id }}
                        className="truncate text-xs text-primary hover:underline"
                      >
                        {active.property_title}
                      </Link>
                    ) : (
                      <div className="h-4 text-xs text-muted-foreground" />
                    )}
                  </div>
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
                      onClick={() => setDealOpen(true)}
                    >
                      <Handshake className="size-4" />
                      Создать сделку
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

              <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-5">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%] " +
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" className="shrink-0 px-3" title="Быстрые ответы">
                      <Zap className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
                    {quickReplies.length === 0 ? (
                      <DropdownMenuItem disabled>Нет шаблонов — добавьте в Настройках</DropdownMenuItem>
                    ) : (
                      quickReplies.map((replyItem) => (
                        <DropdownMenuItem
                          key={replyItem.id}
                          onClick={() =>
                            setText((prev) => (prev.trim() ? `${prev.trim()}\n${replyItem.body}` : replyItem.body))
                          }
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{replyItem.title}</div>
                            <div className="truncate text-xs text-muted-foreground">{replyItem.body}</div>
                          </div>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                <Button
                  type="submit"
                  className="shrink-0 px-3"
                  disabled={replyMutation.isPending || !text.trim()}
                >
                  <SendHorizonal className="size-4" />
                  <span className="hidden sm:inline">Отправить</span>
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
              <CreateDealFromChatDialog
                open={dealOpen}
                onOpenChange={setDealOpen}
                thread={active}
                onCreated={() => {
                  queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
                  queryClient.invalidateQueries({ queryKey: ["deals"] });
                }}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ThreadCard({
  thread,
  active,
  onSelect,
}: {
  thread: ChatThread;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent " +
        (active ? "bg-accent" : "")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{chatSourceLabel(thread.source)}</span>
        {thread.unread_count > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
            {thread.unread_count}
          </span>
        )}
      </div>
      {thread.property_title ? (
        <span className="truncate text-xs text-foreground/80">{thread.property_title}</span>
      ) : null}
      <span className="truncate text-xs text-muted-foreground">
        {thread.last_direction === "out" ? "Вы: " : ""}
        {thread.last_body || "—"}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {format(new Date(thread.last_message_at), "d MMM, HH:mm", { locale: ru })}
        {thread.status === "closed" ? " · закрыт" : ""}
      </span>
    </button>
  );
}
