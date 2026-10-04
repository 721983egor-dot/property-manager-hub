-- Новые блоки (Финансы, Обслуживание): доступ к данным только администратору.
-- Менеджерам (Виктория и др.) открываем только по явной команде Егора.

DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_write" ON public.payments;

CREATE POLICY "payments_admin_all" ON public.payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "maintenance_service_items_select" ON public.maintenance_service_items;
DROP POLICY IF EXISTS "maintenance_service_items_write" ON public.maintenance_service_items;
DROP POLICY IF EXISTS "property_maintenance_services_select" ON public.property_maintenance_services;
DROP POLICY IF EXISTS "property_maintenance_services_write" ON public.property_maintenance_services;

CREATE POLICY "maintenance_service_items_admin_all" ON public.maintenance_service_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "property_maintenance_services_admin_all" ON public.property_maintenance_services
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';
