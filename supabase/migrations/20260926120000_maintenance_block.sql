-- Блок «Обслуживание»: флаг аренды, справочник услуг, тип задач.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS for_rent boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.properties.for_rent IS
  'Показывать объект в календаре аренды. Дома/виллы обслуживания — только при явном включении.';

-- Справочник пунктов услуг обслуживания (бассейн, сад, уборка…).
CREATE TABLE IF NOT EXISTS public.maintenance_service_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_service_items_position_idx
  ON public.maintenance_service_items (position);

-- Услуги, назначенные объекту обслуживания.
CREATE TABLE IF NOT EXISTS public.property_maintenance_services (
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  service_item_id uuid NOT NULL REFERENCES public.maintenance_service_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, service_item_id)
);

CREATE INDEX IF NOT EXISTS property_maintenance_services_property_idx
  ON public.property_maintenance_services (property_id);
CREATE INDEX IF NOT EXISTS property_maintenance_services_item_idx
  ON public.property_maintenance_services (service_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_service_items TO authenticated;
GRANT ALL ON public.maintenance_service_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_maintenance_services TO authenticated;
GRANT ALL ON public.property_maintenance_services TO service_role;

ALTER TABLE public.maintenance_service_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_maintenance_services ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'maintenance_service_items' AND policyname = 'maintenance_service_items_select'
  ) THEN
    CREATE POLICY "maintenance_service_items_select" ON public.maintenance_service_items
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'maintenance_service_items' AND policyname = 'maintenance_service_items_write'
  ) THEN
    CREATE POLICY "maintenance_service_items_write" ON public.maintenance_service_items
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'property_maintenance_services' AND policyname = 'property_maintenance_services_select'
  ) THEN
    CREATE POLICY "property_maintenance_services_select" ON public.property_maintenance_services
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'property_maintenance_services' AND policyname = 'property_maintenance_services_write'
  ) THEN
    CREATE POLICY "property_maintenance_services_write" ON public.property_maintenance_services
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS maintenance_service_items_set_updated_at ON public.maintenance_service_items;
CREATE TRIGGER maintenance_service_items_set_updated_at
  BEFORE UPDATE ON public.maintenance_service_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_maintenance_service_items ON public.maintenance_service_items;
CREATE TRIGGER log_maintenance_service_items
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_service_items
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS log_property_maintenance_services ON public.property_maintenance_services;
CREATE TRIGGER log_property_maintenance_services
  AFTER INSERT OR UPDATE OR DELETE ON public.property_maintenance_services
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Стартовый справочник услуг.
INSERT INTO public.maintenance_service_items (name, position)
SELECT * FROM (
  VALUES
    ('Бассейн', 0),
    ('Сад', 1),
    ('Уборка территории', 2),
    ('Клининг', 3),
    ('Техническое обслуживание', 4)
) AS seed(name, position)
WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_service_items LIMIT 1);

-- Тип задач «Обслуживание» — виден в общем блоке задач.
INSERT INTO public.task_types (name, color, position)
SELECT 'Обслуживание', '#0d9488', COALESCE((SELECT MAX(position) + 1 FROM public.task_types), 0)
WHERE NOT EXISTS (
  SELECT 1 FROM public.task_types WHERE lower(name) = 'обслуживание'
);

NOTIFY pgrst, 'reload schema';
