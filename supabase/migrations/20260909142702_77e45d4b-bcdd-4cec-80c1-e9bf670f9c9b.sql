CREATE TABLE public.deal_showings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  shown_at date NOT NULL DEFAULT current_date,
  note text NOT NULL DEFAULT '',
  author_id uuid,
  author_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_showings TO authenticated;
GRANT ALL ON public.deal_showings TO service_role;

ALTER TABLE public.deal_showings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view showings" ON public.deal_showings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can add showings" ON public.deal_showings
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "Author or admin can update showings" ON public.deal_showings
  FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Author or admin can delete showings" ON public.deal_showings
  FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX deal_showings_deal_idx ON public.deal_showings (deal_id, shown_at DESC);

CREATE TRIGGER deal_showings_set_updated_at BEFORE UPDATE ON public.deal_showings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER log_deal_showings AFTER INSERT OR UPDATE OR DELETE ON public.deal_showings
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

ALTER TABLE public.deals
  ADD COLUMN start_date date,
  ADD COLUMN end_date date,
  ADD COLUMN closed_property_id uuid REFERENCES public.properties(id),
  ADD COLUMN price_month numeric,
  ADD COLUMN deposit numeric,
  ADD COLUMN commission numeric,
  ADD COLUMN payment_day integer;