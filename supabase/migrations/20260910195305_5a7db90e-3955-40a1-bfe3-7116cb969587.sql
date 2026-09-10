CREATE TABLE IF NOT EXISTS public.assistant_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  created_by text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_skills TO authenticated;
GRANT ALL ON public.assistant_skills TO service_role;

ALTER TABLE public.assistant_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assistant_skills_read" ON public.assistant_skills;
CREATE POLICY "assistant_skills_read" ON public.assistant_skills FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "assistant_skills_write" ON public.assistant_skills;
CREATE POLICY "assistant_skills_write" ON public.assistant_skills FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS assistant_skills_set_updated_at ON public.assistant_skills;
CREATE TRIGGER assistant_skills_set_updated_at BEFORE UPDATE ON public.assistant_skills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();