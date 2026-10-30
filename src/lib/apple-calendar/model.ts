import ICAL from "ical.js";
import { createHash } from "node:crypto";

export type CalendarTask = {
  id: string;
  title: string;
  description: string;
  due_date: string | null;
  due_start: string;
  due_end: string;
  updated_at: string;
  status: string;
};
export type CalendarEdit = {
  uid: string;
  title: string;
  description: string;
  date: string;
  start: string;
  end: string;
};
export { CALDAV_BASE } from "./discovery";
export function xml(value: unknown) {
  return String(value ?? "").replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}
const esc = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function fold(s: string) {
  const lines: string[] = [];
  let line = "";
  let bytes = 0;
  for (const c of s) {
    const n = Buffer.byteLength(c);
    if (bytes + n > 75) {
      lines.push(line);
      line = " ";
      bytes = 1;
    }
    line += c;
    bytes += n;
  }
  lines.push(line);
  return lines.join("\r\n");
}
const stamp = (s: string) =>
  new Date(s)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export function taskIcs(
  task: CalendarTask,
  uid = `${task.id}@rm-os`,
  origin = "https://rm-os.residence-more.ru",
) {
  if (!task.due_date) throw Error("Задача без срока");
  const date = task.due_date.replace(/-/g, "");
  const timed = /^\d{2}:\d{2}/.test(task.due_start);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RM OS//Tasks//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${esc(uid)}`,
    `DTSTAMP:${stamp(task.updated_at)}`,
    `LAST-MODIFIED:${stamp(task.updated_at)}`,
  ];
  if (timed) {
    const start = new Date(`${task.due_date}T${task.due_start.slice(0, 5)}:00+03:00`);
    const end =
      task.due_end && task.due_end > task.due_start
        ? new Date(`${task.due_date}T${task.due_end.slice(0, 5)}:00+03:00`)
        : new Date(
            Math.min(start.getTime() + 3600000, Date.parse(`${task.due_date}T23:59:00+03:00`)),
          );
    lines.push(`DTSTART:${stamp(start.toISOString())}`, `DTEND:${stamp(end.toISOString())}`);
  } else {
    const next = new Date(`${task.due_date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push(
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`,
    );
  }
  lines.push(
    `SUMMARY:${esc(task.title)}`,
    `DESCRIPTION:${esc(task.description ?? "")}`,
    `URL:${origin}/crm/tasks/`,
    `STATUS:CONFIRMED`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return lines.map(fold).join("\r\n") + "\r\n";
}
export function etag(content: string) {
  return '"' + createHash("sha256").update(content).digest("hex") + '"';
}
function moscow(t: ICAL.Time) {
  if (t.zone === ICAL.Timezone.localTimezone)
    return {
      date: t.toString().slice(0, 10),
      time: `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`,
    };
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(t.toUnixTime() * 1000));
  return { date: parts.slice(0, 10), time: parts.slice(11, 16) };
}
export function parseCalendarEdit(raw: string): CalendarEdit {
  if (Buffer.byteLength(raw) > 128000) throw Error("Событие слишком большое");
  const cal = new ICAL.Component(ICAL.parse(raw));
  const events = cal.getAllSubcomponents("vevent");
  if (cal.name !== "vcalendar" || events.length !== 1 || cal.getAllSubcomponents("vtodo").length)
    throw Error("Нужно одно событие");
  const component = events[0]!;
  if (
    ["rrule", "rdate", "exdate", "recurrence-id", "attendee", "organizer"].some((p) =>
      component.hasProperty(p),
    )
  )
    throw Error("Повторы и приглашения настраиваются в RM OS");
  if (component.getFirstPropertyValue("status") === "CANCELLED")
    throw Error("Уберите событие из календаря вместо отмены встречи");
  const event = new ICAL.Event(component),
    start = event.startDate;
  if (
    !start ||
    !event.uid ||
    event.uid.length > 255 ||
    !event.summary?.trim() ||
    event.summary.length > 500 ||
    (event.description || "").length > 10000
  )
    throw Error("Проверьте название и дату события");
  // Unknown TZIDs must never silently fall back to the server's timezone.
  const tzid = String(component.getFirstProperty("dtstart")?.getParameter("tzid") ?? "");
  if (tzid && start.zone === ICAL.Timezone.localTimezone) {
    const zone = cal
      .getAllSubcomponents("vtimezone")
      .find((z) => z.getFirstPropertyValue("tzid") === tzid);
    if (zone) start.zone = new ICAL.Timezone(zone);
    else if (tzid === "Europe/Moscow") {
      start.zone = ICAL.Timezone.utcTimezone;
      start.adjust(0, -3, 0, 0);
    } else throw Error("Часовой пояс события не поддерживается");
  }
  if (start.isDate) {
    const end = event.endDate;
    if (end.subtractDate(start).toSeconds() > 86400)
      throw Error("Задача должна занимать один день");
    return {
      uid: event.uid,
      title: event.summary.trim(),
      description: event.description || "",
      date: start.toString(),
      start: "",
      end: "",
    };
  }
  // Read the end before handling floating times, preserving embedded VTIMEZONE.
  let end = event.endDate;
  const endTzid = String(component.getFirstProperty("dtend")?.getParameter("tzid") ?? "");
  if (endTzid && end.zone === ICAL.Timezone.localTimezone) {
    const zone = cal
      .getAllSubcomponents("vtimezone")
      .find((z) => z.getFirstPropertyValue("tzid") === endTzid);
    if (zone) end.zone = new ICAL.Timezone(zone);
    else if (endTzid === "Europe/Moscow") {
      end.zone = ICAL.Timezone.utcTimezone;
      end.adjust(0, -3, 0, 0);
    } else throw Error("Часовой пояс окончания не поддерживается");
  }
  if (!component.hasProperty("dtend") && !component.hasProperty("duration")) {
    end = start.clone();
    end.adjust(0, 1, 0, 0);
  }
  const a = moscow(start),
    b = moscow(end);
  if (a.date !== b.date || b.time <= a.time)
    throw Error("Интервал задачи должен быть в пределах одного дня по Москве");
  return {
    uid: event.uid,
    title: event.summary.trim(),
    description: event.description || "",
    date: a.date,
    start: a.time,
    end: b.time,
  };
}
