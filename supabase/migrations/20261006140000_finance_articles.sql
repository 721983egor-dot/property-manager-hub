-- Справочник статей и категорий Финансов (приход/расход). Для отчётов и формы операции.
-- Предзаполнение из прежних payment_kind, чтобы текущие платежи получили article_id.

CREATE TABLE IF NOT EXISTS public.finance_article_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  direction public.payment_direction NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_article_categories_dir_pos_idx
  ON public.finance_article_categories (direction, position);

CREATE TABLE IF NOT EXISTS public.finance_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  direction public.payment_direction NOT NULL,
  category_id uuid REFERENCES public.finance_article_categories(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_articles_code_uidx
  ON public.finance_articles (code)
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_articles_dir_pos_idx
  ON public.finance_articles (direction, position);
CREATE INDEX IF NOT EXISTS finance_articles_category_idx
  ON public.finance_articles (category_id);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS article_id uuid REFERENCES public.finance_articles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_article_id_idx ON public.payments (article_id);

COMMENT ON TABLE public.finance_article_categories IS
  'Категории статей Финансов (группы для отчётов). Приход и расход отдельно.';
COMMENT ON TABLE public.finance_articles IS
  'Статьи прихода и расхода. Форма операции и отчёты читают этот справочник.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_article_categories TO authenticated;
GRANT ALL ON public.finance_article_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_articles TO authenticated;
GRANT ALL ON public.finance_articles TO service_role;

ALTER TABLE public.finance_article_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_articles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'finance_article_categories'
      AND policyname = 'finance_article_categories_admin_all'
  ) THEN
    CREATE POLICY "finance_article_categories_admin_all" ON public.finance_article_categories
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'finance_articles'
      AND policyname = 'finance_articles_admin_all'
  ) THEN
    CREATE POLICY "finance_articles_admin_all" ON public.finance_articles
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS finance_article_categories_set_updated_at ON public.finance_article_categories;
CREATE TRIGGER finance_article_categories_set_updated_at
  BEFORE UPDATE ON public.finance_article_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_finance_article_categories ON public.finance_article_categories;
CREATE TRIGGER log_finance_article_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_article_categories
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS finance_articles_set_updated_at ON public.finance_articles;
CREATE TRIGGER finance_articles_set_updated_at
  BEFORE UPDATE ON public.finance_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_finance_articles ON public.finance_articles;
CREATE TRIGGER log_finance_articles
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_articles
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Сид: категории и статьи из прежнего enum, только если справочник пуст.
INSERT INTO public.finance_article_categories (name, direction, position)
SELECT v.name, v.direction::public.payment_direction, v.position
FROM (
  VALUES
    ('Аренда', 'in', 0),
    ('Депозиты', 'in', 1),
    ('Прочие поступления', 'in', 2),
    ('Собственники', 'out', 0),
    ('Подрядчики', 'out', 1),
    ('Агентство', 'out', 2),
    ('Депозиты', 'out', 3),
    ('Прочие расходы', 'out', 4)
) AS v(name, direction, position)
WHERE NOT EXISTS (SELECT 1 FROM public.finance_article_categories);

INSERT INTO public.finance_articles (name, direction, category_id, position, code)
SELECT v.name, v.direction::public.payment_direction, c.id, v.position, v.code
FROM (
  VALUES
    ('Аренда', 'in', 'Аренда', 0, 'rent_in'),
    ('Депозит (приход)', 'in', 'Депозиты', 1, 'deposit_in'),
    ('Прочее', 'in', 'Прочие поступления', 2, 'other'),
    ('Выплата собственнику', 'out', 'Собственники', 0, 'owner_payout'),
    ('Подрядчик / обслуживание', 'out', 'Подрядчики', 1, 'contractor'),
    ('Расход агентства', 'out', 'Агентство', 2, 'agency_cost'),
    ('Возврат депозита', 'out', 'Депозиты', 3, 'deposit_out')
) AS v(name, direction, category_name, position, code)
JOIN public.finance_article_categories c
  ON c.name = v.category_name AND c.direction::text = v.direction
WHERE NOT EXISTS (SELECT 1 FROM public.finance_articles);

UPDATE public.payments p
SET article_id = a.id
FROM public.finance_articles a
WHERE p.article_id IS NULL
  AND a.code IS NOT NULL
  AND a.code = p.kind::text;

NOTIFY pgrst, 'reload schema';
