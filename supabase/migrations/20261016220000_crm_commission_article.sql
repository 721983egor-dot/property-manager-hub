-- Categories may have been renamed by the administrator. Never rely on a display name.
DO $$
DECLARE category uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.finance_articles WHERE code='rental_commission') THEN
  SELECT c.id INTO category FROM public.finance_articles a JOIN public.finance_article_categories c ON c.id=a.category_id
   WHERE a.code='management_fee' AND c.direction='in' LIMIT 1;
  IF category IS NULL THEN SELECT id INTO category FROM public.finance_article_categories WHERE name='Доход компании' AND direction='in' ORDER BY id LIMIT 1; END IF;
  IF category IS NULL THEN INSERT INTO public.finance_article_categories(name,direction) VALUES('Доход компании','in') RETURNING id INTO category; END IF;
  INSERT INTO public.finance_articles(name,direction,code,affects_profit,category_id)
   VALUES('Разовая комиссия за аренду','in','rental_commission',true,category)
   ON CONFLICT(code) WHERE code IS NOT NULL DO NOTHING;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
