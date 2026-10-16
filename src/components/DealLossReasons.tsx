import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchLossReasons, saveLossReason, type LossReason } from "@/lib/crm-results";
import type { DealPipeline } from "@/lib/deals";
export function DealLossReasons({ pipeline }: { pipeline: DealPipeline }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data = [], error } = useQuery({
    queryKey: ["deal-loss-reasons", pipeline],
    queryFn: () => fetchLossReasons(pipeline),
  });
  const save = useMutation({
    mutationFn: saveLossReason,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-loss-reasons"] });
      setName("");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Причины провала — {pipeline === "rental" ? "арендаторы" : "новые объекты"}
      </p>
      {error && <p className="text-destructive">Не удалось загрузить причины: {error.message}</p>}
      {data
        .filter((r) => !r.archived)
        .map((r) => (
          <ReasonRow
            key={r.id}
            row={r}
            pending={save.isPending}
            onSave={(name, archived = false) => save.mutate({ ...r, name, archived })}
          />
        ))}
      <div className="flex gap-2">
        <Input
          placeholder="Новая причина провала"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={160}
        />
        <Button
          disabled={!name.trim() || save.isPending}
          onClick={() =>
            save.mutate({
              pipeline,
              name,
              position: Math.max(0, ...data.map((r) => r.position)) + 1,
            })
          }
        >
          Добавить
        </Button>
      </div>
      <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
        Удалённые причины исчезнут из выбора. В старых сделках и отчётах они сохранятся.
      </p>
    </div>
  );
}
function ReasonRow({
  row,
  pending,
  onSave,
}: {
  row: LossReason;
  pending: boolean;
  onSave: (name: string, archived?: boolean) => void;
}) {
  const [name, setName] = useState(row.name);
  return (
    <div className="flex items-center gap-2">
      <Input value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
      <Button
        variant="outline"
        disabled={pending || !name.trim() || name === row.name}
        onClick={() => onSave(name)}
      >
        Сохранить
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => onSave(row.name, true)}>
        Удалить
      </Button>
    </div>
  );
}
