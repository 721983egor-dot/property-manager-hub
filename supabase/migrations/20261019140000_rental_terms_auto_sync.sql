-- Shared rental terms: atomically save price and management fee, recalculate only unpaid future money.
CREATE OR REPLACE FUNCTION public.finance_sync_booking(p_booking uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; acct text; account_id uuid; m date; due date; rent numeric; expected_fee numeric; prop public.properties;
 calculation jsonb; description text; a uuid; d public.deals; n int:=0; keep date[]:=ARRAY[]::date[];
 today date:=(now() AT TIME ZONE 'Europe/Moscow')::date; previous text;
BEGIN
 -- Lock in the same order as the owner settlement routines.
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.bookings WHERE id=p_booking) FOR UPDATE;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF b.id IS NULL OR b.stay_kind::text<>'long_term' OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=b.property_id AND portfolio='rm') THEN RETURN 0; END IF;
 SELECT * INTO d FROM public.deals WHERE booking_id=b.id AND finance_terms IS NOT NULL;
 SELECT s.account_id INTO account_id FROM public.finance_booking_schedules s WHERE s.id=b.id;
 IF account_id IS NULL AND d.id IS NOT NULL THEN
  account_id:=(d.finance_terms->>'account_id')::uuid;
  INSERT INTO public.finance_booking_schedules(id,account_id) VALUES(b.id,account_id) ON CONFLICT(id) DO NOTHING;
 END IF;
 IF account_id IS NULL THEN
  SELECT a.id INTO account_id FROM public.payments p JOIN public.finance_accounts a ON a.name=p.account
   WHERE p.booking_id=b.id AND p.rental_schedule AND NOT a.archived ORDER BY p.planned_date DESC,p.id LIMIT 1;
  IF account_id IS NOT NULL THEN INSERT INTO public.finance_booking_schedules(id,account_id) VALUES(b.id,account_id) ON CONFLICT(id) DO NOTHING; END IF;
 END IF;
 IF account_id IS NULL THEN RETURN 0; END IF;
 SELECT name INTO acct FROM public.finance_accounts WHERE id=account_id;
 IF acct IS NULL THEN RAISE EXCEPTION 'Выберите счёт графика аренды'; END IF;
 IF b.end_date<=b.start_date OR b.end_date>b.start_date+interval '20 years' OR b.payment_day IS NULL OR b.payment_day NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Проверьте срок аренды (до 20 лет) и день оплаты'; END IF;
 previous:=current_setting('rm.booking_schedule_write',true);
 PERFORM set_config('rm.booking_schedule_write',b.id::text,true);
 IF b.status::text='active' THEN
  IF EXISTS(SELECT 1 FROM public.finance_accounts WHERE id=account_id AND archived) THEN RAISE EXCEPTION 'Счёт графика архивный: выберите действующий счёт в брони'; END IF;
  SELECT id INTO a FROM public.finance_articles WHERE code='rent_in';
  FOR m IN SELECT generate_series(greatest(date_trunc('month',b.start_date)::date,date_trunc('month',today)::date),date_trunc('month',b.end_date)::date,interval '1 month')::date LOOP
   calculation:=public.finance_booking_period(b.id,m);
   IF NOT (calculation->>'scheduled')::boolean THEN CONTINUE; END IF;
   due:=(calculation->>'due')::date;
   IF due<today THEN CONTINUE; END IF;
   SELECT * INTO prop FROM public.properties WHERE id=b.property_id;
   rent:=(calculation->>'amount')::numeric;
   expected_fee:=round(CASE WHEN coalesce(d.income_type::text,prop.management_fee_type::text)='percent' THEN rent*coalesce(d.income_value,prop.management_fee_value)/100 ELSE coalesce(d.income_value,prop.management_fee_value)*(calculation->>'occupiedDays')::numeric/(calculation->>'cycleDays')::numeric END,2);
   description:='Аренда за '||to_char((calculation->>'from')::date,'DD.MM.YYYY')||' — '||to_char((calculation->>'to')::date,'DD.MM.YYYY')||' (выезд не включён), '||(calculation->>'occupiedDays')||'/'||(calculation->>'cycleDays')||' дней';
   keep:=array_append(keep,m);
   -- Explicit advance/balance pairs and manual/received payments are never rewritten.
   IF EXISTS(SELECT 1 FROM public.payments WHERE booking_id=b.id AND rental_period=m AND rental_component='rent' AND (NOT rental_schedule OR rental_installment_id IS NOT NULL OR status::text IN ('paid','partial') OR paid_at IS NOT NULL OR coalesce(paid_amount,0)>0 OR planned_date<=today)) THEN CONTINUE; END IF;
   UPDATE public.payments SET amount=rent,planned_date=due,account=acct,company_fee=NULL,comment=description
    WHERE booking_id=b.id AND rental_period=m AND rental_schedule AND planned_date>today
     AND status::text IN ('expected','overdue') AND paid_at IS NULL AND coalesce(paid_amount,0)=0
     AND (amount IS DISTINCT FROM rent OR planned_date IS DISTINCT FROM due OR account IS DISTINCT FROM acct OR comment IS DISTINCT FROM description OR company_fee IS DISTINCT FROM expected_fee);
   IF NOT EXISTS(SELECT 1 FROM public.payments WHERE booking_id=b.id AND rental_period=m AND rental_component='rent') THEN
    INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,client_id,booking_id,deal_id,account,comment,article_id,rental_component,rental_period,rental_schedule)
    VALUES(due,rent,'in','expected','rent_in',b.property_id,b.client_id,b.id,d.id,acct,description,a,'rent',m,true);
    n:=n+1;
   END IF;
  END LOOP;
 END IF;
 DELETE FROM public.payments WHERE booking_id=b.id AND rental_schedule AND rental_installment_id IS NULL
  AND planned_date>today AND status::text IN ('expected','overdue') AND paid_at IS NULL AND coalesce(paid_amount,0)=0
  AND (b.status::text<>'active' OR NOT(rental_period=ANY(keep)));
 PERFORM set_config('rm.booking_schedule_write',coalesce(previous,''),true);
 RETURN n;
