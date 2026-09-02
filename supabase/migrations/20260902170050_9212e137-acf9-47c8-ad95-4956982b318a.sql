GRANT DELETE ON public.complexes TO anon;

CREATE POLICY "Complexes are deletable by app users" ON public.complexes
  FOR DELETE TO anon, authenticated USING (true);