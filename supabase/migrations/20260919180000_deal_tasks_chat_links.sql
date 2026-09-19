-- Связь задачи со сделкой и чата с клиентом/сделкой.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_deal_id_idx ON public.tasks (deal_id);

ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_threads_client_id_idx ON public.chat_threads (client_id);
CREATE INDEX IF NOT EXISTS chat_threads_deal_id_idx ON public.chat_threads (deal_id);
