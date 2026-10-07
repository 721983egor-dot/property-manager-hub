-- Юридическое лицо, от имени которого зафиксировано обязательство.
ALTER TABLE public.finance_obligations ADD COLUMN IF NOT EXISTS legal_entity text NOT NULL DEFAULT '';
NOTIFY pgrst, 'reload schema';
