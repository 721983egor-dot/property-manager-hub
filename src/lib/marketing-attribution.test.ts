import test from "node:test";
import assert from "node:assert/strict";
import {
  attributionSchema,
  captureTouch,
  nextAttribution,
  safeMarketingUrl,
  marketingKind,
  attributionChannel,
  ATTRIBUTION_TTL,
} from "./marketing-attribution";
import { summarizeMarketing } from "./marketing-report";
import { isPublicMarketingPath, isMarketingHost } from "./site-marketing";
const visitor = "11111111-1111-4111-8111-111111111111";
const at = "2026-10-30T09:00:00.000Z",
  now = Date.parse(at);
const paid = captureTouch(
  "https://residence-more.ru/management?utm_source=yandex&utm_medium=cpc&utm_campaign=owners&yclid=12345&phone=secret#private",
  "https://yandex.ru/search?text=secret",
  at,
);
const first = nextAttribution(null, paid, visitor, "owner", now);

test("capture stores UTM/yclid but strips arbitrary queries and fragments", () => {
  assert.equal(paid.yclid, "12345");
  assert.equal(paid.utm_campaign, "owners");
  assert(!paid.landing_page.includes("secret"));
  assert.equal(paid.referrer, "https://yandex.ru/search");
  assert.equal(safeMarketingUrl("javascript:alert(1)"), "");
});
test("internal navigation/direct return retains paid source and initial landing", () => {
  const next = nextAttribution(
    first,
    captureTouch("https://residence-more.ru/contacts", "", at),
    visitor,
    "general",
    now + 100,
  );
  assert.deepEqual(next.first_touch, paid);
  assert.deepEqual(next.last_touch, paid);
  assert.equal(next.page, "https://residence-more.ru/contacts");
  assert.equal(attributionChannel(next), "Яндекс Директ");
});
test("new campaign changes last touch, never rewrites first touch", () => {
  const second = captureTouch(
    "https://residence-more.ru/rent?utm_source=vk&utm_campaign=rent",
    "",
    at,
  );
  const next = nextAttribution(first, second, visitor, "tenant", now);
  assert.deepEqual(next.first_touch, paid);
  assert.equal(next.last_touch.utm_campaign, "rent");
});
test("external organic arrival replaces last touch without combining old yclid", () => {
  const next = nextAttribution(
    first,
    captureTouch("https://residence-more.ru/rent", "https://google.com/search?q=x", at),
    visitor,
    "tenant",
    now,
  );
  assert.equal(next.last_touch.yclid, "");
  assert.equal(next.last_touch.utm_campaign, "");
  assert.equal(attributionChannel(next), "google.com");
});
test("90 day attribution window expires", () => {
  const touch = captureTouch(
    "https://residence-more.ru/rent",
    "",
    new Date(now + ATTRIBUTION_TTL).toISOString(),
  );
  const next = nextAttribution(first, touch, visitor, "tenant", now + ATTRIBUTION_TTL);
  assert.equal(next.first_touch.yclid, "");
  assert.equal(next.last_touch.yclid, "");
});
test("directions are based on page/form not editable client topic", () => {
  assert.equal(marketingKind("/management"), "owner");
  assert.equal(marketingKind("/service"), "service");
  assert.equal(marketingKind("/rent/example"), "tenant");
  assert.equal(marketingKind("/", "site_cart"), "tenant");
});
test("referrer/UTM input is bounded and malformed stored attribution rejected", () => {
  const t = captureTouch("https://residence-more.ru/?utm_source=" + "x".repeat(500), "", at);
  assert.equal(t.utm_source.length, 200);
  assert.equal(attributionSchema.safeParse({ version: 1 }).success, false);
});
test("private sections and preview cannot generate live tracking", () => {
  for (const path of [
    "/finance",
    "/hotel",
    "/owner",
    "/system",
    "/crm/leads",
    "/auth",
    "/maintenance",
  ])
    assert.equal(isPublicMarketingPath(path), false);
  assert.equal(isPublicMarketingPath("/rent/house"), true);
  assert.equal(isMarketingHost("preview.residence-more.ru"), false);
  assert.equal(isMarketingHost("rm-os.residence-more.ru"), false);
});
test("report separates clicks, visitors, real forms, chats and legacy unknown leads", () => {
  const report = summarizeMarketing(
    [
      { attribution: first, event_type: "page_view" },
      { attribution: first, event_type: "page_view" },
      { attribution: first, event_type: "phone_click" },
    ],
    [{ attribution: first }, { attribution: null }],
    [{ attribution: first }],
  );
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0]?.visitors, 1);
  assert.equal(report.rows[0]?.views, 2);
  assert.equal(report.rows[0]?.contactClicks, 1);
  assert.equal(report.rows[0]?.leads, 1);
  assert.equal(report.rows[0]?.chats, 1);
  assert.equal(report.unattributedLeads, 1);
});

test("blocked storage and Metrika do not prevent attribution in the current visit", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const location = {
    hostname: "residence-more.ru",
    pathname: "/management",
    href: "https://residence-more.ru/management?utm_source=yandex&utm_medium=cpc&yclid=987",
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location, setTimeout: (fn: () => void) => setTimeout(fn, 1), clearTimeout },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("blocked");
      },
    },
  });
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { referrer: "https://yandex.ru/" },
  });
  try {
    const { getMarketingAttribution } = await import("./site-marketing");
    const first = await getMarketingAttribution("management");
    assert.equal(first?.last_touch.yclid, "987");
    assert.equal(first?.metrika_client_id, "");
    location.pathname = "/contacts";
    location.href = "https://residence-more.ru/contacts";
    const next = await getMarketingAttribution();
    assert.equal(next?.visitor_id, first?.visitor_id);
    assert.equal(next?.last_touch.yclid, "987");
  } finally {
    for (const [name, descriptor] of [
      ["window", previousWindow],
      ["localStorage", previousStorage],
      ["document", previousDocument],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
