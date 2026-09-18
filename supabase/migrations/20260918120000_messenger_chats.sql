-- Чаты Telegram и MAX в общем разделе «Чаты» RM OS.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_threads_source_check'
  ) THEN
    ALTER TABLE public.chat_threads DROP CONSTRAINT chat_threads_source_check;
  END IF;
  ALTER TABLE public.chat_threads
    ADD CONSTRAINT chat_threads_source_check
    CHECK (source IN ('site', 'cian', 'avito', 'telegram', 'max'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Идемпотентность вебхуков клиентских ботов (отдельно от Ассистента).
CREATE TABLE IF NOT EXISTS public.messenger_updates (
  source TEXT NOT NULL CHECK (source IN ('telegram', 'max')),
  update_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, update_id)
);

GRANT ALL ON public.messenger_updates TO service_role;
ALTER TABLE public.messenger_updates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messenger_updates'
      AND policyname = 'messenger_updates_service_only'
  ) THEN
    CREATE POLICY "messenger_updates_service_only"
      ON public.messenger_updates
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
