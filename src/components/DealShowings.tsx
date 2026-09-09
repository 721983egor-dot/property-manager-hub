import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [propertyId, setPropertyId] = useState("");
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

  const add = useMutation({
    mutationFn: () =>
      addDealShowing(
        dealId,
        { property_id: propertyId, shown_at: shownAt, note },
        { id: profile?.id ?? null, name: profile?.full_name || profile?.email || "Сотрудник" },
      ),
    onSuccess: () => {
      setPropertyId("");
      setNote("");
      invalidate();
      toast.success("Показ добавлен");
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
    return p ? `${p.ref_id} — ${internalTitle(p)}` : "Объект";
  };

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Eye className="size-4" />
        Показы объектов
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <div className="grid gap-1.5">
          <Label>Объект</Label>
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger><SelectValue placeholder="Выберите объект" /></SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.ref_id} — {internalTitle(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Дата показа</Label>
          <Input type="date" value={shownAt} onChange={(e) => setShownAt(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={note}
          placeholder="Заметка по показу"
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          className="gap-1.5"
          disabled={!propertyId || add.isPending}
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
