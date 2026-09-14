import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { addDays, toISODate } from "@/lib/rentals";
import {
  taskShowsOnCalendar,
  timeToMinutes,
  weekDays,
  type StaffTask,
  type TaskType,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

const HOUR_START = 7;
const HOUR_END = 22;
const HOUR_HEIGHT = 56;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, index) => HOUR_START + index);
const WEEKDAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

type Props = {
  tasks: StaffTask[];
  types: TaskType[];
  onOpenTask: (task: StaffTask) => void;
  onCreateAt?: (dueDate: string, dueStart: string, dueEnd: string) => void;
};

/** Недельный календарь задач в стиле Apple Calendar. */
export function TasksCalendar({ tasks, types, onOpenTask, onCreateAt }: Props) {
  const [anchor, setAnchor] = useState(() => new Date());
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const todayIso = toISODate(new Date());
  const typeColor = useMemo(
    () => new Map(types.map((type) => [type.id, type.color])),
    [types],
  );

  const timed = useMemo(
    () => tasks.filter(taskShowsOnCalendar),
    [tasks],
  );

  const monthLabel = useMemo(() => {
    const mid = days[3] ?? anchor;
    return mid.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }, [days, anchor]);

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-[#d2d2d7] bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#d2d2d7] px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3 text-[#007aff] hover:bg-[#007aff]/10 hover:text-[#007aff]"
          onClick={() => setAnchor(new Date())}
        >
          Сегодня
        </Button>
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-[#007aff]"
            onClick={() => setAnchor((current) => addDays(current, -7))}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-[#007aff]"
            onClick={() => setAnchor((current) => addDays(current, 7))}
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
        <h2 className="text-[17px] font-semibold capitalize tracking-tight text-[#1d1d1f]">
          {monthLabel}
        </h2>
        <span className="ml-auto text-[13px] text-[#86868b]">Неделя</span>
      </div>

      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-[#d2d2d7]">
        <div className="border-r border-[#ececef]" />
        {days.map((day, index) => {
          const iso = toISODate(day);
          const isToday = iso === todayIso;
          return (
            <div
              key={iso}
              className={cn(
                "border-r border-[#ececef] px-2 py-2 text-center last:border-r-0",
                isToday && "bg-[#007aff]/[0.04]",
              )}
            >
              <p
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wide",
                  isToday ? "text-[#007aff]" : "text-[#86868b]",
                )}
              >
                {WEEKDAY_SHORT[index]}
              </p>
              <p
                className={cn(
                  "mx-auto mt-1 grid size-8 place-items-center text-[20px] font-light",
                  isToday ? "rounded-full bg-[#007aff] font-medium text-white" : "text-[#1d1d1f]",
                )}
              >
                {day.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      <div className="max-h-[min(70vh,760px)] overflow-auto">
        <div
          className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]"
          style={{ height: HOURS.length * HOUR_HEIGHT }}
        >
          <div className="relative border-r border-[#ececef]">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-[#86868b]"
                style={{ top: (hour - HOUR_START) * HOUR_HEIGHT }}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {days.map((day) => {
            const iso = toISODate(day);
            const dayTasks = timed.filter((task) => task.due_date === iso);
            return (
              <div
                key={iso}
                className={cn(
                  "relative border-r border-[#ececef] last:border-r-0",
                  iso === todayIso && "bg-[#007aff]/[0.03]",
                )}
                onDoubleClick={(event) => {
                  if (!onCreateAt) return;
                  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                  const y = event.clientY - rect.top;
                  const minutesFromStart = Math.round((y / HOUR_HEIGHT) * 60 / 30) * 30;
                  const startMin = HOUR_START * 60 + Math.max(0, Math.min(minutesFromStart, (HOUR_END - HOUR_START) * 60 - 30));
                  const endMin = Math.min(startMin + 60, HOUR_END * 60);
                  const start = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`;
                  const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
                  onCreateAt(iso, start, end);
                }}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-[#ececef]"
                    style={{ top: (hour - HOUR_START) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  />
                ))}

                {dayTasks.map((task) => {
                  const start = timeToMinutes(task.due_start);
                  const end = Math.max(timeToMinutes(task.due_end), start + 30);
                  const top = ((start - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 22);
                  const color = (task.task_type_id && typeColor.get(task.task_type_id)) || "#3b82f6";
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onOpenTask(task)}
                      className="absolute inset-x-1 z-10 overflow-hidden rounded-[8px] px-1.5 py-1 text-left text-white shadow-sm transition-opacity hover:opacity-95"
                      style={{
                        top: Math.max(top, 0),
                        height,
                        background: color,
                      }}
                      title={`${task.title} (${task.due_start}–${task.due_end})`}
                    >
                      <p className="truncate text-[12px] font-semibold leading-tight">{task.title || "Задача"}</p>
                      <p className="truncate text-[11px] leading-tight opacity-90">
                        {task.due_start}–{task.due_end}
                      </p>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
