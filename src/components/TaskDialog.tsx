import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Circle, Handshake, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAccess } from "@/hooks/useAccess";
import { fetchDeals } from "@/lib/deals";
import { fetchProperties, internalTitle } from "@/lib/properties";
import {
  TASK_RECURRENCE_OPTIONS,
  TASK_TIME_SLOTS,
  addTaskItem,
  completeTask,
  deleteTask,
  deleteTaskItem,
  dueDateForColumn,
  fetchStaffDirectory,
  fetchTaskTypes,
  formatTaskTimeRange,
  reopenTask,
  saveTask,
  saveTaskItems,
  setTaskItemDone,
  type StaffTask,
  type TaskColumnId,
  type TaskRecurrence,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

const NONE = "__none__";

type DraftItem = { key: string; title: string; done: boolean };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: StaffTask | null;
  defaultColumn?: TaskColumnId;
  defaultDueDate?: string;
  defaultDueStart?: string;
  defaultDueEnd?: string;
  defaultDealId?: string | null;
  defaultPropertyId?: string | null;
  /** Предвыбранный тип (например «Обслуживание»). */
  defaultTaskTypeId?: string | null;
  /** Ограничить список объектов (дома обслуживания). */
  propertyIds?: string[] | null;
  /** Зафиксировать тип задачи и скрыть выбор. */
  lockTaskType?: boolean;
};

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultColumn,
  defaultDueDate,
  defaultDueStart,
  defaultDueEnd,
  defaultDealId,
  defaultPropertyId,
  defaultTaskTypeId,
  propertyIds,
  lockTaskType,
}: Props) {
  const queryClient = useQueryClient();
  const { profile, isAdmin } = useAccess();
  const { data: properties = [] } = useQuery({ queryKey: ["properties"], queryFn: fetchProperties });
  const { data: staff = [] } = useQuery({ queryKey: ["staff-directory"], queryFn: fetchStaffDirectory });
  const { data: types = [] } = useQuery({ queryKey: ["task-types"], queryFn: fetchTaskTypes });
  const { data: deals = [] } = useQuery({ queryKey: ["deals"], queryFn: fetchDeals });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueStart, setDueStart] = useState(NONE);
  const [dueEnd, setDueEnd] = useState(NONE);
  const [assigneeId, setAssigneeId] = useState(NONE);
  const [propertyId, setPropertyId] = useState(NONE);
  const [dealId, setDealId] = useState(NONE);
  const [typeId, setTypeId] = useState(NONE);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("weekly");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setDueDate(
      task?.due_date ??
        defaultDueDate ??
        (defaultColumn ? dueDateForColumn(defaultColumn, new Date(), "create") ?? "" : ""),
    );
    setDueStart(task?.due_start || defaultDueStart || NONE);
    setDueEnd(task?.due_end || defaultDueEnd || NONE);
    setAssigneeId(task?.assignee_id ?? profile?.id ?? NONE);
    setPropertyId(task?.property_id ?? defaultPropertyId ?? NONE);
    setDealId(task?.deal_id ?? defaultDealId ?? NONE);
    setTypeId(task?.task_type_id ?? defaultTaskTypeId ?? types[0]?.id ?? NONE);
    setIsRecurring(Boolean(task?.is_recurring));
    setRecurrence(task?.recurrence ?? "weekly");
    setRecurrenceUntil(task?.recurrence_until ?? "");
    setDraftItems(task ? [] : [{ key: crypto.randomUUID(), title: "", done: false }]);
    setNewItem("");
  }, [open, task?.id, defaultColumn, defaultDueDate, defaultDueStart, defaultDueEnd, defaultDealId, defaultPropertyId, defaultTaskTypeId, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- types только для стартового значения при открытии

  const selectableProperties = useMemo(() => {
    if (!propertyIds) return properties;
    const allowed = new Set(propertyIds);
    return properties.filter((item) => allowed.has(item.id));
  }, [properties, propertyIds]);

  const selectedProperty = useMemo(
    () => selectableProperties.find((item) => item.id === (propertyId === NONE ? "" : propertyId)),
    [selectableProperties, propertyId],
  );

  const selectedDeal = useMemo(
    () => deals.find((item) => item.id === (dealId === NONE ? "" : dealId)),
    [deals, dealId],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["property-tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["deal-history"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const start = dueStart === NONE ? "" : dueStart;
      let end = dueEnd === NONE ? "" : dueEnd;
      if (start && !end) {
        const index = TASK_TIME_SLOTS.indexOf(start);
        end = TASK_TIME_SLOTS[index + 1] ?? start;
      }
      const id = await saveTask(task?.id ?? null, {
        title: title.trim() || "Без названия",
        description,
        status: task?.status ?? "open",
        due_date: dueDate || null,
        due_start: dueDate ? start : "",
        due_end: dueDate ? end : "",
        assignee_id: assigneeId === NONE ? null : assigneeId,
        property_id: propertyId === NONE ? null : propertyId,
        deal_id: dealId === NONE ? null : dealId,
        task_type_id: typeId === NONE ? null : typeId,
        is_recurring: isRecurring,
        recurrence,
        recurrence_until: isRecurring ? recurrenceUntil || null : null,
        position: task?.position ?? 0,
      });
      if (!task) {
        await saveTaskItems(
          id,
          draftItems.map((item) => item.title).filter((item) => item.trim()),
        );
      }
      return id;
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast.success(task ? "Задача сохранена" : "Задача создана");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось сохранить"),
  });

  const addItemMutation = useMutation({
    mutationFn: () => addTaskItem(task!.id, newItem, task!.items.length),
    onSuccess: () => {
      setNewItem("");
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось добавить пункт"),
  });

  const toggleItemMutation = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => setTaskItemDone(id, done),
    onSuccess: invalidate,
  });

  const removeItemMutation = useMutation({
    mutationFn: deleteTaskItem,
    onSuccess: invalidate,
  });

  const doneMutation = useMutation({
    mutationFn: () => completeTask(task!.id),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast.success("Задача выполнена");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось отметить"),
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenTask(task!.id),
    onSuccess: () => {
      invalidate();
      toast.success("Задача возвращена в работу");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось вернуть"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(task!.id),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast.success("Задача удалена");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось удалить"),
  });

  const timeLabel = formatTaskTimeRange(
    dueStart === NONE ? "" : dueStart,
    dueEnd === NONE ? "" : dueEnd,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Задача" : "Новая задача"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Название</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Сделать розетку"
            />
            {timeLabel ? (
              <p className="text-xs text-muted-foreground">
                {title.trim() || "Задача"} ({timeLabel})
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Тип</Label>
              {lockTaskType ? (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  {types.find((type) => type.id === typeId)?.name ?? "Обслуживание"}
                </p>
              ) : (
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Тип задачи" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Без типа</SelectItem>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ background: type.color }} />
                          {type.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Дата</Label>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Исполнитель</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Сотрудник" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Не назначен</SelectItem>
                  {staff.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Начало</Label>
              <Select
                value={dueStart}
                onValueChange={(value) => {
                  setDueStart(value);
                  if (value !== NONE && (dueEnd === NONE || dueEnd <= value)) {
                    const index = TASK_TIME_SLOTS.indexOf(value);
                    setDueEnd(TASK_TIME_SLOTS[index + 1] ?? value);
                  }
                }}
                disabled={!dueDate}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Без времени" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Без времени</SelectItem>
                  {TASK_TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Окончание</Label>
              <Select value={dueEnd} onValueChange={setDueEnd} disabled={!dueDate || dueStart === NONE}>
                <SelectTrigger>
                  <SelectValue placeholder="До" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {TASK_TIME_SLOTS.filter((slot) => dueStart === NONE || slot > dueStart).map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="task-recurring">Регулярная задача</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  После выполнения создастся следующее повторение по дате и времени выше.
                </p>
              </div>
              <Switch
                id="task-recurring"
                checked={isRecurring}
                onCheckedChange={(checked) => {
                  setIsRecurring(checked);
                  if (checked && !dueDate) {
                    setDueDate(dueDateForColumn("today", new Date(), "create") ?? "");
                  }
                }}
              />
            </div>
            {isRecurring ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Повтор</Label>
                  <Select value={recurrence} onValueChange={(value) => setRecurrence(value as TaskRecurrence)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_RECURRENCE_OPTIONS.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Действует до</Label>
                  <Input
                    type="date"
                    value={recurrenceUntil}
                    min={dueDate || undefined}
                    onChange={(event) => setRecurrenceUntil(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Срок жизни: до этой даты включительно.</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label>Сделка</Label>
            <Popover open={dealOpen} onOpenChange={setDealOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-between font-normal">
                  <span className="truncate">
                    {selectedDeal
                      ? selectedDeal.title || "Без названия"
                      : dealId !== NONE
                        ? "Привязана к сделке"
                        : "Не привязана"}
                  </span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Название сделки…" />
                  <CommandList>
                    <CommandEmpty>Ничего не найдено.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="Не привязана"
                        onSelect={() => {
                          setDealId(NONE);
                          setDealOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 size-4", dealId === NONE ? "opacity-100" : "opacity-0")} />
                        Не привязана
                      </CommandItem>
                      {deals.map((deal) => (
                        <CommandItem
                          key={deal.id}
                          value={deal.title || "Без названия"}
                          onSelect={() => {
                            setDealId(deal.id);
                            if (propertyId === NONE && deal.property_id) setPropertyId(deal.property_id);
                            setDealOpen(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 size-4", dealId === deal.id ? "opacity-100" : "opacity-0")}
                          />
                          {deal.title || "Без названия"}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedDeal && isAdmin ? (
              <Link
                to="/crm/deals/"
                search={{ deal: selectedDeal.id }}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Handshake className="size-3.5" />
                Открыть сделку
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">Задача появится в истории карточки сделки.</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Объект</Label>
            <Popover open={propertyOpen} onOpenChange={setPropertyOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-between font-normal">
                  <span className="truncate">
                    {selectedProperty ? internalTitle(selectedProperty) : "Не выбран"}
                  </span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="ЛБ2, 35к16, кв 2…" />
                  <CommandList>
                    <CommandEmpty>Ничего не найдено.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="Не выбран"
                        onSelect={() => {
                          setPropertyId(NONE);
                          setPropertyOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 size-4", propertyId === NONE ? "opacity-100" : "opacity-0")} />
                        Не выбран
                      </CommandItem>
                      {selectableProperties.map((property) => (
                        <CommandItem
                          key={property.id}
                          value={internalTitle(property)}
                          onSelect={() => {
                            setPropertyId(property.id);
                            setPropertyOpen(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 size-4", propertyId === property.id ? "opacity-100" : "opacity-0")}
                          />
                          {internalTitle(property)}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Если объект выбран, задача появится в «Публикация и реклама».
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Комментарий</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Что нужно сделать"
              rows={3}
            />
          </div>

          <div className="grid gap-2">
            <Label>Чеклист</Label>
            {task ? (
              <>
                {task.items.map((item) => (
                  <ChecklistRow
                    key={item.id}
                    title={item.title}
                    done={item.done}
                    onToggle={() => toggleItemMutation.mutate({ id: item.id, done: !item.done })}
                    onRemove={() => removeItemMutation.mutate(item.id)}
                  />
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newItem}
                    onChange={(event) => setNewItem(event.target.value)}
                    placeholder="Новый пункт"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (newItem.trim()) addItemMutation.mutate();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!newItem.trim() || addItemMutation.isPending}
                    onClick={() => addItemMutation.mutate()}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                {draftItems.map((item) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <span className="grid size-5 place-items-center rounded-full border border-muted-foreground/40">
                      <Circle className="size-2.5 text-transparent" />
                    </span>
                    <Input
                      value={item.title}
                      onChange={(event) =>
                        setDraftItems((current) =>
                          current.map((row) => (row.key === item.key ? { ...row, title: event.target.value } : row)),
                        )
                      }
                      placeholder="Пункт чеклиста"
                    />
                    {draftItems.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDraftItems((current) => current.filter((row) => row.key !== item.key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-start px-0 text-muted-foreground"
                  onClick={() =>
                    setDraftItems((current) => [...current, { key: crypto.randomUUID(), title: "", done: false }])
                  }
                >
                  <Plus className="mr-1.5 size-4" /> Добавить пункт
                </Button>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
          {task && (isAdmin || task.created_by === profile?.id) ? (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-destructive hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Удалить
            </Button>
          ) : (
            <span className="mr-auto" />
          )}
          {task?.status === "done" ? (
            <Button type="button" variant="outline" onClick={() => reopenMutation.mutate()}>
              Вернуть в работу
            </Button>
          ) : task ? (
            <Button type="button" variant="outline" onClick={() => doneMutation.mutate()}>
              Выполнено
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistRow({
  title,
  done,
  onToggle,
  onRemove,
}: {
  title: string;
  done: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border",
          done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
        )}
        aria-label={done ? "Снять отметку" : "Отметить выполненным"}
      >
        {done ? <Check className="size-3" /> : null}
      </button>
      <span className={cn("flex-1 text-sm", done && "text-muted-foreground line-through")}>{title}</span>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
