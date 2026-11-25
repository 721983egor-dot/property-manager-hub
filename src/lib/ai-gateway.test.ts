import assert from "node:assert/strict";
import test from "node:test";
import { generateText, Output, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import {
  assistantConnection,
  resolveAssistantModel,
  resolveEmployeeModel,
} from "./ai-gateway.server";

const env = {
  ASSISTANT_PROVIDER: "yandex",
  YANDEX_AI_API_KEY: "test-yandex-key",
  YANDEX_AI_FOLDER_ID: "test-folder",
  // Deliberately present: never use an old OpenAI key as a Yandex fallback.
  OPENAI_API_KEY: "test-openai-key",
  OPENAI_BASE_URL: "https://unused.invalid/v1",
};

test("AI employees default to OpenAI even when the main assistant uses Yandex", () => {
  const missing = resolveEmployeeModel({ ...env, OPENAI_API_KEY: "" });
  assert.ok("error" in missing);
  const configured = resolveEmployeeModel({ ...env, AI_EMPLOYEES_OPENAI_MODEL: "gpt-4.1" });
  assert.ok(!("error" in configured));
  assert.equal(configured.source, "openai");
  assert.equal(configured.model.modelId, "gpt-4.1");
});

test("AI employees can use Yandex independently of the main assistant", () => {
  const employeeEnv = {
    ...env,
    ASSISTANT_PROVIDER: "openai",
    OPENAI_API_KEY: "",
    AI_EMPLOYEES_PROVIDER: "yandex",
  };
  const configured = resolveEmployeeModel(employeeEnv);
  assert.ok(!("error" in configured));
  assert.equal(configured.source, "yandex");
  assert.equal(configured.model.modelId, "gpt://test-folder/aliceai-llm-flash");
  assert.ok("error" in resolveAssistantModel(employeeEnv));
  assert.ok("error" in resolveEmployeeModel({ ...employeeEnv, YANDEX_AI_API_KEY: "" }));
});

function configured(fetcher: typeof fetch) {
  const setup = resolveAssistantModel(env, fetcher);
  if ("error" in setup) throw Error(setup.error);
  assert.equal(setup.source, "yandex");
  return setup.model;
}

function response(message: object, reason = "stop") {
  return Response.json({
    id: "test-only",
    object: "chat.completion",
    created: 1,
    model: "gpt://test-folder/aliceai-llm-flash",
    choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: reason }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
}

test("AI employees send only the gateway key to the configured Chat Completions endpoint", async () => {
  const gatewayEnv = {
    ...env,
    AI_EMPLOYEES_PROVIDER: "gateway",
    AI_EMPLOYEES_GATEWAY_URL: "https://gateway.example/v1/",
    AI_EMPLOYEES_GATEWAY_KEY: "test-virtual-key",
    AI_EMPLOYEES_OPENAI_MODEL: "employee-model",
  };
  const setup = resolveEmployeeModel(gatewayEnv, async (url, init) => {
    assert.equal(String(url), "https://gateway.example/v1/chat/completions");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer test-virtual-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "employee-model");
    return response({ content: "Готово" });
  });
  assert.ok(!("error" in setup));
  assert.equal(setup.source, "gateway");
  const result = await generateText({ model: setup.model, prompt: "Проверка", maxRetries: 0 });
  assert.equal(result.text, "Готово");

  for (const override of [
    { AI_EMPLOYEES_GATEWAY_URL: "http://gateway.example/v1" },
    { AI_EMPLOYEES_GATEWAY_URL: "https://user:password@gateway.example/v1" },
    { AI_EMPLOYEES_GATEWAY_URL: "https://gateway.example/v1?token=secret" },
    { AI_EMPLOYEES_GATEWAY_KEY: "" },
    { AI_EMPLOYEES_OPENAI_MODEL: "" },
  ]) {
    assert.ok("error" in resolveEmployeeModel({ ...gatewayEnv, ...override }));
  }
});

test("invalid or incomplete Yandex configuration never falls back to OpenAI", () => {
  for (const override of [
    { YANDEX_AI_API_KEY: "" },
    { YANDEX_AI_FOLDER_ID: "" },
    { YANDEX_AI_MODEL: "gpt://different-folder/model" },
    { YANDEX_AI_FOLDER_ID: "folder/other" },
    { ASSISTANT_PROVIDER: "typo" },
  ]) {
    assert.ok("error" in resolveAssistantModel({ ...env, ...override }));
  }
  const openai = assistantConnection({ OPENAI_API_KEY: "old-key" });
  assert.ok(!("error" in openai));
  assert.equal(openai.source, "openai");
  assert.equal(openai.modelId, "gpt-4.1");
});

test("Yandex uses Chat Completions, its own key, folder, and disabled logging", async () => {
  const model = configured(async (url, init) => {
    assert.equal(String(url), "https://ai.api.cloud.yandex.net/v1/chat/completions");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Api-Key test-yandex-key");
    assert.equal(headers.get("openai-project"), "test-folder");
    assert.equal(headers.get("x-data-logging-enabled"), "false");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt://test-folder/aliceai-llm-flash");
    return response({ content: "Готово" });
  });
  const result = await generateText({ model, prompt: "Проверка", maxRetries: 0 });
  assert.equal(result.text, "Готово");
});

test("read tool round trip passes its result back to the selected model", async () => {
  let calls = 0;
  const model = configured(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (++calls === 1) {
      assert.ok(
        body.tools.some((t: { function: { name: string } }) => t.function.name === "getBalance"),
      );
      return response(
        {
          content: null,
          tool_calls: [
            {
              id: "read-1",
              type: "function",
              function: { name: "getBalance", arguments: "{}" },
            },
          ],
        },
        "tool_calls",
      );
    }
    assert.ok(
      body.messages.some(
        (m: { role: string; content: string }) => m.role === "tool" && m.content.includes("12345"),
      ),
    );
    return response({ content: "Баланс: 12 345 ₽" });
  });
  const result = await generateText({
    model,
    prompt: "Покажи баланс",
    maxRetries: 0,
    stopWhen: stepCountIs(3),
    tools: {
      getBalance: tool({ inputSchema: z.object({}), execute: async () => ({ balance: 12345 }) }),
    },
  });
  assert.equal(calls, 2);
  assert.match(result.text, /12 345/);
});

test("structured output for manager drafts is validated by the existing schema", async () => {
  const model = configured(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.response_format.type, "json_schema");
    return response({ content: JSON.stringify({ reply: "Уточните срок аренды" }) });
  });
  const result = await generateText({
    model,
    prompt: "Подготовь ответ",
    maxRetries: 0,
    output: Output.object({ schema: z.object({ reply: z.string() }) }),
  });
  assert.equal(result.output.reply, "Уточните срок аренды");
});

test("streaming assistant text is consumed through the existing SDK", async () => {
  const model = configured(async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).stream, true);
    const chunk = (delta: object, finish_reason: string | null) =>
      `data: ${JSON.stringify({
        id: "stream-test",
        object: "chat.completion.chunk",
        created: 1,
        model: "aliceai-llm-flash",
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`;
    return new Response(
      chunk({ role: "assistant", content: "Найдено" }, null) +
        chunk({}, "stop") +
        "data: [DONE]\n\n",
      {
        headers: { "Content-Type": "text/event-stream" },
      },
    );
  });
  assert.equal(await streamText({ model, prompt: "Найди объект", maxRetries: 0 }).text, "Найдено");
});
