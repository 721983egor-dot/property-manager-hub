ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS area numeric,
  ADD COLUMN IF NOT EXISTS outdoor_spaces text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS appliances text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bathroom_features text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS utilities_month numeric;