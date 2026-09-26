import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, Check, ListTodo, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { MaintenanceTabs } from "@/components/MaintenanceTabs";
import { TaskDialog } from "@/components/TaskDialog";
import { TasksCalendar } from "@/components/TasksCalendar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccess } from "@/hooks/useAccess";
import {
  MAINTENANCE_TASK_TYPE_NAME,
  fetchMaintenanceTaskTypeId,
  filterMaintenanceProperties,
  isMaintenanceTaskType,
} from "@/lib/maintenance";
import { fetchProperties, internalTitle } from "@/lib/properties";
import { formatDateRu, parseISODate, toISODate } from "@/lib/rentals";
import {
  TASK_COLUMNS,
  completeTask,
  fetchStaffDirectory,
  fetchTaskTypes,
  fetchTasks,
  formatTaskTimeRange,
  moveTask,
  postponeTask,
  taskColumnId,
  type StaffTask,
  type TaskColumnId,
} from "@/lib/tasks";

export const Route = createFileRoute("/_authenticated/maintenance/tasks")({
  head: () => ({
    meta: [
      { title: "Задачи обслуживания — RM OS" },
      {
        name: "description",
        content: "Задачи типа «Обслуживание»: доска и календарь.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <MaintenanceTasksPage defaultView="board" />,
});

export function MaintenanceTasksPage({ defaultView }: { defaultView: "board" | "calendar" }) {
  const queryClient = useQueryClient();
  const { profile } = useAccess();
  const { data: tasks = [], isLoading, error } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const { data: types = [] } = useQuery({ queryKey: ["task-types"], queryFn: fetchTaskTypes });
  const { data: properties = [] } = useQuery({ queryKey: ["properties"], queryFn: fetchProperties });
  const { data: staff = [] } = useQuery({ queryKey: ["staff-directory"], queryFn: fetchStaffDirectory });
  const { data: maintenanceTypeId } = useQuery({
    queryKey: ["maintenance-task-type-id"],
    queryFn: fetchMaintenanceTaskTypeId,
  });

  const [view, setView] = useState<"board" | "calendar">(defaultView);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffTask | null>(null);
  const [defaultColumn, setDefaultColumn] = useState<TaskColumnId>("today");
  const [defaultDue, setDefaultDue] = useState<{ date?: string; start?: string; end?: string }>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [postponeId, setPostponeId] = useState<string | null>(null);

  const maintenanceProperties = useMemo(
    () => filterMaintenanceProperties(properties, { includeArchived: true }),
    [properties],
  );
  const maintenancePropertyIds = useMemo(
    () => maintenanceProperties.map((property) => property.id),
    [maintenanceProperties],
  );

  const staffName = useMemo(
    () => new Map(staff.map((member) => [member.id, member.full_name || member.email])),
    [staff],
  );
  const propertyName = useMemo(
    () => new Map(properties.map((property) => [property.id, internalTitle(property)])),
    [properties],
  );
  const typeById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);

  const maintenanceTasks = useMemo(() => {
    return tasks.filter((task) => {
      const type = task.task_type_id ? typeById.get(task.task_type_id) : null;
      return isMaintenanceTaskType(type ?? null, maintenanceTypeId ?? null);
    });
  }, [tasks, typeById, maintenanceTypeId]);

  const scoped = useMemo(() => {
    if (scope === "mine") return maintenanceTasks.filter((task) => task.assignee_id === profile?.id);
    return maintenanceTasks;
  }, [maintenanceTasks, scope, profile?.id]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = scoped.filter((task) => (showDone ? task.status === "done" : task.status !== "done"));
    if (!query) return list;
    return list.filter((task) =>
      [
        task.title,
        task.description,
        staffName.get(task.assignee_id ?? "") ?? "",
        propertyName.get(task.property_id ?? "") ?? "",
        typeById.get(task.task_type_id ?? "")?.name ?? "",
        ...task.items.map((item) => item.title),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [scoped, search, showDone, staffName, propertyName, typeById]);

  const doneCount = scoped.filter((task) => task.status === "done").length;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["property-tasks"] });
  };

  const moveMutation = useMutation({
    mutationFn: ({ id, column, position }: { id: string; column: TaskColumnId; position: number }) => {
      const current = tasks.find((task) => task.id === id);
      return moveTask(id, column, position, {
        due_start: current?.due_start ?? "",
        due_end: current?.due_end ?? "",
      });
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось перенести"),
  });

  const doneMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      invalidate();
      toast.success("Задача выполнена");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось отметить"),
  });

  const postponeMutation = useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate: string }) => postponeTask(id, dueDate),
    onSuccess: () => {
      setPostponeId(null);
      invalidate();
      toast.success("Задача отложена");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось отложить"),
  });

  const resolvedTypeId =
    maintenanceTypeId ??
    types.find((type) => type.name.toLowerCase() === MAINTENANCE_TASK_TYPE_NAME.toLowerCase())?.id ??
    null;

  const openNew = (column: TaskColumnId) => {
    setEditing(null);
    setDefaultColumn(column);
    setDefaultDue({});
    setDialogOpen(true);
  };

  const openTask = (task: StaffTask) => {
    setEditing(task);
    setDefaultDue({});
    setDialogOpen(true);
  };

  const openFromCalendar = (dueDate: string, dueStart: string, dueEnd: string) => {
    setEditing(null);
    setDefaultColumn("today");
    setDefaultDue({ date: dueDate, start: dueStart, end: dueEnd });
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {defaultView === "calendar" ? "Календарь обслуживания" : "Задачи обслуживания"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Тип «{MAINTENANCE_TASK_TYPE_NAME}» — те же задачи видны в общем блоке CRM → Задачи.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => openNew("today")}>
            <Plus className="mr-1.5 size-4" /> Задача
          </Button>
        </div>
      </div>

      <MaintenanceTabs active={defaultView === "calendar" ? "calendar" : "tasks"} />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-border p-0.5">
          <Button
            size="sm"
            variant={view === "board" ? "default" : "ghost"}
            className="h-8 px-3"
            onClick={() => setView("board")}
          >
            <ListTodo className="mr-1.5 size-3.5" />
            Доска
          </Button>
          <Button
            size="sm"
            variant={view === "calendar" ? "default" : "ghost"}
            className="h-8 px-3"
            onClick={() => {
              setView("calendar");
              setShowDone(false);
            }}
          >
            <CalendarDays className="mr-1.5 size-3.5" />
            Календарь
          </Button>
        </div>
        <div className="relative max-w-sm min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск по задачам"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex rounded-md border border-border p-0.5">
          <Button
            size="sm"
            variant={scope === "all" ? "default" : "ghost"}
            className="h-8 px-3"
            onClick={() => setScope("all")}
          >
            Все
          </Button>
          <Button
            size="sm"
            variant={scope === "mine" ? "default" : "ghost"}
            className="h-8 px-3"
            onClick={() => setScope("mine")}
          >
            Только свои
          </Button>
        </div>
        {view === "board" ? (
          <Button
            variant="outline"
            className={
              showDone
                ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                : ""
            }
            onClick={() => setShowDone((value) => !value)}
          >
            <ListTodo className="mr-1.5 size-4" />
            Выполненные ({doneCount})
          </Button>
        ) : null}
      </div>

      {!resolvedTypeId && !isLoading ? (
        <p className="mt-6 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          Тип задач «{MAINTENANCE_TASK_TYPE_NAME}» ещё не создан в базе. После выкладки миграции он
          появится автоматически — или добавьте его в CRM → Задачи → Типы.
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-10 text-center text-muted-foreground">Загружаем задачи…</p>
      ) : error ? (
        <p className="mt-10 text-center text-muted-foreground">
          Не удалось загрузить задачи: {error instanceof Error ? error.message : "ошибка"}
        </p>
      ) : view === "calendar" ? (
        <TasksCalendar
          tasks={visible}
          types={types}
          onOpenTask={openTask}
          onCreateAt={openFromCalendar}
        />
      ) : showDone ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((task) => {
            const type = task.task_type_id ? typeById.get(task.task_type_id) : null;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => openTask(task)}
                className="rounded-md border border-border bg-background p-3 text-left shadow-sm hover:shadow-md"
                style={type ? { borderLeftWidth: 4, borderLeftColor: type.color } : undefined}
              >
                <p className="text-sm font-medium">
                  {task.title}
                  {formatTaskTimeRange(task.due_start, task.due_end)
                    ? ` (${formatTaskTimeRange(task.due_start, task.due_end)})`
                    : ""}
                </p>
                {type ? (
                  <p className="mt-1 text-xs" style={{ color: type.color }}>
                    {type.name}
                  </p>
                ) : null}
              </button>
            );
          })}
          {visible.length === 0 ? <p className="text-sm text-muted-foreground">Пока пусто.</p> : null}
        </div>
      ) : (
        <div className="mt-5 flex gap-4 overflow-x-auto pb-4">
          {TASK_COLUMNS.map((column) => {
            const items = visible.filter((task) => taskColumnId(task) === column.id);
            return (
              <div
                key={column.id}
                className="flex w-[280px] shrink-0 flex-col rounded-lg bg-muted/40 p-2"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragId) {
                    moveMutation.mutate({ id: dragId, column: column.id, position: items.length });
                  }
                  setDragId(null);
                }}
              >
                <div className="flex items-center gap-2 px-2 py-2">
                  <span className="size-2.5 rounded-full" style={{ background: column.color }} />
                  <span className="text-sm font-semibold">{column.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((task) => {
                    const type = task.task_type_id ? typeById.get(task.task_type_id) : null;
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDragId(task.id)}
                        className="rounded-md border border-border bg-background p-3 shadow-sm"
                        style={type ? { borderLeftWidth: 4, borderLeftColor: type.color } : undefined}
                      >
                        <button type="button" className="w-full text-left" onClick={() => openTask(task)}>
                          <p className="text-sm font-medium">{task.title}</p>
                          {task.due_date ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatDateRu(parseISODate(task.due_date))}
                              {formatTaskTimeRange(task.due_start, task.due_end)
                                ? ` · ${formatTaskTimeRange(task.due_start, task.due_end)}`
                                : ""}
                            </p>
                          ) : null}
                          {task.property_id ? (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {propertyName.get(task.property_id) ?? "Объект"}
                            </p>
                          ) : null}
                          {task.assignee_id ? (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {staffName.get(task.assignee_id) ?? "Исполнитель"}
                            </p>
                          ) : null}
                        </button>
                        <div className="mt-2 flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => doneMutation.mutate(task.id)}
                          >
                            <Check className="size-3.5" />
                          </Button>
                          <Popover
                            open={postponeId === task.id}
                            onOpenChange={(open) => setPostponeId(open ? task.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-2">
                                <CalendarClock className="size-3.5" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2" align="start">
                              <Calendar
                                mode="single"
                                selected={task.due_date ? parseISODate(task.due_date) : undefined}
                                onSelect={(date) => {
                                  if (!date) return;
                                  postponeMutation.mutate({ id: task.id, dueDate: toISODate(date) });
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-start text-muted-foreground"
                    onClick={() => openNew(column.id)}
                  >
                    <Plus className="mr-1 size-4" />
                    Добавить
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        defaultColumn={defaultColumn}
        defaultDueDate={defaultDue.date}
        defaultDueStart={defaultDue.start}
        defaultDueEnd={defaultDue.end}
        defaultTaskTypeId={resolvedTypeId}
        lockTaskType
        propertyIds={maintenancePropertyIds}
      />
    </div>
  );
}
