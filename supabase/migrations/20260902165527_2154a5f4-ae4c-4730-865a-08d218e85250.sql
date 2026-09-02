CREATE TABLE public.complexes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  main_photo text,
  infrastructure text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complexes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.complexes TO anon;
GRANT ALL ON public.complexes TO service_role;

ALTER TABLE public.complexes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Complexes are readable by app users" ON public.complexes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Complexes are insertable by app users" ON public.complexes
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Complexes are updatable by app users" ON public.complexes
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER complexes_set_updated_at
  BEFORE UPDATE ON public.complexes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.complexes (name)
SELECT DISTINCT btrim(complex_name)
FROM public.properties
WHERE btrim(complex_name) <> '';

UPDATE public.properties p
SET complex_id = c.id
FROM public.complexes c
WHERE btrim(p.complex_name) = c.name AND p.complex_id IS NULL;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_complex_id_fkey
  FOREIGN KEY (complex_id) REFERENCES public.complexes(id) ON DELETE SET NULL;

CREATE INDEX properties_complex_id_idx ON public.properties (complex_id);