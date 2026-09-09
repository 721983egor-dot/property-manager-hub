CREATE TABLE public.deal_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_stages TO authenticated;
GRANT ALL ON public.deal_stages TO service_role;
ALTER TABLE public.deal_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stages_read" ON public.deal_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "stages_write" ON public.deal_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.deal_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options text[] NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  show_in_card boolean NOT NULL DEFAULT true,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_fields TO authenticated;
GRANT ALL ON public.deal_fields TO service_role;
ALTER TABLE public.deal_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fields_read" ON public.deal_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "fields_write" ON public.deal_fields FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  stage_id uuid NOT NULL REFERENCES public.deal_stages(id),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  responsible_id uuid,
  source text NOT NULL DEFAULT '',
  budget numeric,
  adults integer NOT NULL DEFAULT 0,
  children integer NOT NULL DEFAULT 0,
  comment text NOT NULL DEFAULT '',
  custom jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deals_stage_idx ON public.deals (stage_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deals_select" ON public.deals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR responsible_id = auth.uid());
CREATE POLICY "deals_insert" ON public.deals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR responsible_id = auth.uid());
CREATE POLICY "deals_update" ON public.deals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR responsible_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR responsible_id = auth.uid());
CREATE POLICY "deals_delete" ON public.deals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER deal_stages_set_updated_at BEFORE UPDATE ON public.deal_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER deal_fields_set_updated_at BEFORE UPDATE ON public.deal_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER deals_set_updated_at BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER log_deals AFTER INSERT OR UPDATE OR DELETE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

INSERT INTO public.deal_stages (name, color, position, kind) VALUES
  ('Новая', '#0ea5e9', 0, 'open'),
  ('Показ', '#6366f1', 1, 'open'),
  ('Переговоры', '#f59e0b', 2, 'open'),
  ('Договор', '#8b5cf6', 3, 'open'),
  ('Успешно', '#10b981', 4, 'won'),
  ('Отказ', '#ef4444', 5, 'lost');