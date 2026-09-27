-- Источник, Telegram и объект обращения в карточке клиента (как в сделке).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS telegram text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_property_id_idx ON public.clients (property_id);

COMMENT ON COLUMN public.clients.source IS 'Источник обращения (как в сделке): Сайт, Авито, ЦИАН и т.д.';
COMMENT ON COLUMN public.clients.telegram IS 'Аккаунт Telegram клиента (@username)';
COMMENT ON COLUMN public.clients.property_id IS 'По какому объекту обратился клиент';
