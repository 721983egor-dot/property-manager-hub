import { supabase } from "@/integrations/supabase/client";
import { addDays, parseISODate, toISODate } from "@/lib/rentals";

export type TaskStatus = "open" | "done";

export type TaskColumnId = "overdue" | "today" | "this_week" | "next_week" | "later" | "none";

/** Периодичность регулярной задачи. */
export type TaskRecurrence = "daily" | "weekly" | "monthly";

export type TaskType = {
  id: string;
  name: string;
  color: string;
  position: number;
};

export type StaffTaskItem = {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
};

export type StaffTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  due_date: string | null;
  due_start: string;
  due_end: string;
  assignee_id: string | null;
  created_by: string | null;
  property_id: string | null;
  deal_id: string | null;
  task_type_id: string | null;
  is_recurring: boolean;
  recurrence: TaskRecurrence;
  recurrence_until: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  items: StaffTaskItem[];
};

export type StaffDirectoryMember = {
  id: string;
  email: string;
  full_name: string;
};

export type TaskInput = {
  title: string;
  description: string;
  status: TaskStatus;
  due_date: string | null;
  due_start: string;
  due_end: string;
  assignee_id: string | null;
  property_id: string | null;
  deal_id: string | null;
  task_type_id: string | null;
  is_recurring?: boolean;
  recurrence?: TaskRecurrence;
  recurrence_until?: string | null;
  position?: number;
};

export type TaskTypeInput = {
  name: string;
  color: string;
  position: number;
};

export const TASK_RECURRENCE_OPTIONS: { id: TaskRecurrence; label: string }[] = [
  { id: "daily", label: "Каждый день" },
  { id: "weekly", label: "Каждую неделю" },
  { id: "monthly", label: "Каждый месяц" },
];

export const TASK_TYPE_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#0f172a",
] as const;

export const TASK_COLUMNS: { id: TaskColumnId; name: string; color: string }[] = [
  { id: "overdue", name: "Просроченные", color: "#dc2626" },
  { id: "today", name: "Сегодня", color: "#2563eb" },
  { id: "this_week", name: "На этой неделе", color: "#7c3aed" },
  { id: "next_week", name: "На следующей неделе", color: "#0891b2" },
  { id: "later", name: "Позже", color: "#64748b" },
  { id: "none", name: "Без срока", color: "#94a3b8" },
];

const TASK_COLUMNS_BASE =
  "id, title, description, status, due_date, due_start, due_end, assignee_id, created_by, property_id, task_type_id, position, completed_at, created_at, updated_at";

const TASK_COLUMNS_WITH_DEAL = `${TASK_COLUMNS_BASE}, deal_id`;

const TASK_COLUMNS_WITH_RECURRING = `${TASK_COLUMNS_WITH_DEAL}, is_recurring, recurrence, recurrence_until`;

function missingDealColumn(message: string) {
  return /deal_id|schema cache|could not find/i.test(message);
}

function missingRecurringColumn(message: string) {
  return /is_recurring|recurrence_until|recurrence|schema cache|could not find/i.test(message);
}

function normalizeRecurrence(value: unknown): TaskRecurrence {
  if (value === "daily" || value === "monthly") return value;
  return "weekly";
}

/** Следующая дата повторения после dueDate. */
export function nextRecurrenceDate(
  dueDate: string,
  recurrence: TaskRecurrence,
): string {
  const date = parseISODate(dueDate);
  if (recurrence === "daily") return toISODate(addDays(date, 1));
  if (recurrence === "weekly") return toISODate(addDays(date, 7));
  const next = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate());
  // Если день «перескочил» месяц (31 → март), берём последний день целевого месяца.
  if (next.getDate() !== date.getDate()) {
    return toISODate(new Date(date.getFullYear(), date.getMonth() + 2, 0));
  }
  return toISODate(next);
}

export function recurrenceLabel(recurrence: TaskRecurrence): string {
  return TASK_RECURRENCE_OPTIONS.find((item) => item.id === recurrence)?.label ?? "Каждую неделю";
}

