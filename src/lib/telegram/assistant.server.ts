/** Обработка сообщений Telegram Ассистентом RM OS. Только сервер. */

import { Buffer } from "node:buffer";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AssistantAction, AssistantChatMessage } from "@/lib/ai/types";
import { absolutizeLinks, firstSelectionUrl } from "@/lib/telegram/links.server";
import {
  answerCallbackQuery,
  downloadFile,
  editMessageText,
  sendChatAction,
  sendMessage,
  type InlineKeyboard,
} from "@/lib/telegram/api.server";

const HISTORY_LIMIT = 20;

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TgFile = { file_id: string; duration?: number; file_size?: number };
type TgMessage = {
  message_id: number;
  chat: { id: number };
  from?: TgUser;
  text?: string;
  caption?: string;
  voice?: TgFile;
  audio?: TgFile;
  video_note?: TgFile;
};
/** Медиа, заранее скачанное telegram-poller (обход нестабильного fetch к api.telegram.org из Node). */
export type RmOsMedia = {
  file_id: string;
  path: string;
  base64: string;
  bytes?: number;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: { message_id: number; chat: { id: number }; text?: string };
  };
  _rm_os_media?: RmOsMedia;
};

async function openAiKey(): Promise<string> {
  const key = (process.env["OPENAI_API_KEY"] ?? "").trim();
  if (!key) {
    throw new Error("Нет OPENAI_API_KEY на сервере Бегета — распознавание голоса недоступно");
  }
  return key;
}

function openAiBase(): string {
  return (process.env["OPENAI_BASE_URL"] || "https://api.openai.com/v1").replace(/\/$/, "");
}

/* ---------------------------------- доступ --------------------------------- */

type Account = { id: string; telegram_user_id: number; chat_id: number; active: boolean };

async function findAccount(telegramUserId: number): Promise<Account | null> {
  const { data } = await supabaseAdmin
    .from("telegram_accounts")
    .select("id, telegram_user_id, chat_id, active")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return (data as Account | null) ?? null;
}

async function tryLinkByCode(code: string, from: TgUser, chatId: number): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) return false;
  const { data: row } = await supabaseAdmin
    .from("telegram_link_codes")
    .select("code, user_id, expires_at, used_at")
    .eq("code", normalized)
    .maybeSingle();
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return false;

  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ");
  await supabaseAdmin.from("telegram_accounts").upsert(
    {
      telegram_user_id: from.id,
      chat_id: chatId,
      display_name: displayName,
      username: from.username ?? "",
      user_id: row.user_id,
      active: true,
    },
    { onConflict: "telegram_user_id" },
  );
  await supabaseAdmin
    .from("telegram_link_codes")
    .update({ used_at: new Date().toISOString(), used_by_telegram_id: from.id })
    .eq("code", normalized);
  return true;
}

/* --------------------------------- история --------------------------------- */

async function loadHistory(chatId: number): Promise<AssistantChatMessage[]> {
  const { data } = await supabaseAdmin
    .from("telegram_messages")
    .select("role, content, created_at")
    .eq("chat_id", chatId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  return ((data ?? []) as { role: string; content: string }[])
    .reverse()
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
}

async function saveMessage(chatId: number, role: string, content: string, transcript = "") {
  const { data } = await supabaseAdmin
    .from("telegram_messages")
    .insert({ chat_id: chatId, role, content, transcript })
    .select("id")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

/* ------------------------------ распознавание ------------------------------ */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function transcribe(bytes: ArrayBuffer | Uint8Array, fileName: string): Promise<string> {
  const key = await openAiKey();
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const form = new FormData();
      form.append("file", new File([payload], fileName, { type: "audio/ogg" }));
      form.append("model", "whisper-1");
      form.append("language", "ru");
      const response = await fetch(`${openAiBase()}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      const text = await response.text();
      if (!response.ok) {
        console.error(`Transcription failed [${response.status}]: ${text}`);
        lastErr = `Не удалось расшифровать аудио [${response.status}]`;
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return (JSON.parse(text) as { text?: string }).text?.trim() ?? "";
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "ошибка Whisper";
      console.error(`Transcription attempt ${attempt + 1} failed:`, lastErr);
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(lastErr || "Не удалось расшифровать аудио");
}

/** Короткие тезисы задачи по расшифровке (1–3 пункта). */
async function briefOf(transcript: string): Promise<string> {
  try {
    const key = await openAiKey();
    const model = process.env["OPENAI_MODEL"] || "gpt-4.1";
    const response = await fetch(`${openAiBase()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Ты сокращаешь голосовое сообщение менеджера по аренде до сути задачи. Ответь по-русски 1–3 очень короткими пунктами, каждый с новой строки и с символом «• » в начале. Только суть задачи или вопроса, без вступлений и без пересказа целиком.",
          },
          { role: "user", content: transcript },
        ],
      }),
    });
    if (!response.ok) return "";
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

