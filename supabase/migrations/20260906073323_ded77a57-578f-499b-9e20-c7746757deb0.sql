GRANT DELETE ON public.properties TO authenticated;
GRANT DELETE ON public.properties TO anon;
CREATE POLICY "Properties are deletable by app users" ON public.properties FOR DELETE TO anon, authenticated USING (true);