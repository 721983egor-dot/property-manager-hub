import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FIELD_TYPES,
  deleteDealField,
  deleteDealStage,
  saveDealField,
  saveDealStage,
  slugifyFieldKey,
  type DealField,
  type DealFieldType,
  type DealStage,
  type DealStageKind,
} from "@/lib/deals";

const STAGE_KINDS: { value: DealStageKind; label: string }[] = [
  { value: "open", label: "В работе" },
  { value: "won", label: "Успешно" },
  { value: "lost", label: "Отказ" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: DealStage[];
  fields: DealField[];
};

/** Настройка канбана: стадии и дополнительные поля сделок (только администратор). */
export function DealSettingsDialog({ open, onOpenChange, stages, fields }: Props) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["deal-stages"] });
    queryClient.invalidateQueries({ queryKey: ["deal-fields"] });
    queryClient.invalidateQueries({ queryKey: ["deals"] });
  };

  const stageMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string | null; patch: Parameters<typeof saveDealStage>[1] }) =>
      saveDealStage(id, patch),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });
  const stageDelete = useMutation({
    mutationFn: deleteDealStage,
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось удалить"),
  });
  const fieldMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string | null; patch: Parameters<typeof saveDealField>[1] }) =>
      saveDealField(id, patch),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });
  const fieldDelete = useMutation({
    mutationFn: deleteDealField,
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось удалить"),
  });

  const [newStage, setNewStage] = useState("");
  const [newField, setNewField] = useState("");
  const [newFieldType, setNewFieldType] = useState<DealFieldType>("text");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройка сделок</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="stages">
          <TabsList>
            <TabsTrigger value="stages">Стадии</TabsTrigger>
            <TabsTrigger value="fields">Поля</TabsTrigger>
          </TabsList>

          <TabsContent value="stages" className="mt-4 grid gap-3">
            {stages.map((s, index) => (
              <div key={s.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_130px_140px_auto]">
                <Input
                  defaultValue={s.name}
                  onBlur={(e) =>
                    e.target.value !== s.name &&
                    stageMutation.mutate({
                      id: s.id,
                      patch: { name: e.target.value, color: s.color, kind: s.kind, position: s.position },
                    })
                  }
                />
                <Input
                  type="color"
                  className="h-10 p-1"
                  defaultValue={s.color}
                  onBlur={(e) =>
                    e.target.value !== s.color &&
                    stageMutation.mutate({
                      id: s.id,
                      patch: { name: s.name, color: e.target.value, kind: s.kind, position: s.position },
                    })
                  }
                />
                <Select
                  value={s.kind}
                  onValueChange={(v) =>
                    stageMutation.mutate({
                      id: s.id,
                      patch: { name: s.name, color: s.color, kind: v as DealStageKind, position: s.position },
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGE_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    onClick={() => {
                      const prev = stages[index - 1]!;
                      stageMutation.mutate({ id: s.id, patch: { name: s.name, color: s.color, kind: s.kind, position: prev.position } });
                      stageMutation.mutate({ id: prev.id, patch: { name: prev.name, color: prev.color, kind: prev.kind, position: s.position } });
                    }}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === stages.length - 1}
                    onClick={() => {
                      const next = stages[index + 1]!;
                      stageMutation.mutate({ id: s.id, patch: { name: s.name, color: s.color, kind: s.kind, position: next.position } });
                      stageMutation.mutate({ id: next.id, patch: { name: next.name, color: next.color, kind: next.kind, position: s.position } });
                    }}
                  >
                    ↓
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => stageDelete.mutate(s.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <Input
                placeholder="Новая стадия"
                value={newStage}
                onChange={(e) => setNewStage(e.target.value)}
              />
              <Button
                onClick={() => {
                  if (!newStage.trim()) return;
                  stageMutation.mutate({
                    id: null,
                    patch: {
                      name: newStage.trim(),
                      color: "#64748b",
                      kind: "open",
                      position: (stages.at(-1)?.position ?? 0) + 1,
                    },
                  });
                  setNewStage("");
                }}
              >
                <Plus className="mr-1 size-4" /> Добавить
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="fields" className="mt-4 grid gap-3">
            {fields.map((f) => (
              <div key={f.id} className="grid gap-2 rounded-md border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                  <Input
                    defaultValue={f.label}
                    onBlur={(e) =>
                      e.target.value !== f.label &&
                      fieldMutation.mutate({ id: f.id, patch: { ...f, label: e.target.value } })
                    }
                  />
                  <Select
                    value={f.field_type}
                    onValueChange={(v) =>
                      fieldMutation.mutate({ id: f.id, patch: { ...f, field_type: v as DealFieldType } })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => fieldDelete.mutate(f.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                {f.field_type === "select" && (
                  <Input
                    placeholder="Варианты через запятую"
                    defaultValue={f.options.join(", ")}
                    onBlur={(e) =>
                      fieldMutation.mutate({
                        id: f.id,
                        patch: {
                          ...f,
                          options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                        },
                      })
                    }
                  />
                )}
                <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={f.show_in_card}
                      onCheckedChange={(v) => fieldMutation.mutate({ id: f.id, patch: { ...f, show_in_card: v } })}
                    />
                    Показывать на канбане
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={f.archived}
                      onCheckedChange={(v) => fieldMutation.mutate({ id: f.id, patch: { ...f, archived: v } })}
                    />
                    Скрыто
                  </label>
                  <span className="ml-auto text-xs">код: {f.key}</span>
                </div>
              </div>
            ))}

            <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
              <div className="grid gap-1.5">
                <Label className="sr-only">Название поля</Label>
                <Input
                  placeholder="Новое поле"
                  value={newField}
                  onChange={(e) => setNewField(e.target.value)}
                />
              </div>
              <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as DealFieldType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => {
                  if (!newField.trim()) return;
                  fieldMutation.mutate({
                    id: null,
                    patch: {
                      key: slugifyFieldKey(newField),
                      label: newField.trim(),
                      field_type: newFieldType,
                      options: [],
                      position: (fields.at(-1)?.position ?? 0) + 1,
                      show_in_card: true,
                      archived: false,
                    },
                  });
                  setNewField("");
                }}
              >
                <Plus className="mr-1 size-4" /> Добавить
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
