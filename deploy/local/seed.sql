-- Fictional examples, never a recovery of the real customers or financial records.
BEGIN;
CREATE TABLE IF NOT EXISTS public.local_dev_seed(version text PRIMARY KEY,created_at timestamptz DEFAULT now());
DO $$
DECLARE actor uuid; prop uuid:='d0000000-0000-4000-8000-000000000001';
 client uuid:='d0000000-0000-4000-8000-000000000011';
 owner_id uuid:='d0000000-0000-4000-8000-000000000021';
 account_id uuid; booking_id uuid; article uuid;
 first_day date:=(now() AT TIME ZONE 'Europe/Moscow')::date+1;
 last_day date; periods jsonb;
BEGIN
 IF EXISTS(SELECT FROM public.local_dev_seed WHERE version='v1') THEN RETURN; END IF;
 SELECT id INTO actor FROM auth.users WHERE email='admin@rm-os.test';
 IF actor IS NULL THEN RAISE EXCEPTION 'Create the local test administrator first'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 UPDATE public.properties SET title='[ТЕСТ] '||title,photos='[]'::jsonb WHERE title NOT LIKE '[ТЕСТ]%';
 INSERT INTO public.properties(id,title,type,complex_name,address,rooms,area,status,price_month,deposit,management_fee_type,management_fee_value,description,portfolio)
 VALUES
 (prop,'[ТЕСТ] Квартира с сезонной ценой','apartment','Тестовый ЖК «Морской»','Сочи · демонстрационный объект',2,65,'rented',60000,60000,'percent',10,'Вымышленный объект для проверки аренды и финансов. Летом цена 90 000 ₽.','rm'),
 ('d0000000-0000-4000-8000-000000000002','[ТЕСТ] Свободная студия','apartment','Тестовый ЖК «Морской»','Сочи · демонстрационный объект',1,32,'free',35000,35000,'percent',10,'Для тестирования создания новой брони и подборок.','rm'),
 ('d0000000-0000-4000-8000-000000000003','[ТЕСТ] Дом с бассейном','house','Тестовый посёлок','Сочи · демонстрационный объект',4,180,'free',180000,180000,'percent',10,'Для тестирования карточки дома и фильтров.','rm');
 INSERT INTO public.clients(id,full_name,phone) VALUES(client,'Тестовый арендатор Мария','');
 INSERT INTO public.finance_counterparties(id,name,kind,comment)
 VALUES(owner_id,'Тестовый собственник Алексей','owner','Вымышленный собственник для локальных тестов');
 INSERT INTO public.finance_object_settings(property_id,owner_counterparty_id) VALUES(prop,owner_id);
 SELECT id INTO account_id FROM public.finance_accounts WHERE name='Касса' LIMIT 1;
 last_day:=(first_day+interval '1 year')::date;
 periods:=jsonb_build_array(
  jsonb_build_object('start_date',first_day,'end_date',make_date(extract(year FROM first_day)::int+1,5,31),'price_month',60000),
  jsonb_build_object('start_date',make_date(extract(year FROM first_day)::int+1,6,1),'end_date',make_date(extract(year FROM first_day)::int+1,8,31),'price_month',90000),
  jsonb_build_object('start_date',make_date(extract(year FROM first_day)::int+1,9,1),'end_date',last_day,'price_month',60000));
 -- This demo is seeded in November; use a fixed price if started in a different season.
 IF extract(month FROM first_day)<9 THEN periods:='[]'::jsonb; END IF;
 booking_id:=public.finance_save_booking(NULL,jsonb_build_object(
  'property_id',prop,'client_id',client,'start_date',first_day,'end_date',last_day,
  'price_type',CASE WHEN jsonb_array_length(periods)>0 THEN 'periodic' ELSE 'fixed' END,
  'price_month',60000,'payment_day',extract(day FROM first_day)::int,
  'owner_payout_day',10,'owner_payout_mode','scheduled','deposit',60000,
  'source','website','status','active','stay_kind','long_term',
  'comment','[ТЕСТ] Пример: аренда, сезонность, комиссия 10%, выплата собственнику',
  'periods',periods),account_id,actor);
 SELECT id INTO article FROM public.finance_articles WHERE code='agency_cost' LIMIT 1;
 PERFORM public.finance_create_payment_series('d0000000-0000-4000-8000-000000000031',
  jsonb_build_object('planned_date',date_trunc('month',first_day)::date+2,'amount',2500,
   'direction','out','status','expected','kind','agency_cost','account','Касса',
   'article_id',article,'expense_bearer','company','comment','[ТЕСТ] Ежемесячный сервер · демонстрация, не реальная оплата'),
  jsonb_build_object('interval','month','paymentDay',3,'unlimited',true),actor);
 INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,account,comment,paid_at,paid_amount,expense_bearer)
 VALUES((now() AT TIME ZONE 'Europe/Moscow')::date,3000,'out','paid','contractor',prop,'Касса','[ТЕСТ] Ремонт за счёт собственника',(now() AT TIME ZONE 'Europe/Moscow')::date,3000,'owner');
 INSERT INTO public.local_dev_seed(version) VALUES('v1');
END $$;
INSERT INTO storage.buckets(id,name,public) VALUES('property-photos','property-photos',true) ON CONFLICT(id) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
