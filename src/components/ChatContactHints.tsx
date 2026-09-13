import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  extractChatContacts,
  formatTelegramHandle,
} from "@/lib/chat-contact";
import type { ChatMessage } from "@/lib/chat.functions";

type Props = {
  messages: ChatMessage[];
  onPhone?: (phone: string) => void;
  onTelegram?: (handle: string) => void;
};

/** Найденные в чате телефон и Telegram — нажатие подставляет в форму. */
export function ChatContactHints({ messages, onPhone, onTelegram }: Props) {
  const incoming = useMemo(
    () => messages.filter((m) => m.direction === "in").slice(-6),
    [messages],
  );
  const found = useMemo(() => extractChatContacts(messages), [messages]);

  const copyTranscript = async () => {
    const text = messages
      .map((m) => `${m.direction === "in" ? "Клиент" : "Мы"}: ${m.body}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Переписка скопирована");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  if (incoming.length === 0 && found.phones.length === 0 && found.telegrams.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Из чата</p>
        {messages.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={copyTranscript}>
            Скопировать переписку
          </Button>
        ) : null}
      </div>
      {incoming.length > 0 ? (
        <div className="max-h-28 overflow-y-auto rounded bg-muted/60 px-2 py-1.5 text-xs leading-5">
          {incoming.map((m) => (
            <p key={m.id} className="whitespace-pre-wrap break-words">
              {m.body}
            </p>
          ))}
        </div>
      ) : null}
      {(found.phones.length > 0 || found.telegrams.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {found.phones.map((phone) => (
            <Button
              key={phone}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onPhone?.(phone)}
            >
              {phone}
            </Button>
          ))}
          {found.telegrams.map((handle) => (
            <Button
              key={handle}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onTelegram?.(handle)}
            >
              {formatTelegramHandle(handle)}
            </Button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Нажмите номер или Telegram, чтобы подставить в карточку. Текст переписки можно выделить и скопировать.
      </p>
    </div>
  );
}