export function timeSlots(stepMin = 30, from = "07:00", to = "22:00"): string[] {
  const [fromH, fromM] = from.split(":").map(Number);
  const [toH, toM] = to.split(":").map(Number);
  const start = (fromH ?? 7) * 60 + (fromM ?? 0);
  const end = (toH ?? 22) * 60 + (toM ?? 0);
  const out: string[] = [];
  for (let minutes = start; minutes <= end; minutes += stepMin) {
    out.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return out;
}

export const TASK_TIME_SLOTS = timeSlots();

export function normalizeTime(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

export function formatTaskTimeRange(start: string, end: string): string {
  const from = normalizeTime(start);
  const to = normalizeTime(end);
  if (from && to) return `${from}–${to}`;
  if (from) return from;
  return "";
}

/** Задача попадает в календарь только если есть дата и интервал времени. */
export function taskShowsOnCalendar(task: Pick<StaffTask, "due_date" | "due_start" | "due_end" | "status">) {
  return Boolean(task.due_date && task.due_start && task.due_end && task.status !== "done");
}

export function timeToMinutes(value: string): number {
  const [h, m] = normalizeTime(value).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function mondayOf(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = copy.getDay();
  copy.setDate(copy.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return copy;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Колонка канбана по дате выполнения. Выполненные на доску не попадают. */
export function taskColumnId(task: Pick<StaffTask, "status" | "due_date">, today = new Date()): TaskColumnId {
  if (!task.due_date) return "none";
  const due = parseISODate(task.due_date);
  const now = startOfDay(today);
  if (due < now) return "overdue";
  if (due.getTime() === now.getTime()) return "today";
  const thisMonday = mondayOf(now);
  const thisSunday = addDays(thisMonday, 6);
  const nextSunday = addDays(thisMonday, 13);
  if (due <= thisSunday) return "this_week";
  if (due <= nextSunday) return "next_week";
  return "later";
}

export function dueDateForColumn(
  column: TaskColumnId,
  today = new Date(),
  mode: "drop" | "create" = "drop",
): string | null {
  const now = startOfDay(today);
  const thisMonday = mondayOf(now);
  if (column === "none") return null;
  if (column === "overdue") return toISODate(mode === "create" ? now : addDays(now, -1));
  if (column === "today") return toISODate(now);
  if (column === "this_week") {
    const tomorrow = addDays(now, 1);
    const thisSunday = addDays(thisMonday, 6);
    return toISODate(tomorrow <= thisSunday ? tomorrow : thisSunday);
  }
  if (column === "next_week") return toISODate(addDays(thisMonday, 7));
  return toISODate(addDays(thisMonday, 14));
}

export function weekDays(anchor: Date): Date[] {
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function mapTask(row: Record<string, unknown>, items: StaffTaskItem[]): StaffTask {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    status: row.status === "done" ? "done" : "open",
    due_date: (row.due_date as string | null) ?? null,
    due_start: normalizeTime(row.due_start as string),
    due_end: normalizeTime(row.due_end as string),
    assignee_id: (row.assignee_id as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    property_id: (row.property_id as string | null) ?? null,
    deal_id: (row.deal_id as string | null) ?? null,
    task_type_id: (row.task_type_id as string | null) ?? null,
    is_recurring: Boolean(row.is_recurring),
    recurrence: normalizeRecurrence(row.recurrence),
    recurrence_until: (row.recurrence_until as string | null) ?? null,
    position: Number(row.position ?? 0),
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    items,
  };
}

async function loadItems(taskIds: string[]): Promise<Map<string, StaffTaskItem[]>> {
  const grouped = new Map<string, StaffTaskItem[]>();
  if (taskIds.length === 0) return grouped;
  const { data, error } = await supabase
    .from("task_items")
    .select("id, task_id, title, done, position, created_at")
    .in("task_id", taskIds)
    .order("position", { ascending: true });
  if (error) throw error;
  for (const row of data ?? []) {
    const item = row as StaffTaskItem;
    const list = grouped.get(item.task_id) ?? [];
    list.push(item);
    grouped.set(item.task_id, list);
  }
  return grouped;
}

async function attachItems(rows: Record<string, unknown>[]): Promise<StaffTask[]> {
  const items = await loadItems(rows.map((row) => String(row.id)));
  return rows.map((row) => mapTask(row, items.get(String(row.id)) ?? []));
}

export async function fetchTaskTypes(): Promise<TaskType[]> {
  const { data, error } = await supabase
    .from("task_types")
    .select("id, name, color, position")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TaskType[];
}

export async function saveTaskType(id: string | null, input: TaskTypeInput): Promise<string> {
  const row = {
    name: input.name.trim() || "Тип",
    color: input.color || "#3b82f6",
    position: input.position,
  };
  if (id) {
    const { error } = await supabase.from("task_types").update(row as never).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from("task_types").insert(row as never).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteTaskType(id: string) {
  const { error } = await supabase.from("task_types").delete().eq("id", id);
  if (error) throw error;
}

/** Сохраняет порядок типов после drag-and-drop. */
export async function reorderTaskTypes(orderedIds: string[]) {
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase.from("task_types").update({ position } as never).eq("id", id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

async function selectTasks(run: (columns: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>) {
  const first = await run(TASK_COLUMNS_WITH_RECURRING);
  let result = first;
  if (missingRecurringColumn(first.error?.message ?? "")) {
    result = await run(TASK_COLUMNS_WITH_DEAL);
  }
  if (missingDealColumn(result.error?.message ?? "")) {
    result = await run(TASK_COLUMNS_BASE);
  }
  if (result.error) throw result.error;
  return attachItems((result.data ?? []) as Record<string, unknown>[]);
}

export async function fetchTasks(): Promise<StaffTask[]> {
  return selectTasks(async (columns) =>
    supabase.from("tasks").select(columns).order("position", { ascending: true }).order("due_date", { ascending: true }),
  );
}

export async function fetchPropertyTasks(propertyId: string): Promise<StaffTask[]> {
  return selectTasks(async (columns) =>
    supabase.from("tasks").select(columns).eq("property_id", propertyId).order("created_at", { ascending: false }),
  );
}

export async function fetchStaffDirectory(): Promise<StaffDirectoryMember[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email ?? "",
    full_name: row.full_name ?? "",
  }));
}

export async function saveTask(id: string | null, input: TaskInput): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const isRecurring = Boolean(input.is_recurring);
  const row: Record<string, unknown> = {
    title: input.title.trim() || "Без названия",
    description: input.description.trim(),
    status: input.status,
    due_date: input.due_date,
    due_start: normalizeTime(input.due_start),
    due_end: normalizeTime(input.due_end),
    assignee_id: input.assignee_id,
    property_id: input.property_id,
    deal_id: input.deal_id,
    task_type_id: input.task_type_id,
    is_recurring: isRecurring,
    recurrence: isRecurring ? normalizeRecurrence(input.recurrence) : "weekly",
    recurrence_until: isRecurring ? input.recurrence_until || null : null,
    position: input.position ?? 0,
    completed_at: input.status === "done" ? new Date().toISOString() : null,
  };
  const write = async (payload: Record<string, unknown>) =>
    id
      ? supabase.from("tasks").update(payload as never).eq("id", id)
      : supabase
          .from("tasks")
          .insert({ ...payload, created_by: session?.user?.id ?? null } as never)
          .select("id")
          .single();

  let result = await write(row);
  if (result.error && missingRecurringColumn(result.error.message)) {
    const stripped = { ...row };
    delete stripped.is_recurring;
    delete stripped.recurrence;
    delete stripped.recurrence_until;
    result = await write(stripped);
  }
  if (result.error && missingDealColumn(result.error.message)) {
    const stripped = { ...row };
    delete stripped.deal_id;
    delete stripped.is_recurring;
    delete stripped.recurrence;
    delete stripped.recurrence_until;
    result = await write(stripped);
  }
  if (result.error) throw result.error;
  if (id) return id;
  return (result.data as { id: string }).id;
}

async function spawnNextRecurringTask(task: StaffTask) {
  if (!task.is_recurring || !task.due_date) return;
  const nextDue = nextRecurrenceDate(task.due_date, task.recurrence);
  if (task.recurrence_until && nextDue > task.recurrence_until) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const row: Record<string, unknown> = {
    title: task.title,
    description: task.description,
    status: "open",
    due_date: nextDue,
    due_start: task.due_start,
    due_end: task.due_end,
    assignee_id: task.assignee_id,
    property_id: task.property_id,
    deal_id: task.deal_id,
    task_type_id: task.task_type_id,
    is_recurring: true,
    recurrence: task.recurrence,
    recurrence_until: task.recurrence_until,
    position: task.position,
    created_by: session?.user?.id ?? task.created_by,
    completed_at: null,
  };

  let insert = await supabase.from("tasks").insert(row as never).select("id").single();
  if (insert.error && missingRecurringColumn(insert.error.message)) {
    const stripped = { ...row };
    delete stripped.is_recurring;
    delete stripped.recurrence;
    delete stripped.recurrence_until;
    insert = await supabase.from("tasks").insert(stripped as never).select("id").single();
  }
  if (insert.error && missingDealColumn(insert.error.message)) {
    const stripped = { ...row };
    delete stripped.deal_id;
    delete stripped.is_recurring;
    delete stripped.recurrence;
    delete stripped.recurrence_until;
    insert = await supabase.from("tasks").insert(stripped as never).select("id").single();
  }
  if (insert.error) throw insert.error;

  const newId = (insert.data as { id: string }).id;
  if (task.items.length > 0) {
    await saveTaskItems(
      newId,
      task.items.map((item) => item.title),
    );
  }
}

export async function completeTask(id: string) {
  const tasks = await selectTasks(async (columns) =>
    supabase.from("tasks").select(columns).eq("id", id).limit(1),
  );
  const task = tasks[0];
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
  if (error) throw error;
  if (task) await spawnNextRecurringTask(task);
}

export async function reopenTask(id: string) {
  const { error } = await supabase
    .from("tasks")
    .update({ status: "open", completed_at: null } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function postponeTask(id: string, dueDate: string | null) {
  const patch: Record<string, unknown> = {
    due_date: dueDate,
    status: "open",
    completed_at: null,
  };
  if (!dueDate) {
    patch.due_start = "";
    patch.due_end = "";
  }
  const { error } = await supabase.from("tasks").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function moveTask(
  id: string,
  column: TaskColumnId,
  position: number,
  current: Pick<StaffTask, "due_start" | "due_end">,
) {
  const dueDate = dueDateForColumn(column);
  const { error } = await supabase
    .from("tasks")
    .update({
      due_date: dueDate,
      due_start: dueDate ? current.due_start : "",
      due_end: dueDate ? current.due_end : "",
      position,
      status: "open",
      completed_at: null,
    } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function addTaskItem(taskId: string, title: string, position: number): Promise<StaffTaskItem> {
  const { data, error } = await supabase
    .from("task_items")
    .insert({
      task_id: taskId,
      title: title.trim() || "Пункт",
      done: false,
      position,
    } as never)
    .select("id, task_id, title, done, position, created_at")
    .single();
  if (error) throw error;
  return data as StaffTaskItem;
}

export async function saveTaskItems(taskId: string, titles: string[]) {
  const rows = titles
    .map((title) => title.trim())
    .filter(Boolean)
    .map((title, position) => ({
      task_id: taskId,
      title,
      done: false,
      position,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("task_items").insert(rows as never);
  if (error) throw error;
}

export async function setTaskItemDone(id: string, done: boolean) {
  const { error } = await supabase.from("task_items").update({ done } as never).eq("id", id);
  if (error) throw error;
}

export async function updateTaskItemTitle(id: string, title: string) {
  const { error } = await supabase.from("task_items").update({ title: title.trim() } as never).eq("id", id);
  if (error) throw error;
}

export async function deleteTaskItem(id: string) {
  const { error } = await supabase.from("task_items").delete().eq("id", id);
  if (error) throw error;
}
