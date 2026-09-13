-- Telegram и удобный мессенджер в карточке сделки.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS telegram text NOT NULL DEFAULT '';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS preferred_messenger text NOT NULL DEFAULT '';
