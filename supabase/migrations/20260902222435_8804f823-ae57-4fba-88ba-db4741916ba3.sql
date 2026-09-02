ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS comment text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS blacklisted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blacklist_reason text NOT NULL DEFAULT '';