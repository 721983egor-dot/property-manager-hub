/**
 * Раньше здесь подтягивались ключи через сервер Lovable.
 * Теперь Telegram и ИИ работают только с переменными на Бегете:
 * TELEGRAM_BOT_TOKEN, OPENAI_API_KEY (OPENAI_BASE_URL по необходимости).
 * Файл оставлен пустым-совместимым, чтобы старые импорты не ломали сборку.
 */

export type TelegramRuntimeCredentials = {
  /** @deprecated не используется */
  lovableApiKey?: string;
  telegramApiKey?: string;
};

export async function loadTelegramRuntimeCredentials(): Promise<TelegramRuntimeCredentials | null> {
  return null;
}

export async function saveTelegramRuntimeCredentials(
  _credentials: TelegramRuntimeCredentials,
): Promise<void> {
  /* no-op: секреты только в .env на Бегете */
}
