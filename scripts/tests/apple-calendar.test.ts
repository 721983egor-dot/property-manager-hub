import { test } from "node:test";
import assert from "node:assert/strict";
import ICAL from "ical.js";
import {
  taskIcs,
  parseCalendarEdit,
  etag,
  xml,
  type CalendarTask,
} from "../../src/lib/apple-calendar/model";

const id = "00000000-0000-4000-8000-000000000001";
const task: CalendarTask = {
  id,
  title: "Показ квартиры, ключи; вход",
  description: "Строка 1\nСтрока 2",
  due_date: "2026-11-02",
  due_start: "10:00",
  due_end: "11:00",
  updated_at: "2026-10-30T10:00:00Z",
  status: "open",
};
test("Moscow times, UTF-8 folding, escaped descriptions and stable UID survive a round trip", () => {
  const raw = taskIcs({ ...task, title: task.title.repeat(8) });
  for (const line of raw.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  const edit = parseCalendarEdit(raw);
  assert.equal(edit.date, task.due_date);
  assert.equal(edit.start, "10:00");
  assert.equal(edit.end, "11:00");
  assert.equal(edit.description, task.description);
  assert.equal(edit.uid, id + "@rm-os");
  assert.equal(edit.title, task.title.repeat(8));
  assert.equal(etag(raw), etag(raw));
  assert.notEqual(etag(raw), etag(raw + " "));
});
test("all-day tasks have exclusive next-day end, no drifting times", () => {
  const raw = taskIcs({ ...task, due_date: "2026-12-31", due_start: "", due_end: "" });
  assert.match(raw, /DTEND;VALUE=DATE:20270101/);
  const edit = parseCalendarEdit(raw);
  assert.equal(edit.date, "2026-12-31");
  assert.equal(edit.start, "");
});
test("Apple edits convert UTC to Moscow and preserve a plain task", () => {
  const raw = taskIcs(task)
    .replace("20261102T070000Z", "20261102T090000Z")
    .replace("20261102T080000Z", "20261102T100000Z");
  const edit = parseCalendarEdit(raw);
  assert.equal(edit.start, "12:00");
  assert.equal(edit.end, "13:00");
});
test("floating times mean Moscow, unsupported multi-day, repeats and invitations are rejected", () => {
  const raw = taskIcs(task);
  assert.equal(
    parseCalendarEdit(
      raw
        .replace(/20261102T070000Z/, "20261102T100000")
        .replace(/20261102T080000Z/, "20261102T110000"),
    ).start,
    "10:00",
  );
  assert.throws(
    () => parseCalendarEdit(raw.replace("END:VEVENT", "RRULE:FREQ=DAILY\r\nEND:VEVENT")),
    /Повторы/,
  );
  assert.throws(
    () =>
      parseCalendarEdit(
        raw.replace("END:VEVENT", "ATTENDEE:mailto:someone@example.com\r\nEND:VEVENT"),
      ),
    /приглашения/,
  );
  assert.throws(
    () => parseCalendarEdit(raw.replace("20261102T080000Z", "20261103T080000Z")),
    /одного дня/,
  );
  assert.throws(
    () =>
      parseCalendarEdit(
        raw.replace("DTSTART:20261102T070000Z", "DTSTART;TZID=Unknown/Zone:20261102T070000"),
      ),
    /пояс/,
  );
  assert.throws(() => parseCalendarEdit(raw + raw));
  assert.equal(xml('<&"'), "&lt;&amp;&quot;");
});
test("description cannot inject additional calendar properties", () => {
  const raw = taskIcs({ ...task, description: "\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:evil" });
  assert.equal(new ICAL.Component(ICAL.parse(raw)).getAllSubcomponents("vevent").length, 1);
});

test("CalDAV discovery, multiget, conditional updates, creation, removal and ownership", async () => {
  process.env.SUPABASE_URL = "https://example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  const { handleCalendarRequest } = await import("../../src/lib/apple-calendar/dav.server");
  const account = {
    user_id: id,
    password_hash: "",
    scope: "mine" as const,
    enabled: true,
    version: 1,
    updated_at: task.updated_at,
  };
  let current = { ...task };
  const writes: Record<string, unknown>[] = [];
  const origin = "https://rm-os.example",
    home = `/api/public/caldav/${id}/`,
    collection = home + "tasks/";
  let present = true;
  const deps = {
    authenticate: async () => account,
    repo: {
      load: async () =>
        present
          ? [
              {
                task: current,
                name: `task-${id}.ics`,
                uid: id + "@rm-os",
                ics: taskIcs(current, id + "@rm-os", origin),
                tag: etag(taskIcs(current, id + "@rm-os", origin)),
              },
            ]
          : [],
      write: async (args: Record<string, unknown>) => {
        writes.push(args);
        if (args.p_remove) present = false;
        else if (args.p_task) {
          const edit = args.p_edit as ReturnType<typeof parseCalendarEdit>;
          current = {
            ...current,
            title: edit.title,
            due_date: edit.date,
            due_start: edit.start,
            due_end: edit.end,
          };
        }
        return id;
      },
    },
  };
  const req = (path: string, method: string, headers: Record<string, string> = {}, body?: string) =>
    handleCalendarRequest(new Request(origin + path, { method, headers, body }), deps);
  const discovery = await req(home, "PROPFIND", { Depth: "1" });
  assert.equal(discovery.status, 207);
  assert.match(await discovery.text(), /calendar-home-set/);
  assert.equal((await req("/api/public/caldav/other/tasks/", "PROPFIND")).status, 404);
  const listing = await req(
    collection,
    "REPORT",
    {},
    '<c:calendar-query xmlns:c="urn:ietf:params:xml:ns:caldav"/>',
  );
  assert.equal(listing.status, 207);
  assert.match(await listing.text(), /calendar-data/);
  const path = collection + `task-${id}.ics`,
    tag = etag(taskIcs(current, id + "@rm-os", origin));
  assert.equal((await req(path, "PUT", {}, taskIcs(task))).status, 412);
  assert.equal(writes.length, 0);
  assert.equal((await req(path, "PUT", { "If-Match": '"stale"' }, taskIcs(task))).status, 412);
  assert.equal(
    (await req(path, "PUT", { "If-Match": tag }, taskIcs({ ...task, title: "Перенесённый показ" })))
      .status,
    204,
  );
  assert.equal(writes.length, 1);
  assert.equal(current.title, "Перенесённый показ");
  assert.equal(
    (await req(collection + "new.ics", "PUT", {}, taskIcs(task, "new-event"))).status,
    428,
  );
  assert.equal(
    (await req(collection + "new.ics", "PUT", { "If-None-Match": "*" }, taskIcs(task, "new-event")))
      .status,
    201,
  );
  assert.equal(writes.length, 2);
  assert.equal(
    (
      await req(
        collection + "task-fake.ics",
        "PUT",
        { "If-None-Match": "*" },
        taskIcs(task, "new-event"),
      )
    ).status,
    409,
  );
  const fresh = etag(taskIcs(current, id + "@rm-os", origin));
  assert.equal((await req(path, "DELETE", { "If-Match": fresh })).status, 204);
  assert.equal(writes[2].p_remove, true);
  assert.equal((await req(path, "GET")).status, 404);
  assert.equal((await req(collection, "DELETE")).status, 405);
  assert.equal(
    (await req(collection, "REPORT", {}, "<!DOCTYPE a><c:calendar-query/>")).status,
    400,
  );
  const unauthorized = await handleCalendarRequest(
    new Request(origin + collection, { method: "PROPFIND" }),
    { ...deps, authenticate: async () => null },
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get("www-authenticate")?.includes("Basic"), true);
});
