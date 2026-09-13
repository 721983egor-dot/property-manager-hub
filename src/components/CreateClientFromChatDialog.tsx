import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ChatContactHints } from "@/components/ChatContactHints";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  chatSourceLabel,
  createClientFromThread,
  type ChatMessage,
  type ChatThread,
} from "@/lib/chat.functions";
import { threadClientName, formatTelegramHandle } from "@/lib/chat-contact";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: ChatThread;
  messages: ChatMessage[];
  onCreated?: (clientId: string) => void;
};

/** Создание клиента из чата: комментарий виден ассистенту при поиске. */
export function CreateClientFromChatDialog({
  open,
  onOpenChange,
  thread,
  messages,
  onCreated,
}: Props) {
  const createClient = useServerFn(createClientFromThread);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    const platform = chatSourceLabel(thread.source);
    const clientName = threadClientName(thread.name);
    setName(clientName === "Клиент" ? "" : thread.name.trim());
    setPhone(thread.phone.trim());
    setComment(
      [`Чат ${platform}`, thread.property_title ? `Объект: ${thread.property_title}` : ""]
        .filter(Boolean)
        .join(". "),
    );
  }, [open, thread.id, thread.name, thread.phone, thread.property_title, thread.source]);

  const mutation = useMutation({
    mutationFn: () =>
      createClient({
        data: {
          threadId: thread.id,
          name: name.trim(),
          phone: phone.trim(),
          comment: comment.trim(),
        },
      }),
    onSuccess: (result) => {
      toast.success(result.created ? "Клиент создан" : "Клиент уже был в базе — данные обновлены");
      onOpenChange(false);
      onCreated?.(result.clientId);
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось создать клиента"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Создать клиента</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ChatContactHints
            messages={messages}
            onPhone={setPhone}
            onTelegram={(handle) => {
              const tag = `Telegram: ${formatTelegramHandle(handle)}`;
              setComment((prev) => (prev.includes(tag) ? prev : [prev, tag].filter(Boolean).join(". ")));
            }}
          />
          <div className="space-y-1.5">
            <Label htmlFor="chat-client-name">Имя</Label>
            <Input
              id="chat-client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как зовут клиента"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-client-phone">Телефон</Label>
            <Input
              id="chat-client-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-client-comment">Комментарий</Label>
            <Textarea
              id="chat-client-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Пожелания, Telegram, откуда пишет — ассистент ищет по этому полю"
            />
            <p className="text-xs text-muted-foreground">
              Ассистент видит комментарий и может найти клиента по этим словам.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button disabled={mutation.isPending || !name.trim()} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Сохраняем…" : "Создать клиента"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
