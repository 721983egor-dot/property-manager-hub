ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS extra_features text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS location_description text NOT NULL DEFAULT ''::text;