ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS land_area numeric;
UPDATE public.properties SET type = 'house' WHERE type = 'villa';