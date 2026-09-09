import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Eye, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAccess } from "@/hooks/useAccess";
import { addDealShowing, deleteDealShowing, fetchDealShowings } from "@/lib/deals";
import { internalTitle, type Property } from "@/lib/properties";

type Props = {
  dealId: string;
  properties: Property[];
};

/** Блок показанных клиенту объектов внутри карточки сделки. */
export function DealShowings({ dealId, properties }: Props) {
  const qc = useQueryClient();
  const { profile, isAdmin } = useAccess();
  const [selected, setSelected] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shownAt, setShownAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const showings = useQuery({
    queryKey: ["deal-showings", dealId],
    queryFn: () => fetchDealShowings(dealId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["deal-showings", dealId] });
    qc.invalidateQueries({ queryKey: ["deal-history", dealId] });
  };

  const author = {
    id: profile?.id ?? null,
    name: profile?.full_name || profile?.email || "Сотрудник",
  };

  const add = useMutation({
    mutationFn: async () => {
      for (const id of selected) {
        await addDealShowing(dealId, { property_id: id, shown_at: shownAt, note }, author);
      }
    },
    onSuccess: () => {
      const count = selected.length;
      setSelected([]);
      setNote("");
      invalidate();
      toast.success(count > 1 ? `Добавлено показов: ${count}` : "Показ добавлен");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось добавить показ"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDealShowing(id),
    onSuccess: invalidate,
    onError: () => toast.error("Не удалось удалить показ"),
  });

  const title = (id: string) => {
    const p = properties.find((x) => x.id === id);
    return p ? internalTitle(p) : "Объект";
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Eye className="size-4" />
        Показы объектов
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <div className="grid gap-1.5">
          <Label>Объекты</Label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-between font-normal">
                <span className="truncate">
                  {selected.length
                    ? `Выбрано объектов: ${selected.length}`
                    : "Выберите один или несколько"}
                </span>
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
              <Command>
                <CommandInput placeholder="Поиск объекта…" />
                <CommandList>
                  <CommandEmpty>Ничего не найдено.</CommandEmpty>
                  <CommandGroup>
                    {properties.map((p) => (
                      <CommandItem key={p.id} value={internalTitle(p)} onSelect={() => toggle(p.id)}>
                        <Check
                          className={cn(
                            "mr-2 size-4",
                            selected.includes(p.id) ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {internalTitle(p)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid gap-1.5">
          <Label>Дата показа</Label>
          <Input type="date" value={shownAt} onChange={(e) => setShownAt(e.target.value)} />
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span
              key={id}
              className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
            >
              {title(id)}
              <button type="button" title="Убрать" onClick={() => toggle(id)}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={note}
          placeholder="Заметка по показу"
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          className="gap-1.5"
          disabled={!selected.length || add.isPending}
          onClick={() => add.mutate()}
        >
          <Plus className="size-4" />
          Добавить показ
        </Button>
      </div>

      <div className="grid gap-2">
        {(showings.data ?? []).map((s) => (
          <div
            key={s.id}
            className="flex items-start justify-between gap-2 rounded-md border border-border bg-background p-2.5 text-sm"
          >
            <div>
              <div className="font-medium">{title(s.property_id)}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(s.shown_at).toLocaleDateString("ru-RU")}
                {s.author_name ? ` · ${s.author_name}` : ""}
              </div>
              {s.note ? <p className="mt-1 whitespace-pre-wrap">{s.note}</p> : null}
            </div>
            {(isAdmin || s.author_id === profile?.id) && (
              <button
                type="button"
                title="Удалить показ"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                onClick={() => remove.mutate(s.id)}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {!showings.isLoading && !(showings.data ?? []).length && (
          <p className="text-sm text-muted-foreground">Показов пока нет.</p>
        )}
      </div>
    </div>
  );
}
