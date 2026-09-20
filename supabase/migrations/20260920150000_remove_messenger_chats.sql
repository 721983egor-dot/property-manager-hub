-- Откат интеграции клиентских ботов Telegram/MAX в чатах.

DROP TABLE IF EXISTS public.messenger_updates;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_threads_source_check'
  ) THEN
    ALTER TABLE public.chat_threads DROP CONSTRAINT chat_threads_source_check;
  END IF;

  -- Удаляем диалоги мессенджеров, иначе CHECK не навесится.
  DELETE FROM public.chat_threads WHERE source IN ('telegram', 'max');

  ALTER TABLE public.chat_threads
    ADD CONSTRAINT chat_threads_source_check
    CHECK (source IN ('site', 'cian', 'avito'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DELETE FROM public.platform_secrets
WHERE name IN (
  'TELEGRAM_CHAT_BOT_TOKEN',
  'MAX_BOT_TOKEN',
  'MAX_WEBHOOK_SECRET',
  'TELEGRAM_CHAT_UPDATES_OFFSET',
  'MAX_UPDATES_MARKER'
);
