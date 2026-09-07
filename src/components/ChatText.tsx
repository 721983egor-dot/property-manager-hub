const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Текст сообщения со ссылками, по которым можно кликнуть. */
export function ChatText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <p className={"whitespace-pre-wrap break-words " + (className ?? "")}>
      {parts.map((part, i) =>
        URL_RE.test(part) && part.startsWith("http") ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}
