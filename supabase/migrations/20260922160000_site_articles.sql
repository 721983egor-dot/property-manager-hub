-- Длинные статьи на публичный сайт (итерация 3).
-- Не зеркало соцпостов: только крупные материалы. Управление — social_owner в RM OS.

CREATE TABLE IF NOT EXISTS public.site_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  title TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  created_by TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'assistant')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Уникальный slug среди непустых (черновик может временно иметь заготовку).
CREATE UNIQUE INDEX IF NOT EXISTS site_articles_slug_unique_idx
  ON public.site_articles (slug)
  WHERE slug <> '';

CREATE INDEX IF NOT EXISTS site_articles_status_published_idx
  ON public.site_articles (status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS site_articles_created_idx
  ON public.site_articles (created_at DESC);

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS article_id UUID REFERENCES public.site_articles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS social_posts_article_idx
  ON public.social_posts (article_id)
  WHERE article_id IS NOT NULL;

GRANT ALL ON public.site_articles TO service_role;

ALTER TABLE public.site_articles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_articles'
      AND policyname = 'site_articles_service_only'
  ) THEN
    CREATE POLICY site_articles_service_only ON public.site_articles
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS site_articles_set_updated_at ON public.site_articles;
CREATE TRIGGER site_articles_set_updated_at
  BEFORE UPDATE ON public.site_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
