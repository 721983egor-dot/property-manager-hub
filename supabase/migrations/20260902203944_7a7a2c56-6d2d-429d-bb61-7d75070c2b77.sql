ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;
UPDATE public.properties SET published = true;