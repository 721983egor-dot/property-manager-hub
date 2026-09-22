-- Отдельный поток сторис (итерация 2). Не смешивать с social_posts.
-- Публикация через Postmypost (publication_type = story) там, где API позволяет;
-- иначе заготовка + пометка «опубликовать вручную» (Макс; Telegram при подключении ботом).

CREATE TABLE IF NOT EXISTS public.social_stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  topic TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  from_post_id UUID REFERENCES public.social_posts(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  created_by TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'assistant')),
  postmypost_publication_id BIGINT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_story_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.social_stories(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.social_channels(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  delivery TEXT NOT NULL DEFAULT 'postmypost'
    CHECK (delivery IN ('postmypost', 'manual')),
  postmypost_account_id BIGINT,
  external_url TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  UNIQUE (story_id, channel_id)
);

CREATE TABLE IF NOT EXISTS public.social_story_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.social_stories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  path TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  duration_sec NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0,
  postmypost_file_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.social_stories TO service_role;
GRANT ALL ON public.social_story_targets TO service_role;
GRANT ALL ON public.social_story_media TO service_role;

ALTER TABLE public.social_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_story_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_story_media ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'social_stories',
    'social_story_targets',
    'social_story_media'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_service_only'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || '_service_only',
        t
      );
    END IF;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS social_stories_set_updated_at ON public.social_stories;
CREATE TRIGGER social_stories_set_updated_at
  BEFORE UPDATE ON public.social_stories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS social_stories_status_scheduled_idx
  ON public.social_stories (status, scheduled_at);
CREATE INDEX IF NOT EXISTS social_stories_created_idx
  ON public.social_stories (created_at DESC);
CREATE INDEX IF NOT EXISTS social_stories_from_post_idx
  ON public.social_stories (from_post_id);
CREATE INDEX IF NOT EXISTS social_story_targets_story_idx
  ON public.social_story_targets (story_id);
CREATE INDEX IF NOT EXISTS social_story_media_story_idx
  ON public.social_story_media (story_id, sort_order);

NOTIFY pgrst, 'reload schema';
