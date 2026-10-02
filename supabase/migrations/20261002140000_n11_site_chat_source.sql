-- Чат с сайта H11 Резиденция (n11-residence.ru) → общий раздел «Чаты» RM OS.
-- source = 'n11' отделяет эти диалоги от чата сайта Резиденция&Море ('site').

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
    CHECK (source IN ('site', 'cian', 'avito', 'n11'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
