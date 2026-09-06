import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2 } from "lucide-react";

import { submitLead } from "@/lib/leads.functions";
import { LEAD_TOPICS } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  defaultTopic?: string;
  source?: string;
  buttonLabel?: string;
  withMessage?: boolean;
};

/** Форма заявки на сайте: имя, телефон, тема, комментарий. */
export function SiteLeadForm({
  defaultTopic = "",
  source = "site",
  buttonLabel = "Отправить заявку",
  withMessage = true,
}: Props) {
  const send = useServerFn(submitLead);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState(defaultTopic);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-site-line bg-white p-8 text-center">
        <CheckCircle2 className="size-10 text-site-green" />
        <p className="text-lg font-semibold text-site-navy">Заявка отправлена</p>
        <p className="text-sm text-site-muted">
          Мы свяжемся с вами в ближайшее рабочее время.
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setSending(true);
        try {
          await send({ data: { name, phone, topic, message, source } });
          setSent(true);
        } catch (err) {
          setError(
            err instanceof Error && err.message
              ? err.message
              : "Не удалось отправить. Попробуйте ещё раз или позвоните нам.",
          );
        } finally {
          setSending(false);
        }
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ваше имя"
        required
        className="h-11"
      />
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Телефон"
        type="tel"
        required
        className="h-11"
      />
      <Select value={topic} onValueChange={setTopic}>
        <SelectTrigger className="h-11 w-full">
          <SelectValue placeholder="Тема обращения" />
        </SelectTrigger>
        <SelectContent>
          {LEAD_TOPICS.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {withMessage && (
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Комментарий (необязательно)"
          rows={3}
        />
      )}
      {error && <p className="text-sm text-site-red">{error}</p>}
      <Button
        type="submit"
        disabled={sending}
        className="h-11 bg-site-gold text-site-navy hover:bg-site-gold/90"
      >
        {sending ? "Отправляем…" : buttonLabel}
      </Button>
      <p className="text-xs leading-relaxed text-site-muted">
        Нажимая кнопку, вы соглашаетесь с{" "}
        <a href="/privacy" className="underline hover:text-site-navy">
          политикой конфиденциальности
        </a>
        .
      </p>
    </form>
  );
}
