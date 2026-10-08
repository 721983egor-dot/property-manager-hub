import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mock } from "node:test";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const uri = pathToFileURL(root).href;
registerHooks({
  resolve(specifier, context, next) {
    let target;
    if (specifier.startsWith("@/")) target = pathToFileURL(root + "src/" + specifier.slice(2)).href;
    else if (specifier.startsWith(".") && context.parentURL?.startsWith(uri))
      target = new URL(specifier, context.parentURL).href;
    if (target) {
      if (!existsSync(fileURLToPath(target)) && existsSync(fileURLToPath(target) + ".ts"))
        target += ".ts";
      return next(target, context);
    }
    return next(specifier, context);
  },
});
let rows = [],
  uploaded = [],
  removed = [],
  mode = "",
  inspected = 0,
  insertCalls = 0;
const admin = {
  storage: {
    from: () => ({
      upload: async (path) => {
        if (mode === "upload-fail" && uploaded.length === 1)
          return { error: { message: "upload failed" } };
        uploaded.push(path);
        return { error: null };
      },
      remove: async (paths) => {
        removed.push(...paths);
        return { error: null };
      },
    }),
  },
  from: () => {
    let selected = "",
      id;
    const q = {
      select(v) {
        selected = v;
        return q;
      },
      eq(k, v) {
        id = v;
        return q;
      },
      order() {
        return q;
      },
      range: async () => ({ data: rows, error: null }),
      limit: async () => ({ data: [{ ref_id: 1024 }], error: null }),
      maybeSingle: async () => ({ data: rows.find((x) => x.id === id) ?? null, error: null }),
      insert: async (record) => {
        insertCalls++;
        if (mode === "insert-fail") return { error: { message: "db failed" } };
        rows.push(record);
        if (mode === "lost-response") return { error: { message: "network lost" } };
        return { error: null };
      },
    };
    return q;
  },
};
mock.module(uri + "src/integrations/supabase/client.server.ts", {
  namedExports: { supabaseAdmin: admin },
});
mock.module(import.meta.resolve("@tanstack/react-start/server"), {
  namedExports: { getRequest: () => new Request("https://rm-os.residence-more.ru/web-action") },
});
mock.module(uri + "src/lib/finance-owner-access.server.ts", {
  namedExports: {
    ownerFinanceAdminClient: async () => {
      if (mode === "unauthorized") throw Error("denied");
    },
  },
});
mock.module(uri + "src/lib/photo-watermark.server.ts", {
  namedExports: {
    overlayPhotoWatermark: async (bytes) => {
      if (mode === "watermark-fail") throw Error("watermark failed");
      return { bytes, contentType: "image/jpeg" };
    },
  },
});
mock.module(uri + "src/lib/property-import/disk.server.ts", {
  namedExports: {
    inspectDiskPhotos: async () => {
      inspected++;
      return {
        files: [{ name: "1.jpg", path: "/1.jpg", md5: "one" }, { name: "2.jpg", path: "/2.jpg", md5: "two" }],
        fingerprint: mode === "changed" ? "b".repeat(64) : "a".repeat(64),
        ignored: 0,
      };
    },
    downloadDiskPhoto: async () => Buffer.from("photo"),
  },
});
const { executeRentalImport } = await import(uri + "src/lib/property-import/import.server.ts");
const input = {
  diskUrl: "https://disk.yandex.ru/d/example",
  title: "Test rental",
  type: "apartment",
  address: "Sochi street 10 apt 2",
  rooms: 2,
  area: 54,
  priceMonth: 80000,
  importId: "11111111-1111-4111-8111-111111111111",
  fingerprint: "a".repeat(64),
  duplicateIds: [],
};
function reset(m = "") {
  rows = [];
  uploaded = [];
  removed = [];
  mode = m;
  inspected = 0;
  insertCalls = 0;
}
reset();
await executeRentalImport(input);
assert.equal(rows.length, 1);
assert.equal(rows[0].published, false);
assert.equal(rows[0].price_month, 80000);
assert.equal(rows[0].portfolio, "rm");
assert.equal(rows[0].photos.length, 2);
assert.equal(rows[0].ref_id, 1025);
assert.equal(removed.length, 0);
await executeRentalImport(input);
assert.equal(rows.length, 1);
assert.equal(uploaded.length, 2);
reset("changed");
await assert.rejects(executeRentalImport(input), /изменился/);
assert.equal(uploaded.length, 0);
assert.equal(rows.length, 0);
reset("unauthorized");
await assert.rejects(executeRentalImport(input), /denied/);
assert.equal(inspected, 0);
reset("upload-fail");
await assert.rejects(executeRentalImport(input), /upload failed/);
assert.equal(rows.length, 0);
assert.deepEqual(removed, uploaded);
reset("watermark-fail");
await assert.rejects(executeRentalImport(input), /watermark failed/);
assert.equal(rows.length, 0);
assert.equal(uploaded.length, 0);
reset("insert-fail");
await assert.rejects(executeRentalImport(input), /db failed/);
assert.equal(rows.length, 0);
assert.deepEqual(removed, uploaded);
reset("lost-response");
await executeRentalImport(input);
assert.equal(rows.length, 1);
assert.equal(removed.length, 0);
assert.equal(rows[0].photos.length, 2);
console.log(
  "PASS: monthly RM draft creation, two photos, idempotency, changed manifest, auth gate, upload/watermark/database cleanup, committed-response-loss recovery",
);

