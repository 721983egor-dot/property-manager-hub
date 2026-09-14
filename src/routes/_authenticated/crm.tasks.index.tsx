import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, ListTodo, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { TaskDialog } from "@/components/TaskDialog";
import { CrmTabs } from "@/components/CrmTabs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccess } from "@/hooks/useAccess";
import { fetchProperties, internalTitle } from "@/lib/properties";
import { formatDateRu, parseISODate, toISODate } from "@/lib/rentals";
import {
  TASK_COLUMNS,
  completeTask,
  fetchStaffDirectory,
  fetchTasks,
  formatTaskTimeRange,
  moveTask,
  postponeTask,
  taskColumnId,
  type StaffTask,
  type TaskColumnId,
} from "@/lib/tasks";

export const Route = createFileRoute("/_authenticated/crm/tasks/")({
  head: () => ({
    meta: [
      { title: "Задачи — RM OS" },
      {
        name: "description",
        content: "Канбан задач RM OS: сегодня, просроченные, следующая неделя и чеклисты по объектам.",
      },
      { property: "og:title", content: "Задачи — RM OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const queryClient = useQueryClient();
  const { profile } = useAccess();
  const { data: tasks = [], isLoading, error } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const { data: properties = [] } = useQuery({ queryKey: ["properties"], queryFn: fetchProperties });
  const { data: staff = [] } = useQuery({ queryKey: ["staff-directory"], queryFn: fetchStaffDirectory });

  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffTask | null>(null);
  const [defaultColumn, setDefaultColumn] = useState<TaskColumnId>("today");
  const [dragId, setDragId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [postponeId, setPostponeId] = useState<string | null>(null);

  const staffName = useMemo(
    () => new Map(staff.map((member) => [member.id, member.full_name || member.email])),
    [staff],
  );
  const propertyName = useMemo(
    () => new Map(properties.map((property) => [property.id, internalTitle(property)])),
    [properties],
  );

  const scoped = useMemo(() => {
    if (scope === "mine") return tasks.filter((task) => task.assignee_id === profile?.id);
    return tasks;
  }, [tasks, scope, profile?.id]);

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
        ...task.items.map((item) => item.title),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [scoped, search, showDone, staffName, propertyName]);

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
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось перенести"),
  });

  const doneMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      invalidate();
      toast.success("Задача выполнена");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось отметить"),
  });

  const postponeMutation = useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate: string }) => postponeTask(id, dueDate),
    onSuccess: () => {
      setPostponeId(null);
      invalidate();
      toast.success("Задача отложена");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Не удалось отложить"),
  });

  const openNew = (column: TaskColumnId) => {
    setEditing(null);
    setDefaultColumn(column);
    setDialogOpen(true);
  };

  const openTask = (task: StaffTask) => {
    setEditing(task);
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Задачи</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => openNew("today")}>
            <Plus className="mr-1.5 size-4" /> Задача
          </Button>
        </div>
      </div>

      <CrmTabs active="tasks" />

      <div className="mt-5 flex flex-wrap items-center gap-3">
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
        <Button
          variant="outline"
          className={showDone ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white" : ""}
          onClick={() => setShowDone((value) => !value)}
        >
          <ListTodo className="mr-1.5 size-4" />
          Выполненные ({doneCount})
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-10 text-center text-muted-foreground">Загружаем задачи…</p>
      ) : error ? (
        <p className="mt-10 text-center text-muted-foreground">
          Не удалось загрузить задачи: {error instanceof Error ? error.message : "ошибка"}
        </p>
      ) : showDone ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => openTask(task)}
              className="rounded-md border border-border bg-background p-3 text-left shadow-sm hover:shadow-md"
            >
              <p className="text-sm font-medium">{taskTitle(task)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {task.completed_at
                  ? `Выполнена ${new Date(task.completed_at).toLocaleString("ru-RU")}`
                  : "Выполнена"}
              </p>
              {task.assignee_id ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {staffName.get(task.assignee_id) ?? "Сотрудник"}
                </p>
              ) : null}
              {task.property_id ? (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {propertyName.get(task.property_id)}
                </p>
              ) : null}
            </button>
          ))}
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
                  {items.map((task) => (
                    <article
                      key={task.id}
                      draggable
                      onDragStart={(event) => {
                        if ((event.target as HTMLElement).closest("button")) {
                          event.preventDefault();
                          return;
                        }
                        setDragId(task.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => openTask(task)}
                      className={
                        "cursor-pointer rounded-md border border-border bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md" +
                        (dragId === task.id ? " opacity-50" : "")
                      }
                    >
                      <p className="text-sm font-medium">{taskTitle(task)}</p>
                      {task.due_date && column.id !== "today" ? (
                        <p className="mt-1 text-xs text-muted-foreground">{formatDateRu(task.due_date)}</p>
                      ) : null}
                      {task.assignee_id ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {staffName.get(task.assignee_id) ?? "Сотрудник"}
                        </p>
                      ) : null}
                      {task.property_id ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {propertyName.get(task.property_id)}
                        </p>
                      ) : null}
                      {task.items.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {task.items.slice(0, 6).map((item) => (
                            <span
                              key={item.id}
                              className={
                                "size-2.5 rounded-full border " +
                                (item.done
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground/40")
                              }
                              title={item.title}
                            />
                          ))}
                          <span className="text-xs text-muted-foreground">
                            {task.items.filter((item) => item.done).length}/{task.items.length}
                          </span>
                        </div>
                      ) : null}
                      <div
                        className="mt-2 flex flex-wrap gap-1.5"
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            doneMutation.mutate(task.id);
                          }}
                        >
                          <Check className="mr-1 size-3" />
                          Выполнено
                        </Button>
                        <Popover
                          open={postponeId === task.id}
                          onOpenChange={(open) => setPostponeId(open ? task.id : null)}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <CalendarClock className="mr-1 size-3" />
                              Отложить
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-auto p-2"
                            align="start"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Calendar
                              mode="single"
                              {...(task.due_date ? { selected: parseISODate(task.due_date) } : {})}
                              onSelect={(date) => {
                                if (!date) return;
                                postponeMutation.mutate({ id: task.id, dueDate: toISODate(date) });
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </article>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => openNew(column.id)}
                  className="mt-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-background"
                >
                  + Добавить задачу
                </button>
              </div>
            );
          })}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing ? (tasks.find((item) => item.id === editing.id) ?? editing) : null}
        {...(editing ? {} : { defaultColumn })}
      />
    </div>
  );
}

function taskTitle(task: StaffTask) {
  const range = formatTaskTimeRange(task.due_start, task.due_end);
  if (!range) return task.title || "Без названия";
  return `${task.title || "Без названия"} (${range})`;
}
