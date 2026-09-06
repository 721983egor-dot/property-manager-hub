CREATE TABLE public.selections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  client_name text NOT NULL DEFAULT '',
  comment text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.selection_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selection_id uuid NOT NULL REFERENCES public.selections(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (selection_id, property_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.selections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.selection_items TO authenticated;
GRANT SELECT ON public.selections TO anon;
GRANT SELECT ON public.selection_items TO anon;
GRANT ALL ON public.selections TO service_role;
GRANT ALL ON public.selection_items TO service_role;

ALTER TABLE public.selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Selections are readable by app users" ON public.selections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Selections are insertable by app users" ON public.selections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Selections are updatable by app users" ON public.selections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Selections are deletable by app users" ON public.selections FOR DELETE TO authenticated USING (true);
CREATE POLICY "Selections are readable by anonymous users by code" ON public.selections FOR SELECT TO anon USING (true);

CREATE POLICY "Selection items are readable by app users" ON public.selection_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Selection items are insertable by app users" ON public.selection_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Selection items are updatable by app users" ON public.selection_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Selection items are deletable by app users" ON public.selection_items FOR DELETE TO authenticated USING (true);
CREATE POLICY "Selection items are readable by anonymous users" ON public.selection_items FOR SELECT TO anon USING (true);

CREATE TRIGGER selections_set_updated_at BEFORE UPDATE ON public.selections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_selections_code ON public.selections(code);
CREATE INDEX idx_selection_items_selection_id ON public.selection_items(selection_id);
CREATE INDEX idx_selection_items_property_id ON public.selection_items(property_id);
