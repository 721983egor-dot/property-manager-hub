-- CRM: воронка «Новые объекты» (intake) рядом со сделками аренды (rental).
-- Плюс тип клиента: РМ / собственник / Н11.

ALTER TABLE public.deal_stages
  ADD COLUMN IF NOT EXISTS pipeline text NOT NULL DEFAULT 'rental';

ALTER TABLE public.deal_fields
  ADD COLUMN IF NOT EXISTS pipeline text NOT NULL DEFAULT 'rental';

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS pipeline text NOT NULL DEFAULT 'rental';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_stages_pipeline_check'
  ) THEN
    ALTER TABLE public.deal_stages
      ADD CONSTRAINT deal_stages_pipeline_check CHECK (pipeline IN ('rental', 'intake'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_fields_pipeline_check'
  ) THEN
    ALTER TABLE public.deal_fields
      ADD CONSTRAINT deal_fields_pipeline_check CHECK (pipeline IN ('rental', 'intake'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_pipeline_check'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_pipeline_check CHECK (pipeline IN ('rental', 'intake'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS deal_stages_pipeline_position_idx
  ON public.deal_stages (pipeline, position);
CREATE INDEX IF NOT EXISTS deal_fields_pipeline_position_idx
  ON public.deal_fields (pipeline, position);
CREATE INDEX IF NOT EXISTS deals_pipeline_stage_idx
  ON public.deals (pipeline, stage_id, position);

-- Поля: уникальный ключ в рамках воронки, а не глобально.
ALTER TABLE public.deal_fields DROP CONSTRAINT IF EXISTS deal_fields_key_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_fields_pipeline_key_key'
  ) THEN
    ALTER TABLE public.deal_fields
      ADD CONSTRAINT deal_fields_pipeline_key_key UNIQUE (pipeline, key);
  END IF;
END $$;

-- Стадии воронки собственников (если ещё нет).
INSERT INTO public.deal_stages (name, color, position, kind, pipeline)
SELECT v.name, v.color, v.position, v.kind, 'intake'
FROM (
  VALUES
    ('Заявка', '#0ea5e9', 0, 'open'),
    ('Осмотр', '#6366f1', 1, 'open'),
    ('Документы', '#f59e0b', 2, 'open'),
    ('На площадках', '#8b5cf6', 3, 'open'),
    ('В работе', '#10b981', 4, 'won'),
    ('Отказ', '#ef4444', 5, 'lost')
) AS v(name, color, position, kind)
WHERE NOT EXISTS (
  SELECT 1 FROM public.deal_stages WHERE pipeline = 'intake'
);

-- Кто клиент: арендатор РМ / собственник / Н11.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS party_kind text NOT NULL DEFAULT 'rm';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_party_kind_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_party_kind_check CHECK (party_kind IN ('rm', 'owner', 'n11'));
  END IF;
END $$;

COMMENT ON COLUMN public.deal_stages.pipeline IS 'rental = сделки аренды; intake = новые объекты (собственники)';
COMMENT ON COLUMN public.deals.pipeline IS 'rental = сделки аренды; intake = новые объекты (собственники)';
COMMENT ON COLUMN public.clients.party_kind IS 'Кто он: rm / owner / n11';
