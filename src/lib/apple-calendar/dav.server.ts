import { XMLParser, XMLValidator } from "fast-xml-parser";
import ICAL from "ical.js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateCalendar, type CalendarAccount } from "./service.server";
import { CALDAV_BASE, xml, taskIcs, etag, parseCalendarEdit, type CalendarTask } from "./model";

const namespaces =
  'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/"';
const headers = {
  "Cache-Control": "private, no-store",
  DAV: "1, calendar-access",
  "X-Content-Type-Options": "nosniff",
};
const response = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(status === 204 ? null : body, { status, headers: { ...headers, ...extra } });
const prop = (href: string, props: string) =>
  `<d:response><d:href>${xml(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const missing = (href: string) =>
  `<d:response><d:href>${xml(href)}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`;
const multi = (items: string[]) =>
  response(
    `<?xml version="1.0" encoding="UTF-8"?><d:multistatus ${namespaces}>${items.join("")}</d:multistatus>`,
    207,
    { "Content-Type": "application/xml; charset=utf-8" },
  );
const href = (tag: string, url: string) => `<${tag}><d:href>${xml(url)}</d:href></${tag}>`;
type Resource = { task: CalendarTask; name: string; uid: string; ics: string; tag: string };
type Repository = {
  load: (a: CalendarAccount, origin: string) => Promise<Resource[]>;
  write: (args: Record<string, unknown>) => Promise<string>;
};
const repository: Repository = {
  async load(account, origin) {
    const tasks: CalendarTask[] = [];
    for (let from = 0; ; from += 500) {
      let query = supabaseAdmin
        .from("tasks")
        .select("id,title,description,due_date,due_start,due_end,updated_at,status")
        .eq("status", "open")
        .not("due_date", "is", null)
        .order("id")
        .range(from, from + 499);
      if (account.scope === "mine") query = query.eq("assignee_id", account.user_id);
      const { data, error } = await query;
      if (error) throw error;
      tasks.push(...(data as CalendarTask[]));
      if (data.length < 500) break;
    }
    const { data: links, error } = await supabaseAdmin
      .from("task_calendar_links" as never)
      .select("task_id,resource,uid")
      .eq("user_id", account.user_id);
    if (error) throw error;
    const map = new Map(
      (links as { task_id: string; resource: string; uid: string }[]).map((l) => [l.task_id, l]),
    );
    return tasks.map((task) => {
      const link = map.get(task.id);
      const name = link?.resource ?? `task-${task.id}.ics`,
        uid = link?.uid ?? `${task.id}@rm-os`;
      const ics = taskIcs(task, uid, origin);
      return { task, name, uid, ics, tag: etag(ics) };
    });
  },
  async write(args) {
    const { data, error } = await supabaseAdmin.rpc("task_calendar_write" as never, args as never);
    if (error) throw error;
    return String(data);
  },
};
async function limitedBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 128000) throw Error("body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const buffers: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 128000) {
      await reader.cancel();
      throw Error("body_too_large");
    }
    buffers.push(value);
  }
  return Buffer.concat(buffers).toString("utf8");
}
/** Testable protocol handler: production authentication and storage are injected only by this module. */
export async function handleCalendarRequest(
  request: Request,
  deps = { authenticate: authenticateCalendar, repo: repository },
) {
  try {
    const url = new URL(request.url),
      path = url.pathname,
      method = request.method;
    if (
      url.protocol !== "https:" &&
      request.headers.get("x-forwarded-proto") !== "https" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      return response("HTTPS required", 426);
    if (method === "OPTIONS")
      return response("", 200, {
        Allow: "OPTIONS, PROPFIND, REPORT, GET, HEAD, PUT, DELETE",
      });
    const account = await deps.authenticate(request);
    if (!account)
      return response("Calendar authentication required", 401, {
        "WWW-Authenticate": 'Basic realm="RM OS Tasks", charset="UTF-8"',
      });
    const home = `${CALDAV_BASE}${account.user_id}/`,
      collection = home + "tasks/";
    if (
      path !== CALDAV_BASE &&
      path !== CALDAV_BASE.slice(0, -1) &&
      path !== home.slice(0, -1) &&
      !path.startsWith(home)
    )
      return response("Not found", 404);
    if (path === home.slice(0, -1) || path === collection.slice(0, -1))
      return response("", 307, { Location: path + "/" });
    const root = path === CALDAV_BASE || path === CALDAV_BASE.slice(0, -1),
      isHome = path === home,
      isCollection = path === collection;
    const name = path.startsWith(collection) ? path.slice(collection.length) : "";
    if (!root && !isHome && !isCollection && !/^[A-Za-z0-9._-]{1,180}\.ics$/.test(name))
      return response("Not found", 404);
    const resources = await deps.repo.load(account, url.origin),
      current = resources.find((r) => r.name === name);
    const owner = href("d:owner", home);
    const collectionProps = `<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>RM OS · Задачи</d:displayname>${owner}<c:calendar-description>Задачи со сроком. Изменения дат, названия и заметок сохраняются в RM OS. Удаление события убирает срок задачи.</c:calendar-description><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set><a:calendar-color>#3675DBFF</a:calendar-color><cs:getctag>${xml(etag(resources.map((r) => r.tag).join("")))}</cs:getctag><d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set><d:supported-report-set><d:supported-report><d:report><c:calendar-query/></d:report></d:supported-report><d:supported-report><d:report><c:calendar-multiget/></d:report></d:supported-report></d:supported-report-set>`;
    const eventProps = (r: Resource, data = false) =>
      `<d:resourcetype/><d:getetag>${xml(r.tag)}</d:getetag><d:getcontenttype>text/calendar; charset=utf-8</d:getcontenttype><d:getcontentlength>${Buffer.byteLength(r.ics)}</d:getcontentlength>${data ? `<c:calendar-data>${xml(r.ics)}</c:calendar-data>` : ""}`;
    if (method === "PROPFIND") {
      const depth = request.headers.get("depth") ?? "0";
      if (!["0", "1"].includes(depth)) return response("Finite depth required", 403);
      const principalProps = `<d:resourcetype><d:collection/><d:principal/></d:resourcetype><d:displayname>RM OS</d:displayname>${href("d:current-user-principal", home)}${href("d:principal-URL", home)}${href("c:calendar-home-set", home)}${owner}`;
      if (root)
        return multi([
          prop(CALDAV_BASE, principalProps),
          ...(depth === "1" ? [prop(home, principalProps)] : []),
        ]);
      if (isHome)
        return multi([
          prop(home, principalProps),
          ...(depth === "1" ? [prop(collection, collectionProps)] : []),
        ]);
      if (isCollection)
        return multi([
          prop(collection, collectionProps),
          ...(depth === "1" ? resources.map((r) => prop(collection + r.name, eventProps(r))) : []),
        ]);
      return current ? multi([prop(path, eventProps(current))]) : response("Not found", 404);
    }
    if (method === "REPORT" && isCollection) {
      const raw = await limitedBody(request);
      if (/<!DOCTYPE|<!ENTITY/i.test(raw) || XMLValidator.validate(raw) !== true)
        return response("Invalid XML", 400);
      const parsed = new XMLParser({
        removeNSPrefix: true,
        ignoreAttributes: false,
        processEntities: false,
      }).parse(raw);
      if (Object.hasOwn(parsed, "calendar-multiget")) {
        const items = parsed["calendar-multiget"].href ?? [];
        const list = (Array.isArray(items) ? items : [items]) as string[];
        return multi(
          list.map((h) => {
            const p = new URL(String(h), url.origin).pathname;
            const r = resources.find((r) => collection + r.name === p);
            return r ? prop(p, eventProps(r, true)) : missing(p);
          }),
        );
      }
      if (Object.hasOwn(parsed, "calendar-query")) {
        const query = parsed["calendar-query"];
        // Date filtering must be exact: Calendar uses this to decide which events exist in its window.
        const filter = query?.filter?.["comp-filter"];
        const child = filter?.["comp-filter"];
        const eventFilter = Array.isArray(child) ? child[0] : child;
        if (eventFilter?.["@_name"] && eventFilter["@_name"] !== "VEVENT") return multi([]);
        if (
          eventFilter?.["prop-filter"] ||
          eventFilter?.["comp-filter"] ||
          eventFilter?.["is-not-defined"]
        )
          return response("Unsupported filter", 403);
        const range = eventFilter?.["time-range"];
        const instant = (v: unknown) => {
          if (!v) return null;
          const s = String(v);
          if (!/^\d{8}T\d{6}Z$/.test(s)) throw Error("Invalid time range");
          const result = Date.parse(
            `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`,
          );
          if (!Number.isFinite(result)) throw Error("Invalid time range");
          return result;
        };
        const from = instant(range?.["@_start"]),
          to = instant(range?.["@_end"]);
        const matches = resources.filter((r) => {
          if (!range) return true;
          const event = new ICAL.Event(
            new ICAL.Component(ICAL.parse(r.ics)).getFirstSubcomponent("vevent")!,
          );
          const milliseconds = (time: ICAL.Time) =>
            time.isDate
              ? Date.parse(time.toString() + "T00:00:00+03:00")
              : time.toUnixTime() * 1000;
          const start = milliseconds(event.startDate),
            end = milliseconds(event.endDate);
          return (from === null || end > from) && (to === null || start < to);
        });
        return multi(matches.map((r) => prop(collection + r.name, eventProps(r, true))));
      }
      return response("Report not supported", 403);
    }
    if ((method === "GET" || method === "HEAD") && current)
      return response(method === "HEAD" ? "" : current.ics, 200, {
        "Content-Type": "text/calendar; charset=utf-8",
        ETag: current.tag,
      });
    if ((method === "PUT" || method === "DELETE") && name) {
      const match = request.headers.get("if-match"),
        none = request.headers.get("if-none-match");
      if (current) {
        if (none === "*" || !match || match !== current.tag)
          return response("Calendar changed; refresh before saving", 412);
      } else if (method === "DELETE" || match) return response("Not found", 404);
      else if (none !== "*") return response("If-None-Match required", 428);
      const edit = method === "PUT" ? parseCalendarEdit(await limitedBody(request)) : null;
      if (current && edit?.uid && edit.uid !== current.uid)
        return response("UID cannot be changed", 409);
      // Reserve generated names/UIDs, so user-created events cannot shadow an RM OS task.
      if (!current && (/^task-/i.test(name) || edit?.uid.endsWith("@rm-os")))
        return response("Reserved resource", 409);
      try {
        await deps.repo.write({
          p_actor: account.user_id,
          p_version: account.version,
          p_task: current?.task.id ?? null,
          p_expected: current?.task.updated_at ?? null,
          p_resource: name,
          p_uid: edit?.uid ?? current?.uid,
          p_edit: edit ?? {},
          p_remove: method === "DELETE",
        });
      } catch (e) {
        const msg = String((e as { message?: string }).message ?? e);
        return response(
          "Calendar changed or access revoked; refresh before saving",
          /calendar_conflict/.test(msg) ? 412 : 409,
        );
      }
      if (method === "DELETE") return response("", 204);
      const updated = (await deps.repo.load(account, url.origin)).find((r) => r.name === name);
      return response(
        "",
        current ? 204 : 201,
        updated ? { ETag: updated.tag, Location: collection + name } : {},
      );
    }
    // Calendar creation/removal, invitations and property changes cannot change business settings.
    return response("Method not supported", method === "GET" || method === "HEAD" ? 404 : 405);
  } catch (e) {
    return response(
      String((e as Error).message).includes("body_too_large")
        ? "Request too large"
        : "Не удалось обработать событие. Проверьте дату, название и повторение.",
      String((e as Error).message).includes("body_too_large") ? 413 : 400,
    );
  }
}