// Exercise the real Telegram callback handler with an isolated database and API.
let actionCalls = 0;
const sent = [];
mock.module(uri + "src/lib/telegram/api.server.ts", {
  namedExports: {
    answerCallbackQuery: async (_id, text) => {
      sent.push(text);
    },
    downloadFile: async () => {
      throw Error("unexpected download");
    },
    editMessageText: async (_chat, _message, text) => {
      sent.push(text);
    },
    sendChatAction: async () => {},
    sendMessage: async (_chat, text) => {
      sent.push(text);
      return { message_id: 1 };
    },
  },
});
mock.module(uri + "src/lib/ai/executors.server.ts", {
  namedExports: {
    executeAssistantAction: async () => {
      actionCalls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "created";
    },
  },
});
let proposal;
function pending() {
  actionCalls = 0;
  sent.length = 0;
  proposal = {
    id: input.importId,
    tool_name: "importRentalFromDisk",
    summary: "Monthly rental",
    input: { ...input, _telegramUserId: 12, _telegramChatId: 12 },
    status: "pending",
  };
}
const propertyFrom = admin.from;
admin.from = (table) => {
  let patch, expectedStatus;
  const response = () => {
    if (table === "telegram_accounts")
      return { data: { id: "account", user_id: "staff", active: true }, error: null };
    if (table === "user_roles") return { data: [{ role: "admin" }], error: null };
    if (table === "telegram_messages") return { data: { id: "message" }, error: null };
    if (table === "ai_action_proposals") {
      if (patch) {
        if (expectedStatus && proposal.status !== expectedStatus)
          return { data: null, error: null };
        Object.assign(proposal, patch);
      }
      return { data: { ...proposal }, error: null };
    }
    throw Error("unexpected table " + table);
  };
  const q = {
    select() {
      return q;
    },
    eq(key, value) {
      if (key === "status") expectedStatus = value;
      return q;
    },
    in() {
      return q;
    },
    update(value) {
      patch = value;
      return q;
    },
    insert() {
      return q;
    },
    maybeSingle: async () => response(),
    single: async () => response(),
    then(resolve) {
      return Promise.resolve(response()).then(resolve);
    },
  };
  return q;
};
const { handleTelegramUpdate } = await import(uri + "src/lib/telegram/assistant.server.ts");
const callback = (kind = "do", user = 12, chat = 12) => ({
  update_id: 1,
  callback_query: {
    id: "callback",
    from: { id: user },
    data: kind + ":" + input.importId,
    message: { message_id: 1, chat: { id: chat } },
  },
});
pending();
await Promise.all([handleTelegramUpdate(callback()), handleTelegramUpdate(callback())]);
assert.equal(actionCalls, 1);
assert.equal(proposal.status, "done");
pending();
await handleTelegramUpdate(callback("do", 13));
assert.equal(actionCalls, 0);
assert.equal(proposal.status, "pending");
pending();
await handleTelegramUpdate(callback("do", 12, 99));
assert.equal(actionCalls, 0);
assert.equal(proposal.status, "pending");
pending();
await handleTelegramUpdate(callback("fix"));
assert.equal(proposal.status, "cancelled");
await handleTelegramUpdate(callback());
assert.equal(actionCalls, 0);
pending();
await handleTelegramUpdate(callback("no"));
assert.equal(proposal.status, "cancelled");
assert.equal(actionCalls, 0);
console.log(
  "PASS: Telegram simultaneous confirmation executes once, author/chat binding, edit invalidates old confirmation, cancellation prevents creation",
);

