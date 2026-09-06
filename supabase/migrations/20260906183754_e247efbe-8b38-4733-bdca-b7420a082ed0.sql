GRANT SELECT, INSERT, UPDATE, DELETE ON public.selections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.selection_items TO anon;

CREATE POLICY "Selections are insertable by anonymous users" ON public.selections FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Selections are updatable by anonymous users" ON public.selections FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Selections are deletable by anonymous users" ON public.selections FOR DELETE TO anon USING (true);

CREATE POLICY "Selection items are insertable by anonymous users" ON public.selection_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Selection items are updatable by anonymous users" ON public.selection_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Selection items are deletable by anonymous users" ON public.selection_items FOR DELETE TO anon USING (true);