END $$;

CREATE FUNCTION public.finance_recalculate_property_terms(p_property uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prop public.properties; r record;
BEGIN
 SELECT * INTO prop FROM public.properties WHERE id=p_property FOR UPDATE;
 IF prop.id IS NULL OR prop.portfolio::text<>'rm' THEN RETURN; END IF;
 UPDATE public.deals SET income_type=prop.management_fee_type::text,income_value=prop.management_fee_value,
  income_month=round(CASE WHEN prop.management_fee_type='percent' THEN price_month*prop.management_fee_value/100 ELSE prop.management_fee_value END,2)
 WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id=prop.id AND status='active' AND stay_kind='long_term' AND end_date>(now() AT TIME ZONE 'Europe/Moscow')::date)
  AND finance_terms IS NOT NULL
  AND (income_type::text IS DISTINCT FROM prop.management_fee_type::text OR income_value IS DISTINCT FROM prop.management_fee_value);
 FOR r IN SELECT id FROM public.bookings WHERE property_id=prop.id AND status='active' AND stay_kind='long_term' AND end_date>(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY id LOOP
  PERFORM public.finance_sync_booking(r.id);
 END LOOP;
 -- Manual future rent uses the new rate, but advance/balance agreements stay explicit.
 UPDATE public.payments SET company_fee=company_fee WHERE property_id=prop.id AND rental_component='rent'
  AND NOT rental_schedule AND rental_installment_id IS NULL AND planned_date>(now() AT TIME ZONE 'Europe/Moscow')::date
  AND status IN ('expected','overdue') AND paid_at IS NULL AND coalesce(paid_amount,0)=0;
 RETURN;
END $$;
REVOKE ALL ON FUNCTION public.finance_recalculate_property_terms(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.finance_save_booking(p_booking uuid,p_input jsonb,p_account uuid DEFAULT NULL,p_actor uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid:=coalesce(p_booking,gen_random_uuid()); old public.bookings; d public.deals;
 x jsonb; a uuid; s date:=(p_input->>'start_date')::date; e date:=(p_input->>'end_date')::date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 IF (p_input ? 'management_fee_type')<>(p_input ? 'management_fee_value') THEN RAISE EXCEPTION 'Укажите тип и значение комиссии вместе'; END IF;
 PERFORM 1 FROM public.properties WHERE id=(p_input->>'property_id')::uuid AND portfolio='rm' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Выберите объект Резиденции Море'; END IF;
 SELECT * INTO old FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF p_booking IS NOT NULL AND old.id IS NULL THEN RAISE EXCEPTION 'Бронь не найдена'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings WHERE id<>b AND property_id=(p_input->>'property_id')::uuid AND status::text='active' AND start_date<e AND end_date>s) AND p_input->>'status'='active' THEN RAISE EXCEPTION 'Объект уже забронирован на эти даты'; END IF;
 IF old.id IS NOT NULL AND (old.property_id IS DISTINCT FROM (p_input->>'property_id')::uuid OR old.client_id IS DISTINCT FROM (p_input->>'client_id')::uuid) THEN RAISE EXCEPTION 'Для смены клиента или объекта создайте новую бронь, сохранив историю старой'; END IF;
 IF s IS NULL OR e IS NULL OR e<=s OR e>s+interval '20 years' OR p_input->>'payment_day' IS NULL OR (p_input->>'payment_day')::int NOT BETWEEN 1 AND 31 OR coalesce(p_input->>'stay_kind','long_term')<>'long_term' OR coalesce(p_input->>'price_type','') NOT IN ('fixed','periodic') OR coalesce(p_input->>'status','') NOT IN ('active','completed','cancelled') THEN RAISE EXCEPTION 'Проверьте условия долгосрочной аренды'; END IF;
 SELECT * INTO d FROM public.deals WHERE booking_id=p_booking AND finance_terms IS NOT NULL;
 SELECT account_id INTO a FROM public.finance_booking_schedules WHERE id=p_booking;
 a:=coalesce(p_account,a,(d.finance_terms->>'account_id')::uuid);
 IF a IS NULL OR NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE id=a AND (NOT archived OR p_input->>'status'<>'active')) THEN RAISE EXCEPTION 'Выберите действующий счёт для графика аренды'; END IF;
 IF d.id IS NOT NULL THEN
  UPDATE public.deals SET finance_terms=jsonb_set(finance_terms,'{account_id}',to_jsonb(a::text)) WHERE id=d.id;
  PERFORM set_config('rm.crm_finance_write',b::text,true);
 END IF;
  IF old.id IS NULL THEN
   INSERT INTO public.bookings(id,property_id,client_id,start_date,end_date,price_type,price_month,payment_day,deposit,source,status,comment,stay_kind)
   VALUES(b,(p_input->>'property_id')::uuid,(p_input->>'client_id')::uuid,s,e,(p_input->>'price_type')::public.booking_price_type,(p_input->>'price_month')::numeric,(p_input->>'payment_day')::int,(p_input->>'deposit')::numeric,(p_input->>'source')::public.booking_source,(p_input->>'status')::public.booking_status,coalesce(p_input->>'comment',''),'long_term');
  ELSE
   UPDATE public.bookings SET start_date=s,end_date=e,price_type=(p_input->>'price_type')::public.booking_price_type,price_month=(p_input->>'price_month')::numeric,payment_day=(p_input->>'payment_day')::int,deposit=(p_input->>'deposit')::numeric,source=(p_input->>'source')::public.booking_source,status=(p_input->>'status')::public.booking_status,comment=coalesce(p_input->>'comment','') WHERE id=b;
  END IF;
  DELETE FROM public.booking_price_periods WHERE booking_id=b;
  IF p_input->>'price_type'='periodic' THEN
   FOR x IN SELECT value FROM jsonb_array_elements(p_input->'periods') LOOP
    IF nullif(x->>'start_date','') IS NULL OR nullif(x->>'end_date','') IS NULL OR nullif(x->>'price_month','') IS NULL OR (x->>'start_date')::date<s OR (x->>'end_date')::date>e OR (x->>'end_date')::date<(x->>'start_date')::date OR (x->>'price_month')::numeric<=0 OR (x->>'price_month') IN ('NaN','Infinity','-Infinity') OR (SELECT count(*) FROM jsonb_array_elements(p_input->'periods') z WHERE (z->>'start_date')::date<=(x->>'end_date')::date AND (z->>'end_date')::date>=(x->>'start_date')::date)>1 THEN RAISE EXCEPTION 'Проверьте периоды сезонных цен'; END IF;
    INSERT INTO public.booking_price_periods(booking_id,start_date,end_date,price_month) VALUES(b,(x->>'start_date')::date,(x->>'end_date')::date,(x->>'price_month')::numeric);
   END LOOP;
  END IF;
 INSERT INTO public.finance_booking_schedules(id,account_id) VALUES(b,a) ON CONFLICT(id) DO UPDATE SET account_id=EXCLUDED.account_id;
 IF p_input ? 'management_fee_value' THEN
  IF p_input->>'management_fee_type' NOT IN ('percent','amount') OR p_input->>'management_fee_type' IS NULL
   OR p_input->>'management_fee_value' IS NULL OR (p_input->>'management_fee_value')::numeric<0
   OR p_input->>'management_fee_value' IN ('NaN','Infinity','-Infinity')
   OR (p_input->>'management_fee_type'='percent' AND (p_input->>'management_fee_value')::numeric>100) THEN
   RAISE EXCEPTION 'Укажите корректную комиссию за управление';
  END IF;
  UPDATE public.properties SET management_fee_type=(p_input->>'management_fee_type')::public.management_fee_type,
   management_fee_value=(p_input->>'management_fee_value')::numeric WHERE id=(p_input->>'property_id')::uuid;
  PERFORM public.finance_recalculate_property_terms((p_input->>'property_id')::uuid);
 END IF;
 IF d.id IS NOT NULL THEN
  UPDATE public.deals SET income_month=round(CASE WHEN income_type='percent' THEN (p_input->>'price_month')::numeric*income_value/100 ELSE income_value END,2),start_date=s,end_date=e,price_month=(p_input->>'price_month')::numeric,payment_day=(p_input->>'payment_day')::int,deposit=(p_input->>'deposit')::numeric,
   finance_terms=jsonb_set(finance_terms,'{seasons}',CASE WHEN p_input->>'price_type'='periodic' THEN
    coalesce((SELECT jsonb_agg(jsonb_build_object('start_date',start_date,'end_date',least(end_date,e-1),'price_month',price_month) ORDER BY start_date) FROM public.booking_price_periods WHERE booking_id=b AND price_month IS DISTINCT FROM (p_input->>'price_month')::numeric),'[]'::jsonb) ELSE '[]'::jsonb END)
   WHERE id=d.id;
  PERFORM public.crm_sync_commission(d.id);
 END IF;

 PERFORM public.finance_sync_booking(b);
 RETURN b;
END $$;

-- Every writer (property card, calendar, finance, Assistant) follows this path.
-- A deferred trigger sees the final booking prices and seasonal rows.
CREATE FUNCTION public.finance_property_fee_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.finance_recalculate_property_terms(NEW.id);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.finance_property_fee_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER finance_property_fee_changed AFTER UPDATE ON public.properties
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN (OLD.management_fee_type IS DISTINCT FROM NEW.management_fee_type OR OLD.management_fee_value IS DISTINCT FROM NEW.management_fee_value)
 EXECUTE FUNCTION public.finance_property_fee_changed();
NOTIFY pgrst,'reload schema';