/* -------------------------------- Ассистент -------------------------------- */

async function runAssistant(messages: AssistantChatMessage[]) {
  const { askAssistantCore } = await import("@/lib/ai/run.server");
  return askAssistantCore(messages);
}

async function storeProposal(action: AssistantAction) {
  const { data, error } = await supabaseAdmin
    .from("ai_action_proposals")
    .insert({
      tool_name: action.tool,
      summary: action.summary,
      input: JSON.parse(action.input || "{}") as never,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось сохранить предложение");
  return (data as { id: string }).id;
}

async function sendAssistantReply(chatId: number, messages: AssistantChatMessage[]) {
  const reply = await runAssistant(messages);
  if (reply.error) {
    await sendMessage(chatId, `Не удалось получить ответ: ${reply.error}`);
    return;
  }
  const text = absolutizeLinks(reply.text || "Готово.");
  await saveMessage(chatId, "assistant", text);
  const selectionUrl = firstSelectionUrl(text);
  await sendMessage(
    chatId,
    text,
    selectionUrl ? [[{ text: "Открыть подборку", url: selectionUrl }]] : undefined,
  );

  for (const action of reply.actions) {
    try {
      const id = await storeProposal(action);
      const keyboard: InlineKeyboard = [
        [
          { text: "✅ Подтвердить", callback_data: `do:${id}` },
          { text: "✖️ Отмена", callback_data: `no:${id}` },
        ],
      ];
      await sendMessage(chatId, `Подтвердить действие?\n${action.summary}`, keyboard);
    } catch (e) {
      console.error("storeProposal failed", e);
      await sendMessage(
        chatId,
        `Не удалось сохранить предложение «${action.summary}»: ${e instanceof Error ? e.message : "ошибка"}`,
      );
    }
  }
}

/* ------------------------------- обработчики ------------------------------- */

const HELP =
  "Я Ассистент RM OS. Напишите вопрос текстом или отправьте голосовое — отвечу по данным системы.\n" +
  "Любое изменение я только предлагаю: подтвердите кнопкой.\n" +
  "Команда /reset — начать диалог заново.";

async function handleMessage(message: TgMessage, preloaded?: RmOsMedia) {
  const chatId = message.chat.id;
  const from = message.from;
  if (!from) return;

  const rawText = (message.text ?? message.caption ?? "").trim();
  const account = await findAccount(from.id);

  if (!account || !account.active) {
    if (rawText && (await tryLinkByCode(rawText.replace(/^\/start\s*/i, ""), from, chatId))) {
      await sendMessage(chatId, `Доступ открыт. ${HELP}`);
      return;
    }
    await sendMessage(
      chatId,
      "Доступ к Ассистенту закрыт. Получите код привязки в RM OS (Настройки → Telegram) и отправьте его сюда одним сообщением.",
    );
    return;
  }

  await supabaseAdmin
    .from("telegram_accounts")
    .update({ chat_id: chatId, last_seen_at: new Date().toISOString() })
    .eq("id", account.id);

  if (/^\/start\b/.test(rawText)) {
    await sendMessage(chatId, HELP);
    return;
  }
  if (/^\/reset\b/.test(rawText)) {
    await supabaseAdmin.from("telegram_messages").delete().eq("chat_id", chatId);
    await sendMessage(chatId, "Диалог очищен. Слушаю вас.");
    return;
  }

  const audio = message.voice ?? message.audio ?? message.video_note;
  let userText = rawText;

  if (audio) {
    await sendChatAction(chatId);
    if ((audio.duration ?? 0) > 600) {
      await sendMessage(chatId, "Голосовое слишком длинное — запишите, пожалуйста, до 10 минут.");
      return;
    }
    let transcript = "";
    try {
      let bytes: ArrayBuffer | Uint8Array;
      let path: string;
      if (preloaded?.base64 && (!preloaded.file_id || preloaded.file_id === audio.file_id)) {
        bytes = Buffer.from(preloaded.base64, "base64");
        path = preloaded.path || "voice.ogg";
      } else {
        const downloaded = await downloadFile(audio.file_id);
        bytes = downloaded.bytes;
        path = downloaded.path;
      }
      const ext = path.split(".").pop() || "ogg";
      transcript = await transcribe(bytes, `voice.${ext}`);
    } catch (e) {
      console.error("voice transcribe failed", e);
      await sendMessage(
        chatId,
        `Не удалось разобрать голосовое: ${e instanceof Error ? e.message : "ошибка"}. Попробуйте записать ещё раз или напишите текстом.`,
      );
      return;
    }
    if (!transcript) {
      await sendMessage(chatId, "В записи не слышно речи — попробуйте записать ещё раз.");
      return;
    }
    const brief = (await briefOf(transcript)) || `• ${transcript.slice(0, 200)}`;
    const stored = await saveMessage(chatId, "voice", brief, transcript);
    await sendMessage(chatId, `🎧 Задача:\n${brief}`, [
      [{ text: "Показать текст", callback_data: `tx:${stored}` }],
    ]);
    userText = transcript;
  }

  if (!userText) return;

  await sendChatAction(chatId);
  await saveMessage(chatId, "user", userText);
  const history = await loadHistory(chatId);
  try {
    await sendAssistantReply(chatId, history);
  } catch (e) {
    console.error("assistant reply failed", e);
    await sendMessage(chatId, `Ошибка Ассистента: ${e instanceof Error ? e.message : "неизвестно"}`);
  }
}

async function handleCallback(query: NonNullable<TgUpdate["callback_query"]>) {
  const data = query.data ?? "";
  const chatId = query.message?.chat.id;
  if (!chatId) {
    await answerCallbackQuery(query.id);
    return;
  }
  const account = await findAccount(query.from.id);
  if (!account || !account.active) {
    await answerCallbackQuery(query.id, "Нет доступа");
    return;
  }

  const [kind, id] = data.split(":");

  if (kind === "tx" && id) {
    const { data: row } = await supabaseAdmin
      .from("telegram_messages")
      .select("transcript")
      .eq("id", id)
      .maybeSingle();
    await answerCallbackQuery(query.id);
    const transcript = (row as { transcript?: string } | null)?.transcript;
    await sendMessage(chatId, transcript ? `📝 Расшифровка:\n${transcript}` : "Текст не найден.");
    return;
  }

  if (kind === "no" && id) {
    await supabaseAdmin
      .from("ai_action_proposals")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "pending");
    await answerCallbackQuery(query.id, "Отменено");
    if (query.message) await editMessageText(chatId, query.message.message_id, "✖️ Действие отменено");
    return;
  }

  if (kind === "do" && id) {
    const { data: row } = await supabaseAdmin
      .from("ai_action_proposals")
      .select("id, tool_name, summary, input, status")
      .eq("id", id)
      .maybeSingle();
    const proposal = row as
      | { tool_name: string; summary: string; input: unknown; status: string }
      | null;
    if (!proposal) {
      await answerCallbackQuery(query.id, "Предложение не найдено");
      return;
    }
    if (proposal.status !== "pending") {
      await answerCallbackQuery(query.id, "Уже обработано");
      return;
    }
    await answerCallbackQuery(query.id, "Выполняю…");
    try {
      const { executeAssistantAction } = await import("@/lib/ai/executors.server");
      const message = await executeAssistantAction(
        proposal.tool_name,
        proposal.summary,
        JSON.stringify(proposal.input ?? {}),
      );
      await supabaseAdmin
        .from("ai_action_proposals")
        .update({ status: "done", result: message, confirmed_at: new Date().toISOString() })
        .eq("id", id);
      if (query.message)
        await editMessageText(chatId, query.message.message_id, `✅ ${proposal.summary}`);
      const resultText = absolutizeLinks(message);
      const selectionUrl = firstSelectionUrl(resultText);
      await sendMessage(
        chatId,
        resultText,
        selectionUrl ? [[{ text: "Открыть подборку", url: selectionUrl }]] : undefined,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось выполнить";
      await supabaseAdmin
        .from("ai_action_proposals")
        .update({ status: "failed", result: message })
        .eq("id", id);
      await sendMessage(chatId, `Не удалось выполнить: ${message}`);
    }
  }
}

/** Точка входа вебхука. */
export async function handleTelegramUpdate(update: TgUpdate) {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
  const message = update.message ?? update.edited_message;
  if (message) await handleMessage(message, update._rm_os_media);
}
