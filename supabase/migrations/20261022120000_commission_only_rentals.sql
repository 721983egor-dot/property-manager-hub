-- Snapshot the service for each new rental; historical rentals retain their existing accounting.
ALTER TABLE public.bookings ADD COLUMN service_type text NOT NULL DEFAULT 'management' CHECK(service_type IN ('management','commission_only'));
CREATE FUNCTION public.booking_service_from_crm() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_setting('rm.crm_booking_service_type',true)='commission_only' THEN NEW.service_type:='commission_only'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_service_from_crm BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.booking_service_from_crm();
CREATE FUNCTION public.booking_service_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.service_type IS DISTINCT FROM OLD.service_type THEN RAISE EXCEPTION 'Формат действующей аренды нельзя менять без сохранения финансовой истории'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER booking_service_immutable BEFORE UPDATE OF service_type ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.booking_service_immutable();
REVOKE ALL ON FUNCTION public.booking_service_immutable() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.booking_service_from_crm() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_close_won(p_deal uuid,p_property uuid,p_start date,p_end date,p_rent numeric,p_deposit numeric,p_day int,p_source text,p_income_type text,p_income_value numeric,p_create_booking boolean DEFAULT true,p_actor uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.deals; prop public.properties; s uuid; b uuid; fee numeric; previous_kind text;
BEGIN
 PERFORM public.crm_check_actor(p_actor); SELECT * INTO d FROM public.deals WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR d.pipeline<>'rental' THEN RAISE EXCEPTION 'Сделка аренды не найдена'; END IF;
 SELECT kind INTO previous_kind FROM public.deal_stages WHERE id=d.stage_id;
 -- Lock the property so two concurrent CRM closings cannot allocate the same dates.
 SELECT * INTO prop FROM public.properties WHERE id=p_property AND portfolio='rm' AND status<>'archived' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Выберите действующий объект РМ'; END IF;
 IF d.client_id IS NULL THEN RAISE EXCEPTION 'Выберите клиента'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_rent IS NULL OR p_rent<=0 OR p_rent::text IN ('NaN','Infinity','-Infinity') OR p_deposit IS NULL OR p_deposit<0 OR p_deposit::text IN ('NaN','Infinity','-Infinity') OR p_day IS NULL OR p_day NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Проверьте сроки, стоимость, депозит и день оплаты'; END IF;
 IF p_income_type IS NULL OR p_income_type NOT IN ('percent','amount') OR p_income_value IS NULL OR p_income_value<0 OR (p_income_type='percent' AND p_income_value>100) THEN RAISE EXCEPTION 'Укажите доход компании'; END IF;
 fee:=round(CASE WHEN p_income_type='percent' THEN p_rent*p_income_value/100 ELSE p_income_value END,2);
 IF fee>p_rent THEN RAISE EXCEPTION 'Доход компании больше аренды'; END IF;
 IF length(trim(p_source))=0 THEN RAISE EXCEPTION 'Укажите площадку сделки'; END IF;
 IF previous_kind='won' THEN
  IF d.closed_property_id=p_property AND d.start_date=p_start AND d.end_date=p_end AND d.price_month=p_rent AND d.deposit=p_deposit AND d.payment_day=p_day AND d.closing_source=p_source AND d.income_type=p_income_type AND d.income_value=p_income_value AND (d.booking_id IS NOT NULL)=p_create_booking THEN RETURN d.booking_id; END IF;
  RAISE EXCEPTION 'Сделка уже закрыта; изменяйте существующую бронь';
 END IF;
 b:=d.booking_id;
 IF b IS NOT NULL THEN RAISE EXCEPTION 'У сделки уже есть бронь. Проверьте её перед повторным закрытием'; END IF;
 IF p_create_booking THEN
  IF EXISTS(SELECT 1 FROM public.bookings WHERE property_id=p_property AND status<>'cancelled' AND start_date<=p_end AND end_date>=p_start) THEN RAISE EXCEPTION 'Объект уже забронирован на выбранные даты'; END IF;
  INSERT INTO public.bookings(property_id,client_id,start_date,end_date,price_type,price_month,payment_day,deposit,source,status,comment,stay_kind)
   VALUES(p_property,d.client_id,p_start,p_end,'fixed',p_rent,p_day,p_deposit,CASE lower(p_source) WHEN 'авито' THEN 'avito'::public.booking_source WHEN 'циан' THEN 'cian'::public.booking_source WHEN 'сайт' THEN 'website'::public.booking_source WHEN 'сайт рм' THEN 'website'::public.booking_source WHEN 'рекомендация' THEN 'referral'::public.booking_source WHEN 'telegram' THEN 'social'::public.booking_source WHEN 'whatsapp' THEN 'social'::public.booking_source ELSE NULL END,'active','Сделка CRM: '||d.title||'. Источник: '||p_source,'long_term') RETURNING id INTO b;
 END IF;
 SELECT id INTO s FROM public.deal_stages WHERE pipeline='rental' AND kind='won' ORDER BY position LIMIT 1;
 IF s IS NULL THEN RAISE EXCEPTION 'Нет этапа успешного закрытия'; END IF;
 UPDATE public.deals SET stage_id=s,property_id=p_property,closed_property_id=p_property,start_date=p_start,end_date=p_end,price_month=p_rent,deposit=p_deposit,payment_day=p_day,closing_source=trim(p_source),income_type=p_income_type,income_value=p_income_value,income_month=fee,booking_id=b,closed_at=now() WHERE id=d.id;
 UPDATE public.properties SET management_fee_type=CASE WHEN current_setting('rm.crm_booking_service_type',true)='commission_only' THEN management_fee_type ELSE p_income_type::public.management_fee_type END,management_fee_value=CASE WHEN current_setting('rm.crm_booking_service_type',true)='commission_only' THEN management_fee_value ELSE p_income_value END,status=CASE WHEN p_start<=(now() AT TIME ZONE 'Europe/Moscow')::date THEN 'rented'::public.property_status WHEN EXISTS(SELECT 1 FROM public.bookings WHERE property_id=prop.id AND status='active' AND start_date<=(now() AT TIME ZONE 'Europe/Moscow')::date AND end_date>(now() AT TIME ZONE 'Europe/Moscow')::date) THEN 'rented'::public.property_status ELSE 'booked'::public.property_status END WHERE id=prop.id;
 RETURN b;
END $$;

CREATE OR REPLACE FUNCTION public.crm_close_won_finance(p_deal uuid,p_terms jsonb,p_actor uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.deals; b uuid; t jsonb; x jsonb; y jsonb; s date; e date; boundary date; finish date; price numeric; service text; previous_service text;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 service:=coalesce(nullif(p_terms->>'service_type',''),(SELECT service_type::text FROM public.properties WHERE id=(p_terms->>'property_id')::uuid),'management');
 IF service NOT IN ('management','commission_only') THEN RAISE EXCEPTION 'Выберите формат работы по аренде'; END IF;
 IF service='commission_only' THEN p_terms:=p_terms||jsonb_build_object('income_type','amount','income_value',0); END IF;
 SELECT * INTO d FROM public.deals WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Сделка не найдена'; END IF;
 s:=(p_terms->>'start_date')::date;e:=(p_terms->>'end_date')::date;
 t:=jsonb_build_object('service_type',service,'account_id',p_terms->>'account_id','one_time',coalesce((p_terms->>'one_time')::numeric,0),'one_time_date',p_terms->>'one_time_date','seasons',coalesce(p_terms->'seasons','[]'::jsonb));
 IF (t->>'one_time')::numeric<0 OR (t->>'one_time') IN ('NaN','Infinity','-Infinity') OR ((t->>'one_time')::numeric>0 AND nullif(t->>'one_time_date','') IS NULL) THEN RAISE EXCEPTION 'Укажите сумму и дату разовой комиссии'; END IF;
 IF jsonb_typeof(t->'seasons')<>'array' OR jsonb_array_length(t->'seasons')>48 THEN RAISE EXCEPTION 'Проверьте сезонные цены'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(t->'seasons') LOOP
  IF nullif(x->>'start_date','') IS NULL OR nullif(x->>'end_date','') IS NULL OR nullif(x->>'price_month','') IS NULL OR (x->>'start_date')::date<s OR (x->>'end_date')::date>=e OR (x->>'end_date')::date<(x->>'start_date')::date OR (x->>'price_month')::numeric<=0 OR (x->>'price_month') IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Сезон должен находиться внутри аренды, цена больше нуля'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(t->'seasons') z WHERE (z->>'start_date')::date<=(x->>'end_date')::date AND (z->>'end_date')::date>=(x->>'start_date')::date)>1 THEN RAISE EXCEPTION 'Сезонные периоды пересекаются'; END IF;
 END LOOP;
 IF d.finance_terms IS NOT NULL THEN
  IF (d.finance_terms||jsonb_build_object('service_type',coalesce(d.finance_terms->>'service_type','management')))<>t THEN RAISE EXCEPTION 'Финансовые условия уже сохранены. Изменяйте существующую бронь'; END IF;
 END IF;
 previous_service:=current_setting('rm.crm_booking_service_type',true);
 PERFORM set_config('rm.crm_booking_service_type',service,true);
 b:=public.crm_close_won(p_deal,(p_terms->>'property_id')::uuid,s,e,(p_terms->>'price_month')::numeric,(p_terms->>'deposit')::numeric,(p_terms->>'payment_day')::int,p_terms->>'closing_source',p_terms->>'income_type',(p_terms->>'income_value')::numeric,coalesce((p_terms->>'create_booking')::boolean,true),p_actor);
 PERFORM set_config('rm.crm_booking_service_type',coalesce(previous_service,''),true);
 IF d.finance_terms IS NOT NULL THEN RETURN b; END IF;
 UPDATE public.deals SET finance_terms=t,commission=(t->>'one_time')::numeric WHERE id=p_deal;
 IF b IS NOT NULL THEN PERFORM set_config('rm.crm_finance_write',b::text,true); END IF;
 IF b IS NOT NULL AND jsonb_array_length(t->'seasons')>0 THEN
  UPDATE public.bookings SET price_type='periodic' WHERE id=b;
  -- Expand seasonal overrides into full, nonoverlapping contract price coverage.
  FOR boundary IN SELECT DISTINCT v FROM (SELECT s AS v UNION SELECT e UNION SELECT (value->>'start_date')::date FROM jsonb_array_elements(t->'seasons') UNION SELECT (value->>'end_date')::date+1 FROM jsonb_array_elements(t->'seasons')) points WHERE v<e ORDER BY v LOOP
   SELECT min(v) INTO finish FROM (SELECT e AS v UNION SELECT (value->>'start_date')::date FROM jsonb_array_elements(t->'seasons') UNION SELECT (value->>'end_date')::date+1 FROM jsonb_array_elements(t->'seasons')) points WHERE v>boundary;
   price:=(p_terms->>'price_month')::numeric;
   FOR x IN SELECT value FROM jsonb_array_elements(t->'seasons') LOOP IF boundary BETWEEN (x->>'start_date')::date AND (x->>'end_date')::date THEN price:=(x->>'price_month')::numeric; END IF; END LOOP;
   INSERT INTO public.booking_price_periods(booking_id,start_date,end_date,price_month) VALUES(b,boundary,finish-1,price);
  END LOOP;
 END IF;
 PERFORM public.crm_sync_commission(p_deal);
 RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.crm_close_won_finance(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_close_won_finance(uuid,jsonb,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_sync_commission_legacy(p_deal uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.deals; b public.bookings; t jsonb; m date; due date; rent numeric; fee numeric;
 a uuid; acct text; keep text[]:=ARRAY[]::text[]; charge text; x jsonb; n int;
BEGIN
 SELECT * INTO d FROM public.deals WHERE id=p_deal FOR UPDATE;
 t:=d.finance_terms;
 IF t IS NULL THEN RETURN; END IF;
 SELECT name INTO acct FROM public.finance_accounts WHERE id=(t->>'account_id')::uuid FOR SHARE;
 IF acct IS NULL THEN RAISE EXCEPTION 'Выберите действующий счёт для дохода компании'; END IF;
 IF d.booking_id IS NOT NULL THEN
  SELECT * INTO b FROM public.bookings WHERE id=d.booking_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Связанная бронь удалена'; END IF;
 ELSE
  b.start_date:=d.start_date;b.end_date:=d.end_date;b.price_month:=d.price_month;b.payment_day:=d.payment_day;b.status:='active';b.price_type:='fixed';
 END IF;
 IF b.end_date IS NULL OR b.start_date IS NULL OR b.end_date<=b.start_date OR b.payment_day IS NULL OR b.payment_day IS NULL OR b.payment_day NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Проверьте даты и день оплаты'; END IF;
 IF b.end_date>b.start_date+interval '20 years' THEN RAISE EXCEPTION 'Срок графика не более 20 лет'; END IF;
 IF b.status<>'cancelled' AND coalesce(t->>'service_type','management')<>'commission_only' THEN
 FOR m IN SELECT generate_series(date_trunc('month',b.start_date)::date,date_trunc('month',b.end_date)::date,interval '1 month')::date LOOP
  due:=m+(least(b.payment_day,extract(day FROM m+interval '1 month - 1 day')::int)-1);
  IF due<b.start_date OR due>=b.end_date THEN CONTINUE; END IF;
  rent:=b.price_month;
  IF b.price_type='periodic' THEN
   SELECT count(*),min(price_month) INTO n,rent FROM public.booking_price_periods WHERE booking_id=b.id AND start_date<=due AND end_date>=due;
   IF n<>1 THEN RAISE EXCEPTION 'Для даты % задайте единственную цену аренды',due; END IF;
  ELSIF d.booking_id IS NULL THEN
   FOR x IN SELECT value FROM jsonb_array_elements(coalesce(t->'seasons','[]')) LOOP
    IF due>=(x->>'start_date')::date AND due<=(x->>'end_date')::date THEN rent:=(x->>'price_month')::numeric; END IF;
   END LOOP;
  END IF;
  IF rent IS NULL OR rent<=0 OR rent::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Укажите положительную стоимость аренды'; END IF;
  fee:=round(CASE WHEN d.income_type='percent' THEN rent*d.income_value/100 ELSE d.income_value END,2);
  IF fee<0 OR fee>rent OR fee IS NULL THEN RAISE EXCEPTION 'Проверьте комиссию для даты %',due; END IF;
  charge:='month:'||to_char(m,'YYYY-MM');keep:=array_append(keep,charge);
  SELECT id INTO a FROM public.finance_articles WHERE code='management_fee' AND direction='in';
  IF a IS NULL THEN RAISE EXCEPTION 'Восстановите статью Управление объектами'; END IF;
  -- Adopt an existing manually created monthly commission instead of duplicating it.
  UPDATE public.payments SET deal_id=d.id,crm_charge=charge WHERE booking_id=b.id AND management_period=m AND crm_charge IS NULL AND (deal_id IS NULL OR deal_id=d.id);
  INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,client_id,booking_id,deal_id,account,article_id,management_period,crm_charge,rental_turnover,comment)
  VALUES(due,fee,'in','expected','other',d.closed_property_id,d.client_id,d.booking_id,d.id,acct,a,m,charge,rent,'Комиссия компании по сделке «'||d.title||'». Аренда '||rent||' ₽')
  ON CONFLICT(deal_id,crm_charge) WHERE crm_charge IS NOT NULL DO UPDATE
   SET status='expected',planned_date=EXCLUDED.planned_date,amount=EXCLUDED.amount,rental_turnover=EXCLUDED.rental_turnover,comment=EXCLUDED.comment
   WHERE payments.status IN ('expected','overdue') AND coalesce(payments.paid_amount,0)=0 AND payments.paid_at IS NULL AND payments.planned_date>(now() AT TIME ZONE 'Europe/Moscow')::date;
 END LOOP;
 END IF;
 IF coalesce((t->>'one_time')::numeric,0)>0 THEN
  charge:='one_time';keep:=array_append(keep,charge);
  SELECT id INTO a FROM public.finance_articles WHERE code='rental_commission' AND direction='in';
  IF a IS NULL THEN RAISE EXCEPTION 'Восстановите статью Разовая комиссия за аренду'; END IF;
  INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,client_id,booking_id,deal_id,account,article_id,crm_charge,comment)
  VALUES((t->>'one_time_date')::date,(t->>'one_time')::numeric,'in','expected','other',d.closed_property_id,d.client_id,d.booking_id,d.id,acct,a,charge,'Разовая комиссия по сделке «'||d.title||'»')
  ON CONFLICT(deal_id,crm_charge) WHERE crm_charge IS NOT NULL DO UPDATE
   SET planned_date=EXCLUDED.planned_date,amount=EXCLUDED.amount
   WHERE payments.status IN ('expected','overdue') AND coalesce(payments.paid_amount,0)=0 AND payments.paid_at IS NULL AND payments.planned_date>(now() AT TIME ZONE 'Europe/Moscow')::date;
 END IF;
 -- Paid and partially paid history is never rewritten or deleted by contract edits.
 DELETE FROM public.payments WHERE deal_id=d.id AND crm_charge IS NOT NULL AND NOT(crm_charge=ANY(keep)) AND status IN ('expected','overdue') AND coalesce(paid_amount,0)=0 AND paid_at IS NULL AND planned_date>(now() AT TIME ZONE 'Europe/Moscow')::date;
END $$;


ALTER FUNCTION public.finance_sync_booking(uuid) RENAME TO finance_sync_managed_booking;
REVOKE ALL ON FUNCTION public.finance_sync_managed_booking(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.finance_sync_booking(p_booking uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.bookings WHERE id=p_booking AND service_type='commission_only') THEN RETURN 0; END IF;
 RETURN public.finance_sync_managed_booking(p_booking);
END $$;
REVOKE ALL ON FUNCTION public.finance_sync_booking(uuid) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.finance_save_booking(uuid,jsonb,uuid,uuid) RENAME TO finance_save_managed_booking;
REVOKE ALL ON FUNCTION public.finance_save_managed_booking(uuid,jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.finance_save_booking(p_booking uuid,p_input jsonb,p_account uuid DEFAULT NULL,p_actor uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid:=coalesce(p_booking,gen_random_uuid()); old public.bookings; prop public.properties; d public.deals;
 service text; s date:=(p_input->>'start_date')::date; e date:=(p_input->>'end_date')::date; x jsonb;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 SELECT * INTO prop FROM public.properties WHERE id=(p_input->>'property_id')::uuid AND portfolio='rm' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Выберите объект Резиденции Море'; END IF;
 SELECT * INTO old FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF p_booking IS NOT NULL AND old.id IS NULL THEN RAISE EXCEPTION 'Бронь не найдена'; END IF;
 service:=coalesce(p_input->>'service_type',old.service_type,prop.service_type::text,'management');
 IF service NOT IN ('management','commission_only') THEN RAISE EXCEPTION 'Выберите формат работы по аренде'; END IF;
 IF old.id IS NOT NULL AND old.service_type<>service THEN RAISE EXCEPTION 'Формат действующей аренды нельзя менять вместе с датами. Оформите новый договор, сохранив финансовую историю'; END IF;
 IF service='management' THEN RETURN public.finance_save_managed_booking(p_booking,p_input-'service_type',p_account,p_actor); END IF;
 IF p_input ? 'financial_terms' OR p_input ? 'management_fee_value' OR p_input ? 'management_fee_type' THEN RAISE EXCEPTION 'Для разовой комиссии ежемесячные финансовые условия не задаются'; END IF;
 IF old.id IS NOT NULL AND (old.property_id IS DISTINCT FROM prop.id OR old.client_id IS DISTINCT FROM (p_input->>'client_id')::uuid) THEN RAISE EXCEPTION 'Для смены клиента или объекта создайте новую бронь'; END IF;
 IF s IS NULL OR e IS NULL OR e<=s OR e>s+interval '20 years' OR coalesce(p_input->>'stay_kind','long_term')<>'long_term' OR coalesce(p_input->>'price_type','') NOT IN ('fixed','periodic') OR coalesce(p_input->>'status','') NOT IN ('active','completed','cancelled') OR coalesce((p_input->>'payment_day')::int,0) NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Проверьте условия долгосрочной аренды'; END IF;
 IF (p_input->>'deposit')::numeric<0 OR p_input->>'deposit' IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Проверьте обеспечительный платёж'; END IF;
 IF p_input->>'price_type'='fixed' AND (coalesce((p_input->>'price_month')::numeric,0)<=0 OR p_input->>'price_month' IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Укажите стоимость аренды'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings WHERE id<>b AND property_id=prop.id AND status::text='active' AND start_date<e AND end_date>s) AND p_input->>'status'='active' THEN RAISE EXCEPTION 'Объект уже забронирован на эти даты'; END IF;
 SELECT * INTO d FROM public.deals WHERE booking_id=p_booking AND finance_terms IS NOT NULL FOR UPDATE;
 IF d.id IS NOT NULL THEN PERFORM set_config('rm.crm_finance_write',b::text,true); END IF;
 IF old.id IS NULL THEN
  INSERT INTO public.bookings(id,property_id,client_id,start_date,end_date,price_type,price_month,payment_day,deposit,source,status,comment,stay_kind,service_type)
  VALUES(b,prop.id,(p_input->>'client_id')::uuid,s,e,(p_input->>'price_type')::public.booking_price_type,(p_input->>'price_month')::numeric,(p_input->>'payment_day')::int,(p_input->>'deposit')::numeric,(p_input->>'source')::public.booking_source,(p_input->>'status')::public.booking_status,coalesce(p_input->>'comment',''),'long_term','commission_only');
 ELSE
  UPDATE public.bookings SET start_date=s,end_date=e,price_type=(p_input->>'price_type')::public.booking_price_type,price_month=(p_input->>'price_month')::numeric,payment_day=(p_input->>'payment_day')::int,deposit=(p_input->>'deposit')::numeric,source=(p_input->>'source')::public.booking_source,status=(p_input->>'status')::public.booking_status,comment=coalesce(p_input->>'comment','') WHERE id=b;
 END IF;
 DELETE FROM public.booking_price_periods WHERE booking_id=b;
 IF p_input->>'price_type'='periodic' THEN
  IF jsonb_typeof(p_input->'periods') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'periods') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Проверьте периоды сезонных цен'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_input->'periods') LOOP
   IF nullif(x->>'start_date','') IS NULL OR nullif(x->>'end_date','') IS NULL OR nullif(x->>'price_month','') IS NULL OR (x->>'start_date')::date<s OR (x->>'end_date')::date>e OR (x->>'end_date')::date<(x->>'start_date')::date OR (x->>'price_month')::numeric<=0 OR x->>'price_month' IN ('NaN','Infinity','-Infinity') OR (SELECT count(*) FROM jsonb_array_elements(p_input->'periods') z WHERE (z->>'start_date')::date<=(x->>'end_date')::date AND (z->>'end_date')::date>=(x->>'start_date')::date)>1 THEN RAISE EXCEPTION 'Проверьте периоды сезонных цен'; END IF;
   INSERT INTO public.booking_price_periods(booking_id,start_date,end_date,price_month) VALUES(b,(x->>'start_date')::date,(x->>'end_date')::date,(x->>'price_month')::numeric);
  END LOOP;
 END IF;
 IF d.id IS NOT NULL THEN
  UPDATE public.deals SET start_date=s,end_date=e,price_month=(p_input->>'price_month')::numeric,payment_day=(p_input->>'payment_day')::int,deposit=(p_input->>'deposit')::numeric,income_type='amount',income_value=0,income_month=0,finance_terms=finance_terms||jsonb_build_object('service_type','commission_only') WHERE id=d.id;
  PERFORM public.crm_sync_commission(d.id);
 END IF;
 RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.finance_save_booking(uuid,jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_save_booking(uuid,jsonb,uuid,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
