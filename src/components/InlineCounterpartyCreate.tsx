import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OwnerPropertyPicker } from "./OwnerPropertyPicker";
import { fetchCounterpartyClassifications } from "@/lib/finance-classifications";
import { fetchFinanceObjectAssignments } from "@/lib/finance-objects";
import { fetchFinancePropertyOptions } from "@/lib/finance";
import {
  asCounterpartyKind,
  saveCounterparty,
  type FinanceCounterparty,
} from "@/lib/finance-counterparties";

/** Create independently of the payment: cancelling the editor never submits the operation. */
export function InlineCounterpartyCreate({
  initialName,
  onCreated,
  onEditingChange,
}: {
  initialName: string;
  onEditingChange: (editing: boolean) => void;
  onCreated: (party: { id: string; name: string }) => void;
}) {
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onEditingChange(false);
    };
  }, [onEditingChange]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    onEditingChange(open);
  }, [open, onEditingChange]);
  const [name, setName] = useState("");
  const [classification, setClassification] = useState("");
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const classes = useQuery({
    queryKey: ["finance-counterparty-classes"],
    queryFn: fetchCounterpartyClassifications,
    enabled: open,
  });
  const selectedClass = classes.data?.find((c) => c.id === classification);
  const owner = selectedClass?.legacy_kind === "owner";
  const assignments = useQuery({
    queryKey: ["finance-object-settings"],
    queryFn: fetchFinanceObjectAssignments,
    enabled: open && owner,
  });
  const properties = useQuery({
    queryKey: ["finance-property-options"],
    queryFn: fetchFinancePropertyOptions,
    enabled: open && owner,
  });
  const create = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      const id = await saveCounterparty(null, {
        name: trimmed,
        kind: "other",
        classification_id: classification || null,
        owner_property_ids: owner ? propertyIds : [],
        expected_owner_property_ids: [],
      });
      return { id, name: trimmed };
    },
    onSuccess: (party) => {
      // Add the option before selecting it; the background refresh loads canonical metadata.
      const now = new Date().toISOString();
      queryClient.setQueryData<FinanceCounterparty[]>(["finance-counterparties"], (old) =>
        [
          ...(old ?? []).filter((c) => c.id !== party.id),
          {
            ...party,
            kind: asCounterpartyKind(selectedClass?.legacy_kind),
            classification_id: classification || null,
            requisites: "",
            client_id: null,
            comment: "",
            created_at: now,
            updated_at: now,
          },
        ].sort((a, b) => a.name.localeCompare(b.name, "ru")),
      );
      if (mounted.current) onCreated(party);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["finance-counterparties"] });
      if (owner) void queryClient.invalidateQueries({ queryKey: ["finance-object-settings"] });
      toast.success(
        mounted.current ? "Контрагент создан и выбран в операции" : "Контрагент создан",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось создать контрагента"),
  });
  if (!open)
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 py-1 text-xs"
        onClick={() => {
          setName(initialName);
          setClassification("");
          setPropertyIds([]);
          create.reset();
          setOpen(true);
        }}
      >
        + Новый контрагент
      </Button>
    );
  return (
    <section
      className="mt-2 space-y-3 rounded-md border bg-muted/30 p-3"
      aria-label="Создание контрагента"
    >
      <p className="text-sm font-medium">Новый контрагент</p>
      <label className="block space-y-1 text-xs">
        Имя / название
        <Input
          autoFocus
          aria-label="Имя нового контрагента"
          maxLength={250}
          value={name}
          disabled={create.isPending}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-xs">
        Классификация
        <select
          aria-label="Классификация нового контрагента"
          className="w-full rounded-md border bg-background px-2 py-2 text-sm"
          value={classification}
          disabled={create.isPending || !classes.isSuccess}
          onChange={(e) => {
            setClassification(e.target.value);
            setPropertyIds([]);
          }}
        >
          <option value="">Без классификации</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {classes.isError && (
        <p role="alert" className="text-xs text-destructive">
          Не удалось загрузить классификации.{" "}
          <button type="button" onClick={() => void classes.refetch()}>
            Повторить
          </button>
        </p>
      )}
      {owner && (
        <div className={create.isPending ? "pointer-events-none opacity-60" : ""}>
          {assignments.isError || properties.isError ? (
            <p role="alert" className="text-xs text-destructive">
              Не удалось загрузить объекты.{" "}
              <button
                type="button"
                onClick={() => {
                  void assignments.refetch();
                  void properties.refetch();
                }}
              >
                Повторить
              </button>
            </p>
          ) : !assignments.isSuccess || !properties.isSuccess ? (
            <p className="text-xs">Загрузка объектов…</p>
          ) : (
            <OwnerPropertyPicker
              properties={properties.data}
              assignments={assignments.data}
              ownerId={null}
              selected={propertyIds}
              onChange={setPropertyIds}
            />
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={
            !name.trim() ||
            create.isPending ||
            !classes.isSuccess ||
            (owner && (!propertyIds.length || !assignments.isSuccess || !properties.isSuccess))
          }
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Создание…" : "Создать и выбрать"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={create.isPending}
          onClick={() => setOpen(false)}
        >
          Отмена
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Карточка сохранится отдельно. Операция будет добавлена после нажатия «Добавить операцию».
      </p>
    </section>
  );
}
