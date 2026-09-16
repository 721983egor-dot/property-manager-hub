-- Медиа постов соцсетей: фото и видео под лимиты Postmypost / Instagram / Telegram / VK.
-- Файлы лежат в бакете property-photos с префиксом social/.

CREATE TABLE IF NOT EXISTS public.social_post_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS social_post_media_post_idx
  ON public.social_post_media (post_id, sort_order);

GRANT ALL ON public.social_post_media TO service_role;

ALTER TABLE public.social_post_media ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_post_media'
      AND policyname = 'social_post_media_service_only'
  ) THEN
    CREATE POLICY social_post_media_service_only
      ON public.social_post_media
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
