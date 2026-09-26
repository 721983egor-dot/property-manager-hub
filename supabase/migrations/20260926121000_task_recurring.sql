-- Регулярные задачи: повтор (день/неделя/месяц) и срок жизни (до какой даты действуют повторения).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'weekly';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_until date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_recurrence_check'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_recurrence_check
      CHECK (recurrence IN ('daily', 'weekly', 'monthly'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tasks_recurring_idx
  ON public.tasks (is_recurring, recurrence_until)
  WHERE is_recurring = true;
