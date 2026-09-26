import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { MaintenanceTabs } from "@/components/MaintenanceTabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteMaintenanceServiceItem,
  fetchMaintenanceServiceItems,
  saveMaintenanceServiceItem,
  type MaintenanceServiceItem,
} from "@/lib/maintenance";

export const Route = createFileRoute("/_authenticated/maintenance/services")({
  head: () => ({
    meta: [
      { title: "Услуги обслуживания — RM OS" },
      {
        name: "description",
        content: "Справочник пунктов услуг: бассейн, сад, уборка и другие.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MaintenanceServicesPage,
});

function MaintenanceServicesPage() {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["maintenance-services"],
    queryFn: () => fetchMaintenanceServiceItems(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceServiceItem | null>(null);
  const [name, setName] = useState("");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["maintenance-services"] });

  const saveMutation = useMutation({
    mutationFn: () => saveMaintenanceServiceItem(editing?.id ?? null, { name }),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success(editing ? "Услуга обновлена" : "Услуга добавлена");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка сохранения"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMaintenanceServiceItem(id),
    onSuccess: () => {
      invalidate();
      toast.success("Услуга удалена");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось удалить"),
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setOpen(true);
  };
  const openEdit = (item: MaintenanceServiceItem) => {
    setEditing(item);
    setName(item.name);
    setOpen(true);
  };

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Услуги</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Справочник пунктов обслуживания. Их можно назначать объектам в карточке.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="size-4" />
          Добавить
        </Button>
      </header>

      <MaintenanceTabs active="services" />

      <div className="mt-6 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && items.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Пока нет пунктов. Добавьте, например: бассейн, сад, уборка территории.
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.name}</p>
              {!item.active && (
                <p className="text-xs text-muted-foreground">Неактивна</p>
              )}
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(item)}>
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.confirm(`Удалить «${item.name}»?`)) deleteMutation.mutate(item.id);
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Изменить услугу" : "Новая услуга"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="service-name">Название</Label>
            <Input
              id="service-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Бассейн"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
