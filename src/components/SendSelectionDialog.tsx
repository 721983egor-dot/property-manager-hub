import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";

import { SITE_ORIGIN } from "@/lib/site";

import { sendOperatorMessage } from "@/lib/chat.functions";
import { createSelection } from "@/lib/selections";
import { fetchPublishedProperties, formatMoney, internalTitle } from "@/lib/properties";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  threadId: string;
  onSent?: () => void;
};

/** Менеджер собирает подборку и отправляет ссылку прямо в чат клиенту. */
export function SendSelectionDialog({ open, onOpenChange, threadId, onSent }: Props) {
  const send = useServerFn(sendOperatorMessage);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const { data: properties = [] } = useQuery({
    queryKey: ["published-properties"],
    queryFn: fetchPublishedProperties,
    enabled: open,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) =>
      [p.title, p.internal_name, p.complex_name, p.address]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [properties, query]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    if (picked.length === 0 || sending) return;
    setSending(true);
    try {
      const selection = await createSelection({
        propertyIds: picked,
        name: "Подборка от менеджера",
        saved: false,
        trackEvents: false,
      });
      const url = `${SITE_ORIGIN}/p/${selection.code}`;
      const list = picked
        .map((id, i) => {
          const p = properties.find((x) => x.id === id);
          return `${i + 1}. ${p?.title ?? ""} — ${formatMoney(p?.price_month)} / мес`;
        })
        .join("\n");
      await send({
        data: {
          threadId,
          body: `Подобрали для вас варианты:\n${list}\n\nСмотрите подборку: ${url}`,
        },
      });
      toast.success("Подборка отправлена клиенту");
      setPicked([]);
      setQuery("");
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Отправить подборку в чат</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию, комплексу, адресу"
            className="h-10 pl-9"
          />
        </div>
        <div className="max-h-[320px] space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </p>
          )}
          {filtered.map((p) => {
            const active = picked.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors " +
                  (active ? "border-primary bg-accent" : "border-border hover:bg-accent")
                }
              >
                <span
                  className={
                    "grid size-5 shrink-0 place-items-center rounded border " +
                    (active ? "border-primary bg-primary text-primary-foreground" : "border-input")
                  }
                >
                  {active && <Check className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {internalTitle(p)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.complex_name || p.address} · {formatMoney(p.price_month)} / мес
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Выбрано: {picked.length}</span>
          <Button onClick={submit} disabled={picked.length === 0 || sending}>
            {sending ? "Отправляем…" : "Отправить в чат"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
