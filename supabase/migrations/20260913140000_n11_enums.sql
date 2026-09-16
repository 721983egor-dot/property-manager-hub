-- Роль собственника апарт-отеля и источники коротких броней.
-- Отдельный файл: новое значение enum нельзя использовать в той же транзакции на старых Postgres.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE public.booking_source ADD VALUE IF NOT EXISTS 'bnovo';
ALTER TYPE public.booking_source ADD VALUE IF NOT EXISTS 'booking_com';
ALTER TYPE public.booking_source ADD VALUE IF NOT EXISTS 'ostrovok';
ALTER TYPE public.booking_source ADD VALUE IF NOT EXISTS 'walkin';
