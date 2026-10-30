// Independent CalDAV client integration, isolated in memory. No RM OS business records or credentials.
import assert from "node:assert/strict";
import {
  taskIcs,
  etag,
  parseCalendarEdit,
  type CalendarTask,
} from "../../src/lib/apple-calendar/model";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
const { handleCalendarRequest } = await import("../../src/lib/apple-calendar/dav.server");
const { createDAVClient } = await import(process.env.CALDAV_CLIENT_MODULE || "tsdav");
const user = "00000000-0000-4000-8000-000000000001",
  origin = "https://rm-os.example",
  home = `/api/public/caldav/${user}/`;
const account = {
  user_id: user,
  password_hash: "",
  scope: "mine" as const,
  enabled: true,
  version: 1,
  updated_at: "2026-10-30T10:00:00Z",
};
const records = new Map<string, { task: CalendarTask; uid: string }>();
const initial: CalendarTask = {
  id: user,
  title: "Показ",
  description: "Тест клиента",
  due_date: "2026-11-02",
  due_start: "10:00",
  due_end: "11:00",
  updated_at: account.updated_at,
  status: "open",
};
records.set("task-" + user + ".ics", { task: initial, uid: user + "@rm-os" });
const repo = {
  load: async () =>
    [...records].map(([name, r]) => {
      const ics = taskIcs(r.task, r.uid, origin);
      return { ...r, name, ics, tag: etag(ics) };
    }),
  write: async (args: Record<string, unknown>) => {
    const name = String(args.p_resource);
    if (args.p_remove) {
      records.delete(name);
      return user;
    }
    const e = args.p_edit as ReturnType<typeof parseCalendarEdit>,
      old = records.get(name);
    records.set(name, {
      task: {
        ...initial,
        id: old?.task.id ?? crypto.randomUUID(),
        title: e.title,
        description: e.description,
        due_date: e.date,
        due_start: e.start,
        due_end: e.end,
        updated_at: new Date().toISOString(),
      },
      uid: e.uid,
    });
    return user;
  },
};
const calls: string[] = [];
const client = await createDAVClient({
  serverUrl: origin + home,
  credentials: { username: user, password: "fake-test-password" },
  authMethod: "Basic",
  defaultAccountType: "caldav",
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request.method + " " + new URL(request.url).pathname);
    return handleCalendarRequest(request, { authenticate: async () => account, repo });
  },
});
const calendars = await client.fetchCalendars();
assert.equal(calendars.length, 1);
assert.equal(calendars[0].displayName, "RM OS · Задачи");
const calendar = calendars[0];
let objects = await client.fetchCalendarObjects({ calendar });
assert.equal(objects.length, 1);
assert.match(objects[0].data, /Показ/);
const moved = objects[0].data
  .replace("20261102T070000Z", "20261102T090000Z")
  .replace("20261102T080000Z", "20261102T100000Z");
assert.equal(
  (await client.updateCalendarObject({ calendarObject: { ...objects[0], data: moved } })).status,
  204,
);
objects = await client.fetchCalendarObjects({ calendar });
assert.match(objects[0].data, /20261102T090000Z/);
const created = await client.createCalendarObject({
  calendar,
  filename: "apple-new.ics",
  iCalString: taskIcs({ ...initial, title: "Новая задача" }, "client-created"),
});
assert.equal(created.status, 201);
objects = await client.fetchCalendarObjects({ calendar });
assert.equal(objects.length, 2);
const one = objects.find((o: { url: string }) => o.url.endsWith("apple-new.ics"))!;
assert.equal((await client.deleteCalendarObject({ calendarObject: one })).status, 204);
objects = await client.fetchCalendarObjects({ calendar });
assert.equal(objects.length, 1);
const outside = await client.fetchCalendarObjects({
  calendar,
  timeRange: { start: "2026-12-01T00:00:00Z", end: "2026-12-31T00:00:00Z" },
});
assert.equal(outside.length, 0);
console.log(
  "PASS: independent tsdav discovery, collection, multiget, ETag edit, create, delete, window filtering. " +
    calls.length +
    " protocol requests, no network or business writes.",
);
