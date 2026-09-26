-- Поля обслуживания в карточке объекта (инженерия, бассейн, сад)
-- и связь задачи обслуживания с пунктом справочника услуг.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS boiler_kind text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS has_generator boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS air_conditioners_count integer,
  ADD COLUMN IF NOT EXISTS pool_length_m numeric,
  ADD COLUMN IF NOT EXISTS pool_width_m numeric,
  ADD COLUMN IF NOT EXISTS pool_heated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS garden_notes text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.properties.boiler_kind IS 'Котёл: gas | electric | none | пусто';
COMMENT ON COLUMN public.properties.has_generator IS 'Есть ли генератор';
COMMENT ON COLUMN public.properties.air_conditioners_count IS 'Число кондиционеров';
COMMENT ON COLUMN public.properties.pool_length_m IS 'Длина бассейна, м';
COMMENT ON COLUMN public.properties.pool_width_m IS 'Ширина бассейна, м';
COMMENT ON COLUMN public.properties.pool_heated IS 'Подогрев бассейна';
COMMENT ON COLUMN public.properties.garden_notes IS 'Садовые насаждения';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS maintenance_service_item_id uuid
    REFERENCES public.maintenance_service_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_maintenance_service_item_idx
  ON public.tasks (maintenance_service_item_id);

COMMENT ON COLUMN public.tasks.maintenance_service_item_id IS
  'Услуга из справочника обслуживания (для задач типа Обслуживание)';

NOTIFY pgrst, 'reload schema';
