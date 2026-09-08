ALTER TABLE public.complexes ADD COLUMN IF NOT EXISTS show_in_site_filter boolean NOT NULL DEFAULT true;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS sort_order integer;