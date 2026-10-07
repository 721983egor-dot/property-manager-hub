import {
  fetchFinanceObjectClasses,
  saveFinanceObjectClass,
  deleteFinanceObjectClass,
} from "@/lib/finance-objects";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  fetchCounterpartyClassifications,
  saveCounterpartyClassification,
  deleteCounterpartyClassification,
  type CounterpartyClassification,
} from "@/lib/finance-classifications";

export function FinanceClassificationsSettings({ objects = false }: { objects?: boolean }) {
  const classesKey = objects ? "finance-object-classes" : "finance-counterparty-classes";
  const assignmentKey = objects ? "finance-object-settings" : "finance-counterparties";
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CounterpartyClassification | null>(null);
  const { data: groups = [], error } = useQuery({
    queryKey: [classesKey],
    queryFn: objects ? fetchFinanceObjectClasses : fetchCounterpartyClassifications,
  });
  const mutation = useMutation({
    mutationFn: async (remove: boolean) => {
      if (remove && removing)
        await (objects ? deleteFinanceObjectClass : deleteCounterpartyClassification)(removing.id);
      else await (objects ? saveFinanceObjectClass : saveCounterpartyClassification)(editing, name);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [classesKey] });
      void qc.invalidateQueries({ queryKey: [assignmentKey] });
      setName("");
      setEditing(null);
      setRemoving(null);
      toast.success("Классификации обновлены");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить классификацию"),
  });
  return (
    <section className="fa-panel mt-6">
      <h2 className="text-xl font-semibold">
        Классификации {objects ? "объектов" : "контрагентов"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {objects
          ? "Свои группы объектов: посуточная аренда, помесячная аренда и другие."
          : "Создавайте свои группы: арендаторы, подрядчики, депозиты гостей и другие."}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-red-600">
          Не удалось загрузить классификации.
        </p>
      )}
      <form
        className="my-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(false);
        }}
      >
        <Input
          aria-label={objects ? "Название классификации объектов" : "Название классификации"}
          placeholder="Название классификации"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-sm"
        />
        <Button disabled={!name.trim() || mutation.isPending}>
          {editing ? "Сохранить" : "Добавить классификацию"}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setName("");
            }}
          >
            Отмена
          </Button>
        )}
      </form>
      {groups.map((group) => (
        <div key={group.id} className="flex items-center justify-between gap-3 border-t py-3">
          <span>{group.name}</span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => {
                setEditing(group.id);
                setName(group.name);
              }}
            >
              Переименовать
            </Button>
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => setRemoving(group)}
            >
              Удалить
            </Button>
          </div>
        </div>
      ))}
      <Dialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <DialogContent className="finance-dialog">
          <DialogHeader>
            <DialogTitle>Удалить «{removing?.name}»?</DialogTitle>
          </DialogHeader>
          <p>
            {objects
              ? "Объекты останутся без классификации. Финансовая история и карточки РМ ОС сохранятся."
              : "Контрагенты останутся без классификации. Их операции и обязательства сохранятся."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Отмена
            </Button>
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>
              Удалить классификацию
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
