-- Catalog policy: company earnings and costs are separate from client/owner funds.
-- Existing payments and their amounts, dates and commission allocations are untouched.
DO $$
DECLARE r record; category uuid; article uuid;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('rent_in','Аренда от клиентов','in','Деньги клиентов и собственников',false,'operating'),
  ('company_commission','Комиссия компании','in','Доходы компании',true,'operating'),
  ('utilities_in','Возмещение КУ','in','Деньги клиентов и собственников',false,'operating'),
  ('deposit_in','Страховой депозит — получение','in','Страховые депозиты',false,'financing'),
  ('owner_payout','Выплата собственнику','out','Расчёты с собственниками',false,'operating'),
  ('utilities_out','Перечисление КУ собственнику','out','Расчёты с собственниками',false,'operating'),
  ('deposit_out','Возврат страхового депозита','out','Страховые депозиты',false,'financing'),
  ('company_advertising','Реклама','out','Расходы компании',true,'operating'),
  ('company_payroll','Зарплата','out','Расходы компании',true,'operating'),
  ('company_services','Сервисы и подписки','out','Расходы компании',true,'operating'),
  ('company_repairs','Ремонт за счёт компании','out','Расходы компании',true,'operating')
 ) AS v(code,name,direction,category,profit,activity) LOOP
  SELECT id INTO category FROM public.finance_article_categories
   WHERE name=r.category AND direction::text=r.direction ORDER BY created_at,id LIMIT 1;
  IF category IS NULL THEN
   INSERT INTO public.finance_article_categories(name,direction,position)
   VALUES(r.category,r.direction::public.payment_direction,10) RETURNING id INTO category;
  END IF;
  SELECT id INTO article FROM public.finance_articles WHERE code=r.code;
  IF article IS NULL THEN
   -- Reuse an existing un-coded article of the same name instead of duplicating it.
   SELECT id INTO article FROM public.finance_articles
    WHERE code IS NULL AND name=r.name AND direction::text=r.direction ORDER BY created_at,id LIMIT 1;
  END IF;
  IF article IS NULL THEN
   INSERT INTO public.finance_articles(name,direction,category_id,code,affects_profit,cash_flow_type,position)
   VALUES(r.name,r.direction::public.payment_direction,category,r.code,r.profit,r.activity,10);
  ELSE
   UPDATE public.finance_articles SET name=r.name,category_id=category,code=r.code,
    affects_profit=r.profit,cash_flow_type=r.activity WHERE id=article;
  END IF;
 END LOOP;
END $$;

-- Automatic receipts, schedules and confirmed Assistant actions use the same articles.
CREATE OR REPLACE FUNCTION public.finance_payment_article_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE article_code text; article uuid;
BEGIN
 article_code:=CASE
  WHEN NEW.rental_component='rent' THEN 'rent_in'
  WHEN NEW.rental_component='utilities' THEN 'utilities_in'
  WHEN NEW.kind::text IN ('deposit_in','deposit_out','owner_payout') THEN NEW.kind::text
  ELSE NULL END;
 IF article_code IS NOT NULL THEN
  SELECT id INTO article FROM public.finance_articles WHERE code=article_code;
  IF article IS NOT NULL THEN NEW.article_id:=article; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.finance_payment_article_policy() FROM PUBLIC;
DROP TRIGGER IF EXISTS finance_payment_article_policy ON public.payments;
CREATE TRIGGER finance_payment_article_policy BEFORE INSERT OR UPDATE ON public.payments
 FOR EACH ROW EXECUTE FUNCTION public.finance_payment_article_policy();
NOTIFY pgrst, 'reload schema';
