-- Типы задач с цветами для канбана и календаря.

CREATE TABLE IF NOT EXISTS public.task_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#3b82f6',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_type_id uuid REFERENCES public.task_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_type_idx ON public.tasks (task_type_id);
CREATE INDEX IF NOT EXISTS task_types_position_idx ON public.task_types (position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_types TO authenticated;
GRANT ALL ON public.task_types TO service_role;

ALTER TABLE public.task_types ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_types' AND policyname = 'task_types_select'
  ) THEN
    CREATE POLICY "task_types_select" ON public.task_types FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_types' AND policyname = 'task_types_write'
  ) THEN
    CREATE POLICY "task_types_write" ON public.task_types FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS task_types_set_updated_at ON public.task_types;
CREATE TRIGGER task_types_set_updated_at BEFORE UPDATE ON public.task_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_task_types ON public.task_types;
CREATE TRIGGER log_task_types AFTER INSERT OR UPDATE OR DELETE ON public.task_types
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Стартовый набор, если типов ещё нет.
INSERT INTO public.task_types (name, color, position)
SELECT * FROM (
  VALUES
    ('Встреча', '#ef4444', 0),
    ('Объект', '#3b82f6', 1),
    ('Документы', '#8b5cf6', 2),
    ('Звонок', '#10b981', 3),
    ('Другое', '#64748b', 4)
) AS seed(name, color, position)
WHERE NOT EXISTS (SELECT 1 FROM public.task_types LIMIT 1);
