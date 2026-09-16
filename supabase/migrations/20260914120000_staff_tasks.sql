-- Канбан задач сотрудников: дата/время, исполнитель, объект, чеклист как отдельные сущности.

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  due_date date,
  due_start text NOT NULL DEFAULT '',
  due_end text NOT NULL DEFAULT '',
  assignee_id uuid,
  created_by uuid,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON public.tasks (status, due_date, position);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON public.tasks (assignee_id, status);
CREATE INDEX IF NOT EXISTS tasks_property_idx ON public.tasks (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_items_task_idx ON public.task_items (task_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_items TO authenticated;
GRANT ALL ON public.tasks TO service_role;
GRANT ALL ON public.task_items TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks' AND policyname = 'tasks_select'
  ) THEN
    CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks' AND policyname = 'tasks_insert'
  ) THEN
    CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks' AND policyname = 'tasks_update'
  ) THEN
    CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks' AND policyname = 'tasks_delete'
  ) THEN
    CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
      USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_items' AND policyname = 'task_items_select'
  ) THEN
    CREATE POLICY "task_items_select" ON public.task_items FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_items' AND policyname = 'task_items_insert'
  ) THEN
    CREATE POLICY "task_items_insert" ON public.task_items FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_items' AND policyname = 'task_items_update'
  ) THEN
    CREATE POLICY "task_items_update" ON public.task_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_items' AND policyname = 'task_items_delete'
  ) THEN
    CREATE POLICY "task_items_delete" ON public.task_items FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS task_items_set_updated_at ON public.task_items;
CREATE TRIGGER task_items_set_updated_at BEFORE UPDATE ON public.task_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_tasks ON public.tasks;
CREATE TRIGGER log_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS log_task_items ON public.task_items;
CREATE TRIGGER log_task_items AFTER INSERT OR UPDATE OR DELETE ON public.task_items
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
