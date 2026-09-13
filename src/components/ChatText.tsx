import { splitChatText } from "@/lib/chat-contact";

/** Текст сообщения: ссылки кликабельны, телефон и Telegram копируются по нажатию. */
export function ChatText({
  text,
  className,
  onCopy,
}: {
  text: string;
  className?: string;
  onCopy?: (value: string) => void;
}) {
  const copy = (value: string) => {
    void navigator.clipboard.writeText(value).catch(() => undefined);
    onCopy?.(value);
  };

  return (
    <p className={"whitespace-pre-wrap break-words " + (className ?? "")}>
      {splitChatText(text).map((part, i) => {
        if (part.type === "url") {
          return (
            <a
              key={i}
              href={part.value}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline underline-offset-2"
            >
              {part.value}
            </a>
          );
        }
        if (part.type === "phone" || part.type === "telegram") {
          return (
            <button
              key={i}
              type="button"
              title="Скопировать"
              className="font-semibold underline decoration-dotted underline-offset-2"
              onClick={() => copy(part.value)}
            >
              {part.value}
            </button>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </p>
  );
}
