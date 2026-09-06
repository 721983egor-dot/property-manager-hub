-- 1. Подключения площадок
CREATE TABLE public.platform_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform listing_platform NOT NULL UNIQUE,
  account_label text NOT NULL DEFAULT '',
  account_id text NOT NULL DEFAULT '',
  connected_at timestamp with time zone,
  last_checked_at timestamp with time zone,
  last_error text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_credentials TO anon;
GRANT ALL ON public.platform_credentials TO service_role;

ALTER TABLE public.platform_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform credentials are readable by app users"
  ON public.platform_credentials FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Platform credentials are insertable by app users"
  ON public.platform_credentials FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Platform credentials are updatable by app users"
  ON public.platform_credentials FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Platform credentials are deletable by app users"
  ON public.platform_credentials FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER platform_credentials_set_updated_at
  BEFORE UPDATE ON public.platform_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Статус синхронизации в журнале публикаций
ALTER TABLE public.property_listings
  ADD COLUMN sync_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN sync_error text NOT NULL DEFAULT '';

-- 3. Статистика площадок по дням
CREATE TABLE public.listing_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  platform listing_platform NOT NULL,
  date date NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  contact_views integer NOT NULL DEFAULT 0,
  calls integer NOT NULL DEFAULT 0,
  messages integer NOT NULL DEFAULT 0,
  favorites integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (property_id, platform, date)
);

CREATE INDEX listing_stats_property_date_idx
  ON public.listing_stats (property_id, platform, date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_stats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_stats TO anon;
GRANT ALL ON public.listing_stats TO service_role;

ALTER TABLE public.listing_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Listing stats are readable by app users"
  ON public.listing_stats FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Listing stats are insertable by app users"
  ON public.listing_stats FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Listing stats are updatable by app users"
  ON public.listing_stats FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Listing stats are deletable by app users"
  ON public.listing_stats FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER listing_stats_set_updated_at
  BEFORE UPDATE ON public.listing_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Сообщения с площадок
CREATE TABLE public.listing_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  platform listing_platform NOT NULL,
  external_chat_id text NOT NULL DEFAULT '',
  external_message_id text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'in',
  body text NOT NULL DEFAULT '',
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (platform, external_message_id)
);

CREATE INDEX listing_messages_property_idx
  ON public.listing_messages (property_id, sent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_messages TO anon;
GRANT ALL ON public.listing_messages TO service_role;

ALTER TABLE public.listing_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Listing messages are readable by app users"
  ON public.listing_messages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Listing messages are insertable by app users"
  ON public.listing_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Listing messages are updatable by app users"
  ON public.listing_messages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Listing messages are deletable by app users"
  ON public.listing_messages FOR DELETE TO anon, authenticated USING (true);