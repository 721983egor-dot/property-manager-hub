ALTER TABLE public.selections ADD COLUMN IF NOT EXISTS saved boolean NOT NULL DEFAULT false;

GRANT UPDATE (saved) ON public.selections TO authenticated;
