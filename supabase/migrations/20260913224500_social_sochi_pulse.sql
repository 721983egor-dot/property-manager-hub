-- Пульс Сочи: погода, новости и события для раздела «Соцсети».
-- Пункты кэшируются, чтобы ИИ опирался на факты и было видно, по какой теме уже есть пост.

CREATE TABLE IF NOT EXISTS public.social_pulse_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('weather', 'news', 'event')),
  fingerprint TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS pulse_item_id UUID REFERENCES public.social_pulse_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS social_pulse_items_kind_fetched_idx
  ON public.social_pulse_items (kind, fetched_at DESC);
CREATE INDEX IF NOT EXISTS social_pulse_items_published_idx
  ON public.social_pulse_items (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS social_posts_pulse_item_idx
  ON public.social_posts (pulse_item_id);

GRANT ALL ON public.social_pulse_items TO service_role;

ALTER TABLE public.social_pulse_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_pulse_items'
      AND policyname = 'social_pulse_items_service_only'
  ) THEN
    CREATE POLICY social_pulse_items_service_only
      ON public.social_pulse_items
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
