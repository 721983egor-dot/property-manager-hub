CREATE TYPE public.listing_platform AS ENUM ('site', 'avito', 'cian');
CREATE TYPE public.property_event_type AS ENUM ('page_view', 'contact_click', 'lead_submit', 'selection_add');

CREATE TABLE public.property_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  platform public.listing_platform NOT NULL,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  unpublished_at timestamptz,
  external_id text NOT NULL DEFAULT '',
  external_url text NOT NULL DEFAULT '',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, platform)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_listings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_listings TO anon;
GRANT ALL ON public.property_listings TO service_role;

ALTER TABLE public.property_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Listings are readable by app users" ON public.property_listings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Listings are insertable by app users" ON public.property_listings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Listings are updatable by app users" ON public.property_listings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Listings are deletable by app users" ON public.property_listings FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER property_listings_set_updated_at BEFORE UPDATE ON public.property_listings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.property_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  event_type public.property_event_type NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  visitor_hash text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'site',
  referrer text NOT NULL DEFAULT ''
);

GRANT SELECT ON public.property_events TO authenticated;
GRANT SELECT ON public.property_events TO anon;
GRANT ALL ON public.property_events TO service_role;

ALTER TABLE public.property_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events are readable by app users" ON public.property_events FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX property_events_property_time_idx ON public.property_events (property_id, occurred_at DESC);
CREATE INDEX property_events_time_idx ON public.property_events (occurred_at DESC);
CREATE INDEX property_events_dedupe_idx ON public.property_events (property_id, event_type, visitor_hash, occurred_at DESC);