// Test the actual vision/location orchestrator without network or live model calls.
let copyMode = "",
  generationCalls = 0,
  imageParts = 0;
const cited = "https://example.org/verified-place";
mock.module(import.meta.resolve("ai"), {
  namedExports: {
    Output: { object: (value) => value },
    generateText: async (options) => {
      generationCalls++;
      if (options.system.startsWith("Оцени КАЖДОЕ")) {
        if (copyMode === "selection-fail") throw Error("selection vision unavailable");
        const ids = options.messages[0].content.filter(p => p.type === "text").map(p => Number(p.text.match(/ID (\d+)/)[1]));
        return { output: { photos: (copyMode === "selection-incomplete" ? ids.slice(1) : ids).map(id => ({ id, suitable: copyMode !== "selection-unsuitable", score: 95-id, scene: `room ${id}`, reason: "Хороший свет" })) } };
      }
      if (options.system.startsWith("Собери фотогалерею")) {
        return { output: { ids: JSON.parse(options.prompt).slice(-20).reverse().map(p => p.id) } };
      }
      if (options.messages) {
        imageParts = options.messages[0].content.filter((part) => part.type === "image").length;
        if (copyMode === "vision-fail") throw Error("vision unavailable");
        return {
          output: {
            description: "Квартира с видимой кухонной зоной и диваном.",
            visibleFeatures: ["Кухонная зона", "Диван"],
            questions: ["Уточните, остаётся ли мебель."],
          },
        };
      }
      if (copyMode === "search-fail") throw Error("search unavailable");
      if (!options.tools) assert.ok(JSON.parse(options.prompt).allowedSourceUrls.includes(cited));
      return {
        text: "Адрес подтверждён. Проверенная особенность района.",
        output: {
          addressMatched: true,
          facts: [{ text: "Проверенная особенность района.", sourceUrl: cited }],
          questions: [],
        },
        sources: [],
        toolResults: [
          {
            toolName: "web_search",
            output: { sources: copyMode === "uncited" ? [] : [{ type: "url", url: cited }] },
          },
        ],
      };
    },
  },
});
const provider = Object.assign(() => ({ modelId: "test" }), { tools: { webSearch: () => ({}) } });
mock.module(uri + "src/lib/ai-gateway.server.ts", {
  namedExports: { createDirectOpenAiProvider: () => provider, OPENAI_DEFAULT_MODEL: "test" },
});
mock.module(uri + "src/lib/property-import/vision-image.server.ts", {
  namedExports: { visionJpeg: async (bytes) => bytes },
});
const { draftRentalCopy } = await import(uri + "src/lib/property-import/copy.server.ts");
const originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "test-only";
const inspection = {
  diskUrl: input.diskUrl,
  files: Array.from({ length: 20 }, (_, i) => ({ name: i + ".jpg" })),
  fingerprint: input.fingerprint,
  ignored: 0,
};
copyMode = "";
let copy = await draftRentalCopy(input, inspection);
assert.equal(copy.photosAnalyzed, 6);
assert.equal(imageParts, 6);
assert.match(copy.description, /диваном/);
assert.match(copy.locationDescription, /Проверенная/);
assert.deepEqual(copy.locationSources, [cited]);
copyMode = "uncited";
copy = await draftRentalCopy(input, inspection);
assert.doesNotMatch(copy.locationDescription, /Проверенная/);
assert.equal(copy.locationVerified, false);
copyMode = "vision-fail";
copy = await draftRentalCopy(input, inspection);
assert.equal(copy.photosAnalyzed, 0);
assert.doesNotMatch(copy.description, /диваном/);
assert.ok(copy.questions.some((q) => q.includes("Не удалось")));
copyMode = "search-fail";
copy = await draftRentalCopy(input, inspection);
assert.equal(copy.photosAnalyzed, 6);
assert.equal(copy.locationVerified, false);
assert.doesNotMatch(copy.locationDescription, /Проверенная/);
generationCalls = 0;
copy = await draftRentalCopy(
  {
    ...input,
    description: "Мой согласованный текст",
    locationDescription: "Моя согласованная локация",
  },
  inspection,
);
assert.equal(copy.description, "Мой согласованный текст");
assert.equal(copy.locationDescription, "Моя согласованная локация");
assert.equal(generationCalls, 0);
admin.from = propertyFrom;
const { prepareRentalImport } = await import(uri + "src/lib/property-import/import.server.ts");
reset();
copyMode = "";
const copyProposal = await prepareRentalImport(input);
assert.match(copyProposal.input.description, /диваном/);
assert.match(copyProposal.input.locationDescription, /Проверенная/);
assert.match(copyProposal.summary, /Источник локации/);
assert.equal(rows.length, 0);
await executeRentalImport(copyProposal.input);
assert.equal(rows[0].description, copyProposal.input.description);
assert.equal(rows[0].location_description, copyProposal.input.locationDescription);
if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = originalKey;
console.log(
  "PASS: image parts sent, six-photo sampling, provider-grounded location, vision/search fallback, existing copy preservation, proposal review and confirmed text persistence",
);

