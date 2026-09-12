-- Менеджер должен создавать подборки так же, как брони: INSERT разрешён сотрудникам.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.selections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.selection_items TO authenticated;
GRANT SELECT, INSERT ON public.selections TO anon;
GRANT SELECT, INSERT ON public.selection_items TO anon;

ALTER TABLE public.selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Selections are insertable by app users" ON public.selections;
CREATE POLICY "Selections are insertable by app users"
  ON public.selections FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Selection items are insertable by app users" ON public.selection_items;
CREATE POLICY "Selection items are insertable by app users"
  ON public.selection_items FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Selections are readable by app users" ON public.selections;
CREATE POLICY "Selections are readable by app users"
  ON public.selections FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Selection items are readable by app users" ON public.selection_items;
CREATE POLICY "Selection items are readable by app users"
  ON public.selection_items FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
