-- Выдать social_owner всем текущим администраторам (в т.ч. Егору),
-- чтобы после ужесточения ACL раздел не пропал у тех, кто им уже пользуется.
-- Отдельный файл: новое значение enum нельзя использовать в той же транзакции, что ADD VALUE.
INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, 'social_owner'::public.app_role
FROM public.user_roles ur
WHERE ur.role = 'admin'::public.app_role
ON CONFLICT (user_id, role) DO NOTHING;

NOTIFY pgrst, 'reload schema';
