-- Восстанавливает таблицы CRM-сделок, если их нет.
-- Нужно: мигратор помечает всё до 20260909175932 как уже применённое,
-- поэтому создание deal_stages/deals на self-hosted базе могло быть пропущено.

CREATE TABLE IF NOT EXISTS public.deal_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deal_fields (
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

CREATE TABLE IF NOT EXISTS public.deals (
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

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS closed_property_id uuid REFERENCES public.properties(id);
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS price_month numeric;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS deposit numeric;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS commission numeric;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS payment_day integer;

CREATE TABLE IF NOT EXISTS public.deal_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  author_id uuid,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deal_showings (
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_showings TO authenticated;
GRANT ALL ON public.deal_stages TO service_role;
GRANT ALL ON public.deal_fields TO service_role;
GRANT ALL ON public.deals TO service_role;
GRANT ALL ON public.deal_comments TO service_role;
GRANT ALL ON public.deal_showings TO service_role;

ALTER TABLE public.deal_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_showings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS deals_stage_idx ON public.deals (stage_id, position);
CREATE INDEX IF NOT EXISTS deal_comments_deal_id_idx ON public.deal_comments (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_showings_deal_idx ON public.deal_showings (deal_id, shown_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_stages' AND policyname = 'stages_read'
  ) THEN
    CREATE POLICY "stages_read" ON public.deal_stages FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_stages' AND policyname = 'stages_write'
  ) THEN
    CREATE POLICY "stages_write" ON public.deal_stages FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_fields' AND policyname = 'fields_read'
  ) THEN
    CREATE POLICY "fields_read" ON public.deal_fields FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_fields' AND policyname = 'fields_write'
  ) THEN
    CREATE POLICY "fields_write" ON public.deal_fields FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deals' AND policyname = 'deals_select'
  ) THEN
    CREATE POLICY "deals_select" ON public.deals FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin') OR responsible_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deals' AND policyname = 'deals_insert'
  ) THEN
    CREATE POLICY "deals_insert" ON public.deals FOR INSERT TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin') OR responsible_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deals' AND policyname = 'deals_update'
  ) THEN
    CREATE POLICY "deals_update" ON public.deals FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'admin') OR responsible_id = auth.uid())
      WITH CHECK (public.has_role(auth.uid(), 'admin') OR responsible_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deals' AND policyname = 'deals_delete'
  ) THEN
    CREATE POLICY "deals_delete" ON public.deals FOR DELETE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_comments' AND policyname = 'deal_comments_select'
  ) THEN
    CREATE POLICY "deal_comments_select" ON public.deal_comments FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_comments' AND policyname = 'deal_comments_insert'
  ) THEN
    CREATE POLICY "deal_comments_insert" ON public.deal_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_comments' AND policyname = 'deal_comments_update'
  ) THEN
    CREATE POLICY "deal_comments_update" ON public.deal_comments FOR UPDATE TO authenticated
      USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
      WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_comments' AND policyname = 'deal_comments_delete'
  ) THEN
    CREATE POLICY "deal_comments_delete" ON public.deal_comments FOR DELETE TO authenticated
      USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_showings' AND policyname = 'Staff can view showings'
  ) THEN
    CREATE POLICY "Staff can view showings" ON public.deal_showings FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_showings' AND policyname = 'Staff can add showings'
  ) THEN
    CREATE POLICY "Staff can add showings" ON public.deal_showings FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_showings' AND policyname = 'Author or admin can update showings'
  ) THEN
    CREATE POLICY "Author or admin can update showings" ON public.deal_showings FOR UPDATE TO authenticated
      USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deal_showings' AND policyname = 'Author or admin can delete showings'
  ) THEN
    CREATE POLICY "Author or admin can delete showings" ON public.deal_showings FOR DELETE TO authenticated
      USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS deal_stages_set_updated_at ON public.deal_stages;
CREATE TRIGGER deal_stages_set_updated_at BEFORE UPDATE ON public.deal_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS deal_fields_set_updated_at ON public.deal_fields;
CREATE TRIGGER deal_fields_set_updated_at BEFORE UPDATE ON public.deal_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS deals_set_updated_at ON public.deals;
CREATE TRIGGER deals_set_updated_at BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_deals ON public.deals;
CREATE TRIGGER log_deals AFTER INSERT OR UPDATE OR DELETE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS deal_comments_set_updated_at ON public.deal_comments;
CREATE TRIGGER deal_comments_set_updated_at BEFORE UPDATE ON public.deal_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_deal_comments ON public.deal_comments;
CREATE TRIGGER log_deal_comments AFTER INSERT OR UPDATE OR DELETE ON public.deal_comments
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS deal_showings_set_updated_at ON public.deal_showings;
CREATE TRIGGER deal_showings_set_updated_at BEFORE UPDATE ON public.deal_showings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_deal_showings ON public.deal_showings;
CREATE TRIGGER log_deal_showings AFTER INSERT OR UPDATE OR DELETE ON public.deal_showings
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

INSERT INTO public.deal_stages (name, color, position, kind)
SELECT seed.name, seed.color, seed.position, seed.kind
FROM (VALUES
  ('Новая', '#0ea5e9', 0, 'open'),
  ('Показ', '#6366f1', 1, 'open'),
  ('Переговоры', '#f59e0b', 2, 'open'),
  ('Договор', '#8b5cf6', 3, 'open'),
  ('Успешно', '#10b981', 4, 'won'),
  ('Отказ', '#ef4444', 5, 'lost')
) AS seed(name, color, position, kind)
WHERE NOT EXISTS (SELECT 1 FROM public.deal_stages);
