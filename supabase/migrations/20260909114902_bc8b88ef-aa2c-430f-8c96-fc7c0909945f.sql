CREATE TABLE public.deal_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  author_id uuid,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_comments TO authenticated;
GRANT ALL ON public.deal_comments TO service_role;

ALTER TABLE public.deal_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deal_comments_select" ON public.deal_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "deal_comments_insert" ON public.deal_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "deal_comments_update" ON public.deal_comments FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin')) WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "deal_comments_delete" ON public.deal_comments FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX deal_comments_deal_id_idx ON public.deal_comments(deal_id, created_at DESC);

CREATE TRIGGER deal_comments_set_updated_at BEFORE UPDATE ON public.deal_comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER log_deal_comments AFTER INSERT OR UPDATE OR DELETE ON public.deal_comments
FOR EACH ROW EXECUTE FUNCTION public.log_activity();