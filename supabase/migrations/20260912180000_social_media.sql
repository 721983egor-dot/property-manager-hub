-- Соцсети RM OS: каналы, посты, голос бренда, статистика.
-- Публикация и цифры площадок идут через Postmypost; Макс — канал в RM OS
-- (через webhook Postmypost, если подключён, иначе текст копируется вручную).

CREATE TABLE IF NOT EXISTS public.social_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  postmypost_project_id BIGINT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_brand (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  voice TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '',
  forbidden TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  examples TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'vk', 'telegram', 'max')),
  name TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  postmypost_account_id BIGINT,
  postmypost_channel TEXT NOT NULL DEFAULT '',
  external_url TEXT NOT NULL DEFAULT '',
  last_synced_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (platform)
);

CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  topic TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS public.social_post_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.social_channels(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  postmypost_account_id BIGINT,
  external_url TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  UNIQUE (post_id, channel_id)
);

CREATE TABLE IF NOT EXISTS public.social_post_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.social_channels(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  date DATE NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  UNIQUE (post_id, platform, date)
);

INSERT INTO public.social_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
INSERT INTO public.social_brand (id) VALUES (true) ON CONFLICT DO NOTHING;

INSERT INTO public.social_channels (platform, name) VALUES
  ('instagram', 'Instagram'),
  ('vk', 'ВКонтакте'),
  ('telegram', 'Telegram'),
  ('max', 'Макс')
ON CONFLICT (platform) DO NOTHING;

GRANT ALL ON public.social_settings TO service_role;
GRANT ALL ON public.social_brand TO service_role;
GRANT ALL ON public.social_skills TO service_role;
GRANT ALL ON public.social_channels TO service_role;
GRANT ALL ON public.social_posts TO service_role;
GRANT ALL ON public.social_post_targets TO service_role;
GRANT ALL ON public.social_post_stats TO service_role;

ALTER TABLE public.social_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_brand ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_stats ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'social_settings',
    'social_brand',
    'social_skills',
    'social_channels',
    'social_posts',
    'social_post_targets',
    'social_post_stats'
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

DROP TRIGGER IF EXISTS social_settings_set_updated_at ON public.social_settings;
CREATE TRIGGER social_settings_set_updated_at
  BEFORE UPDATE ON public.social_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS social_brand_set_updated_at ON public.social_brand;
CREATE TRIGGER social_brand_set_updated_at
  BEFORE UPDATE ON public.social_brand
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS social_skills_set_updated_at ON public.social_skills;
CREATE TRIGGER social_skills_set_updated_at
  BEFORE UPDATE ON public.social_skills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS social_channels_set_updated_at ON public.social_channels;
CREATE TRIGGER social_channels_set_updated_at
  BEFORE UPDATE ON public.social_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS social_posts_set_updated_at ON public.social_posts;
CREATE TRIGGER social_posts_set_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS social_posts_status_scheduled_idx
  ON public.social_posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS social_posts_created_idx
  ON public.social_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS social_post_targets_post_idx
  ON public.social_post_targets (post_id);
CREATE INDEX IF NOT EXISTS social_post_stats_date_idx
  ON public.social_post_stats (date DESC);
CREATE INDEX IF NOT EXISTS social_skills_active_idx
  ON public.social_skills (active, created_at);

NOTIFY pgrst, 'reload schema';
