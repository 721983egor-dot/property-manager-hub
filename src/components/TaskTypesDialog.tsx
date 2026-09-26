import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TASK_TYPE_COLORS,
  deleteTaskType,
  reorderTaskTypes,
  saveTaskType,
  type TaskType,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: TaskType[];
};

/** Настройка типов задач: название, цвет и порядок (drag-and-drop). */
export function TaskTypesDialog({ open, onOpenChange, types }: Props) {
  const queryClient = useQueryClient();
  const [ordered, setOrdered] = useState<TaskType[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(TASK_TYPE_COLORS[0]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setOrdered(types);
    setDrafts(Object.fromEntries(types.map((type) => [type.id, type.name])));
    setDragIndex(null);
    setOverIndex(null);
  }, [open, types]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["task-types"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string | null; patch: { name: string; color: string; position: number } }) =>
      saveTaskType(id, patch),
    onSuccess: () => {
      setName("");
      setColor(TASK_TYPE_COLORS[0]);
      refresh();
      toast.success("Тип сохранён");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось сохранить"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTaskType,
    onSuccess: () => {
      refresh();
      toast.success("Тип удалён");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось удалить"),
  });

  const reorderMutation = useMutation({
    mutationFn: reorderTaskTypes,
    onSuccess: refresh,
    onError: (error) => {
      setOrdered(types);
      toast.error(error instanceof Error ? error.message : "Не удалось изменить порядок");
    },
  });

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= ordered.length || to >= ordered.length) return;
    const next = [...ordered];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    setOrdered(next);
    reorderMutation.mutate(next.map((type) => type.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Типы задач</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">Перетащите строку мышью, чтобы изменить порядок в списке.</p>

        <div className="space-y-3">
          {ordered.map((type, index) => (
            <div
              key={type.id}
              draggable
              onDragStart={(event) => {
                if ((event.target as HTMLElement).closest("input,button")) {
                  event.preventDefault();
                  return;
                }
                setDragIndex(index);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragIndex === null) return;
                setOverIndex(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex === null) return;
                move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border p-2",
                dragIndex === index ? "opacity-50" : "",
                overIndex === index && dragIndex !== null && dragIndex !== index ? "ring-2 ring-primary" : "",
              )}
            >
              <span
                className="grid size-8 shrink-0 cursor-grab place-items-center text-muted-foreground active:cursor-grabbing"
                title="Перетащить"
                aria-label="Перетащить тип"
              >
                <GripVertical className="size-4" />
              </span>
              <span className="size-4 shrink-0 rounded-full" style={{ background: type.color }} />
              <Input
                value={drafts[type.id] ?? type.name}
                onChange={(event) => setDrafts((current) => ({ ...current, [type.id]: event.target.value }))}
                onBlur={() => {
                  const next = (drafts[type.id] ?? type.name).trim();
                  if (!next || next === type.name) return;
                  saveMutation.mutate({
                    id: type.id,
                    patch: { name: next, color: type.color, position: index },
                  });
                }}
                className="h-9"
              />
              <div className="flex gap-1">
                {TASK_TYPE_COLORS.slice(0, 6).map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={cn(
                      "size-4 rounded-full border",
                      type.color === swatch ? "ring-2 ring-offset-1 ring-foreground/40" : "border-transparent",
                    )}
                    style={{ background: swatch }}
                    onClick={() =>
                      saveMutation.mutate({
                        id: type.id,
                        patch: { name: type.name, color: swatch, position: index },
                      })
                    }
                    aria-label={`Цвет ${swatch}`}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => deleteMutation.mutate(type.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Типов пока нет — добавьте первый.</p>
          ) : null}
        </div>

        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <Label>Новый тип</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например: Выезд на объект"
              className="min-w-[12rem] flex-1"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {TASK_TYPE_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={cn(
                    "size-5 rounded-full border",
                    color === swatch ? "ring-2 ring-offset-1 ring-foreground/40" : "border-transparent",
                  )}
                  style={{ background: swatch }}
                  onClick={() => setColor(swatch)}
                  aria-label={`Цвет ${swatch}`}
                />
              ))}
            </div>
            <Button
              type="button"
              disabled={!name.trim() || saveMutation.isPending}
              onClick={() =>
                saveMutation.mutate({
                  id: null,
                  patch: { name: name.trim(), color, position: ordered.length },
                })
              }
            >
              <Plus className="mr-1.5 size-4" />
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
