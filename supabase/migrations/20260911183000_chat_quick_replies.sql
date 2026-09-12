CREATE TABLE IF NOT EXISTS public.chat_quick_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.chat_quick_replies TO service_role;
ALTER TABLE public.chat_quick_replies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_quick_replies'
      AND policyname = 'chat_quick_replies_service_only'
  ) THEN
    CREATE POLICY "chat_quick_replies_service_only"
      ON public.chat_quick_replies
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS chat_quick_replies_set_updated_at ON public.chat_quick_replies;
CREATE TRIGGER chat_quick_replies_set_updated_at
  BEFORE UPDATE ON public.chat_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS chat_quick_replies_position_idx
  ON public.chat_quick_replies (position, created_at);

-- На случай, если ограничение source ещё без Авито.
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
    CHECK (source IN ('site', 'cian', 'avito'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
