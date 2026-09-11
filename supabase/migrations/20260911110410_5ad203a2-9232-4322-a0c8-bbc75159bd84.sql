ALTER TABLE public.chat_threads
  ADD COLUMN source text NOT NULL DEFAULT 'site',
  ADD COLUMN external_id text,
  ADD COLUMN external_offer_id text,
  ADD COLUMN property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

ALTER TABLE public.chat_threads
  ADD CONSTRAINT chat_threads_source_check CHECK (source IN ('site', 'cian'));

CREATE UNIQUE INDEX chat_threads_source_external_id_unique
  ON public.chat_threads (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX chat_threads_property_id_idx
  ON public.chat_threads (property_id)
  WHERE property_id IS NOT NULL;

ALTER TABLE public.chat_messages
  ADD COLUMN external_id text;

CREATE UNIQUE INDEX chat_messages_thread_external_id_unique
  ON public.chat_messages (thread_id, external_id)
  WHERE external_id IS NOT NULL;