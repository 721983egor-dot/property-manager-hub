-- Роль доступа к разделу «Соцсети» (ACL по роли, не по email).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'social_owner';