// More than 20: actual selection orchestrator must evaluate every image, then preserve cover order.
process.env.OPENAI_API_KEY = "test-only";
copyMode = "";
const { selectRentalPhotos } = await import(uri + "src/lib/property-import/selection.server.ts");
const gallery = { ...inspection, files: Array.from({ length: 41 }, (_, id) => ({ name: `${id}.jpg`, path: `/${id}.jpg`, md5: `${id}` })) };
const selection = await selectRentalPhotos(gallery);
assert.equal(selection.photosAnalyzed, 41);
assert.equal(selection.selectedPaths.length, 20);
assert.equal(selection.selectedPaths[0], "/40.jpg");
assert.equal(selection.rejectedCount, 21);
for (const failed of ["selection-fail", "selection-incomplete", "selection-unsuitable"]) {
  copyMode = failed;
  await assert.rejects(selectRentalPhotos(gallery), /Не удалось|не найдено/);
}
copyMode = "";
reset();
await executeRentalImport({ ...input, selectedPaths: ["/2.jpg"] });
assert.equal(rows[0].photos.length, 1);
assert.equal(uploaded.length, 1);
reset();
await assert.rejects(executeRentalImport({ ...input, selectedPaths: ["/missing.jpg"] }), /отсутствует/);
assert.equal(uploaded.length, 0);
if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
console.log("PASS: all 41 source images evaluated; 20 selected, cover order preserved; only confirmed paths uploaded; missing path rejected before storage");
