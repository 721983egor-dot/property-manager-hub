import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Heart, MessageCircle, Send, Share2, X } from "lucide-react";
import { toast } from "sonner";

import { trackEvent } from "@/lib/analytics";
import { submitLead } from "@/lib/leads.functions";
import { fetchPublishedProperties, formatMoney, signedUrls } from "@/lib/properties";
import { createSelection } from "@/lib/selections";
import { cartHint, useSiteCart } from "@/lib/site-cart";
import { sendVisitorMessage } from "@/lib/chat.functions";
import { getVisitorKey } from "@/lib/site-chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

function plural(n: number, one: string, few: string, many: string) {
  const m = n % 10;
  const h = n % 100;
  if (m === 1 && h !== 11) return one;
  if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

/**
 * Нижняя панель «Моя подборка» на публичном сайте: счётчик выбранных объектов,
 * список, заявка на просмотр и ссылка «поделиться».
 */
export function SiteCartBar() {
  const { ids, count, remove, clear } = useSiteCart();
  const [listOpen, setListOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const sendChat = useServerFn(sendVisitorMessage);
  const [showHint, setShowHint] = useState(() =>
    typeof window === "undefined" ? false : count > 0 && !cartHint.seen(),
  );

  const { data: allProperties = [] } = useQuery({
    queryKey: ["published-properties"],
    queryFn: fetchPublishedProperties,
    enabled: count > 0,
    staleTime: 60_000,
  });

  const selected = useMemo(
    () =>
      ids
        .map((id) => allProperties.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p)),
    [ids, allProperties],
  );

  const photoPaths = selected
    .map((p) => p.photos[0]?.path)
    .filter((path): path is string => Boolean(path));

  const { data: photoUrls = {} } = useQuery({
    queryKey: ["photo-urls", photoPaths.slice().sort().join("|")],
    queryFn: () => signedUrls(photoPaths),
    enabled: photoPaths.length > 0,
    staleTime: 60_000,
  });

  if (count === 0) return null;

  const dismissHint = () => {
    cartHint.markSeen();
    setShowHint(false);
  };

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const selection = await createSelection({
        propertyIds: ids,
        name: "Подборка клиента",
        saved: false,
        trackEvents: false,
      });
      const url = `${window.location.origin}/p/${selection.code}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: "Моя подборка объектов", url });
          return;
        } catch {
          // пользователь закрыл системный диалог — копируем в буфер
        }
      }
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка на подборку скопирована — отправьте её близким");
    } catch {
      toast.error("Не удалось создать ссылку. Попробуйте ещё раз.");
    } finally {
      setSharing(false);
    }
  };

  const sendToChat = async () => {
    if (sendingChat) return;
    setSendingChat(true);
    try {
      const selection = await createSelection({
        propertyIds: ids,
        name: "Подборка клиента",
        saved: false,
        trackEvents: false,
      });
      const url = `${window.location.origin}/p/${selection.code}`;
      const list = selected.map((p, i) => `${i + 1}. ${p.title}`).join("\n");
      await sendChat({
        data: {
          visitorKey: getVisitorKey(),
          body: `Мне понравились эти объекты:\n${list}\n\nМоя подборка: ${url}`,
          page: window.location.pathname,
        },
      });
      setListOpen(false);
      window.dispatchEvent(new CustomEvent("rm-open-chat"));
      toast.success("Подборка отправлена менеджеру в чат");
    } catch {
      toast.error("Не удалось отправить подборку в чат. Попробуйте ещё раз.");
    } finally {
      setSendingChat(false);
    }
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 font-site sm:px-6 sm:pb-5">
        <div className="mx-auto max-w-[860px] rounded-2xl border border-site-line bg-white/95 shadow-[0_12px_40px_-12px_rgba(14,27,44,0.35)] backdrop-blur">
          {showHint && (
            <div className="flex items-start gap-2 border-b border-site-line px-4 py-2.5 text-[13px] leading-snug text-site-muted">
              <Heart className="mt-0.5 size-4 shrink-0 fill-site-gold text-site-gold" />
              <p className="min-w-0">
                Отмечайте понравившиеся квартиры — потом одной заявкой
                запишетесь на просмотр всех сразу или отправите подборку близким.
              </p>
              <button
                type="button"
                onClick={dismissHint}
                aria-label="Понятно"
                className="shrink-0 text-site-muted transition-colors hover:text-site-navy"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  dismissHint();
                  setListOpen(true);
                }}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <span className="flex -space-x-2">
                  {selected.slice(0, 3).map((p) => {
                    const path = p.photos[0]?.path;
                    const url = path ? photoUrls[path] : undefined;
                    return url ? (
                      <img
                        key={p.id}
                        src={url}
                        alt=""
                        className="size-8 rounded-full border-2 border-white object-cover"
                      />
                    ) : (
                      <span
                        key={p.id}
                        className="size-8 rounded-full border-2 border-white bg-site-navy-soft"
                      />
                    );
                  })}
                </span>
                <span className="truncate text-sm font-semibold text-site-navy underline-offset-4 hover:underline">
                  Выбрано: {count} {plural(count, "объект", "объекта", "объектов")}
                </span>
              </button>
              <button
                type="button"
                onClick={clear}
                aria-label="Очистить подборку"
                title="Очистить подборку"
                className="ml-auto grid size-9 shrink-0 place-items-center rounded-lg text-site-muted transition-colors hover:bg-site-navy-soft hover:text-site-navy sm:hidden"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 sm:ml-auto sm:flex">
              <Button
                type="button"
                onClick={() => {
                  dismissHint();
                  setLeadOpen(true);
                }}
                className="h-10 min-w-0 bg-site-navy px-3 text-sm text-site-navy-foreground hover:bg-site-navy/90 sm:flex-none sm:px-4"
              >
                <Send className="size-4 shrink-0" />
                <span className="sm:hidden">Записаться</span>
                <span className="hidden sm:inline">Записаться на просмотр</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={share}
                disabled={sharing}
                aria-label="Поделиться подборкой"
                title="Поделиться подборкой"
                className="size-10 shrink-0 border-site-line p-0 text-sm text-site-navy hover:border-site-gold/60 sm:h-10 sm:w-auto sm:px-4"
              >
                <Share2 className="size-4" />
                <span className="hidden sm:inline">
                  {sharing ? "Создаём…" : "Поделиться"}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={sendToChat}
                disabled={sendingChat}
                aria-label="Отправить подборку менеджеру в чат"
                title="Отправить подборку менеджеру в чат"
                className="h-10 w-full min-w-0 border-site-line px-2 text-sm text-site-navy hover:border-site-gold/60 sm:w-auto sm:shrink-0 sm:px-4"
              >
                <MessageCircle className="size-4 shrink-0" />
                <span className="truncate">
                  {sendingChat ? "Отправляем…" : "Подборку в чат"}
                </span>
              </Button>
              <button
                type="button"
                onClick={clear}
                aria-label="Очистить подборку"
                title="Очистить подборку"
                className="hidden size-10 shrink-0 place-items-center rounded-lg text-site-muted transition-colors hover:bg-site-navy-soft hover:text-site-navy sm:grid"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Список выбранного */}
      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-site-navy">Моя подборка</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            {selected.map((p) => {
              const path = p.photos[0]?.path;
              const url = path ? photoUrls[path] : undefined;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-site-line p-3"
                >
                  {url ? (
                    <img
                      src={url}
                      alt=""
                      className="size-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="size-14 shrink-0 rounded-lg bg-site-navy-soft" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-site-navy">
                      {p.title}
                    </p>
                    <p className="mt-0.5 text-sm text-site-muted">
                      {formatMoney(p.price_month)} / мес
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    aria-label="Убрать из подборки"
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-site-muted transition-colors hover:bg-site-navy-soft hover:text-site-navy"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => {
                setListOpen(false);
                setLeadOpen(true);
              }}
              className="h-11 bg-site-navy text-site-navy-foreground hover:bg-site-navy/90"
            >
              <Send className="size-4" />
              Записаться на просмотр
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={sendToChat}
              disabled={sendingChat}
              className="h-11 border-site-line text-site-navy hover:border-site-gold/60"
            >
              <MessageCircle className="size-4" />
              {sendingChat ? "Отправляем…" : "Отправить менеджеру в чат"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={share}
              disabled={sharing}
              className="h-11 border-site-line text-site-navy hover:border-site-gold/60"
            >
              <Share2 className="size-4" />
              {sharing ? "Создаём ссылку…" : "Поделиться подборкой"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Заявка на просмотр */}
      <ViewingRequestDialog
        open={leadOpen}
        onOpenChange={setLeadOpen}
        ids={ids}
        titles={selected.map((p) => p.title)}
      />
    </>
  );
}

function ViewingRequestDialog({
  open,
  onOpenChange,
  ids,
  titles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ids: string[];
  titles: string[];
}) {
  const send = useServerFn(submitLead);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setSent(false);
      setError("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-10 text-site-green" />
            <p className="text-lg font-semibold text-site-navy">Заявка отправлена</p>
            <p className="text-sm text-site-muted">
              Мы позвоним вам и согласуем удобное время просмотра.
            </p>
            <Button
              type="button"
              onClick={() => close(false)}
              className="mt-2 bg-site-navy text-site-navy-foreground hover:bg-site-navy/90"
            >
              Хорошо
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-site-navy">
                Заявка на просмотр: {ids.length}{" "}
                {plural(ids.length, "объект", "объекта", "объектов")}
              </DialogTitle>
            </DialogHeader>
            <ul className="max-h-32 list-disc overflow-y-auto pl-5 text-sm text-site-muted">
              {titles.map((t) => (
                <li key={t} className="truncate">
                  {t}
                </li>
              ))}
            </ul>
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setSending(true);
                try {
                  const list = titles
                    .map((t, i) => `${i + 1}. ${t} — ${window.location.origin}/rent/${ids[i]}`)
                    .join("\n");
                  const text = `Объекты на просмотр:\n${list}${message.trim() ? `\n\nКомментарий: ${message.trim()}` : ""}`;
                  await send({
                    data: { name, phone, topic: "Просмотр объектов", message: text, source: "site_cart" },
                  });
                  for (const id of ids) trackEvent(id, "lead_submit");
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
                placeholder="Номер телефона"
                type="tel"
                required
                className="h-11"
              />
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Комментарий (необязательно): удобные дни и время"
                rows={3}
                className="resize-none"
              />
              {error && <p className="text-sm text-site-red">{error}</p>}
              <Button
                type="submit"
                disabled={sending}
                className="h-11 bg-site-navy text-site-navy-foreground hover:bg-site-navy/90"
              >
                {sending ? "Отправляем…" : "Отправить заявку"}
              </Button>
              <p className="text-xs leading-relaxed text-site-muted">
                Нажимая кнопку, вы соглашаетесь с{" "}
                <a href="/privacy" className="underline hover:text-site-navy">
                  политикой конфиденциальности
                </a>
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
