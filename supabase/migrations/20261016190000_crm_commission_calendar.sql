-- CRM contract terms and company income share one atomic financial schedule.
ALTER TABLE public.deals ADD COLUMN finance_terms jsonb;
ALTER TABLE public.payments ADD COLUMN crm_charge text, ADD COLUMN rental_turnover numeric;
CREATE UNIQUE INDEX payments_crm_charge ON public.payments(deal_id,crm_charge) WHERE crm_charge IS NOT NULL;
INSERT INTO public.finance_articles(name,direction,code,affects_profit,category_id)
 SELECT 'Разовая комиссия за аренду','in','rental_commission',true,id FROM public.finance_article_categories
 WHERE name='Доход компании' AND direction='in' ORDER BY id LIMIT 1
ON CONFLICT(code) WHERE code IS NOT NULL DO NOTHING;

-- Internal: only callers that already checked the administrator may rebuild a plan.
CREATE FUNCTION public.crm_sync_commission(p_deal uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.deals; b public.bookings; t jsonb; m date; due date; rent numeric; fee numeric;
 a uuid; acct text; keep text[]:=ARRAY[]::text[]; charge text; x jsonb; n int;
BEGIN
 SELECT * INTO d FROM public.deals WHERE id=p_deal FOR UPDATE;
 t:=d.finance_terms;
 IF t IS NULL THEN RETURN; END IF;
 SELECT name INTO acct FROM public.finance_accounts WHERE id=(t->>'account_id')::uuid AND NOT archived FOR SHARE;
 IF acct IS NULL THEN RAISE EXCEPTION 'Выберите действующий счёт для дохода компании'; END IF;
 IF d.booking_id IS NOT NULL THEN
  SELECT * INTO b FROM public.bookings WHERE id=d.booking_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Связанная бронь удалена'; END IF;
 ELSE
  b.start_date:=d.start_date;b.end_date:=d.end_date;b.price_month:=d.price_month;b.payment_day:=d.payment_day;b.status:='active';b.price_type:='fixed';
 END IF;
 IF b.end_date IS NULL OR b.start_date IS NULL OR b.end_date<=b.start_date OR b.payment_day IS NULL OR b.payment_day NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Проверьте даты и день оплаты'; END IF;
 IF b.end_date>b.start_date+interval '20 years' THEN RAISE EXCEPTION 'Срок графика не более 20 лет'; END IF;
 IF b.status<>'cancelled' THEN
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
   WHERE payments.status IN ('expected','overdue') AND coalesce(payments.paid_amount,0)=0 AND payments.paid_at IS NULL;
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
   WHERE payments.status IN ('expected','overdue') AND coalesce(payments.paid_amount,0)=0 AND payments.paid_at IS NULL;
 END IF;
 -- Paid and partially paid history is never rewritten or deleted by contract edits.
 DELETE FROM public.payments WHERE deal_id=d.id AND crm_charge IS NOT NULL AND NOT(crm_charge=ANY(keep)) AND status IN ('expected','overdue') AND coalesce(paid_amount,0)=0 AND paid_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.crm_sync_commission(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.crm_close_won_finance(p_deal uuid,p_terms jsonb,p_actor uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.deals; b uuid; t jsonb; x jsonb; y jsonb; s date; e date; boundary date; finish date; price numeric;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 SELECT * INTO d FROM public.deals WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Сделка не найдена'; END IF;
 s:=(p_terms->>'start_date')::date;e:=(p_terms->>'end_date')::date;
 t:=jsonb_build_object('account_id',p_terms->>'account_id','one_time',coalesce((p_terms->>'one_time')::numeric,0),'one_time_date',p_terms->>'one_time_date','seasons',coalesce(p_terms->'seasons','[]'::jsonb));
 IF (t->>'one_time')::numeric<0 OR (t->>'one_time') IN ('NaN','Infinity','-Infinity') OR ((t->>'one_time')::numeric>0 AND nullif(t->>'one_time_date','') IS NULL) THEN RAISE EXCEPTION 'Укажите сумму и дату разовой комиссии'; END IF;
 IF jsonb_typeof(t->'seasons')<>'array' OR jsonb_array_length(t->'seasons')>48 THEN RAISE EXCEPTION 'Проверьте сезонные цены'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(t->'seasons') LOOP
  IF nullif(x->>'start_date','') IS NULL OR nullif(x->>'end_date','') IS NULL OR nullif(x->>'price_month','') IS NULL OR (x->>'start_date')::date<s OR (x->>'end_date')::date>=e OR (x->>'end_date')::date<(x->>'start_date')::date OR (x->>'price_month')::numeric<=0 OR (x->>'price_month') IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Сезон должен находиться внутри аренды, цена больше нуля'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(t->'seasons') z WHERE (z->>'start_date')::date<=(x->>'end_date')::date AND (z->>'end_date')::date>=(x->>'start_date')::date)>1 THEN RAISE EXCEPTION 'Сезонные периоды пересекаются'; END IF;
 END LOOP;
 IF d.finance_terms IS NOT NULL THEN
  IF d.finance_terms<>t THEN RAISE EXCEPTION 'Финансовые условия уже сохранены. Изменяйте существующую бронь'; END IF;
 END IF;
 b:=public.crm_close_won(p_deal,(p_terms->>'property_id')::uuid,s,e,(p_terms->>'price_month')::numeric,(p_terms->>'deposit')::numeric,(p_terms->>'payment_day')::int,p_terms->>'closing_source',p_terms->>'income_type',(p_terms->>'income_value')::numeric,coalesce((p_terms->>'create_booking')::boolean,true),p_actor);
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

-- Existing booking editor uses this atomic path for financially linked CRM contracts.
CREATE FUNCTION public.crm_save_finance_booking(p_booking uuid,p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.deals; x jsonb; old public.bookings;
BEGIN
 PERFORM public.crm_check_actor(NULL);
 SELECT * INTO d FROM public.deals WHERE booking_id=p_booking AND finance_terms IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Связанный финансовый договор не найден'; END IF;
 SELECT * INTO old FROM public.bookings WHERE id=p_booking FOR UPDATE;
 PERFORM set_config('rm.crm_finance_write',p_booking::text,true);
 IF (p_input->>'property_id')::uuid IS DISTINCT FROM old.property_id OR (p_input->>'client_id')::uuid IS DISTINCT FROM old.client_id THEN RAISE EXCEPTION 'Для смены объекта или клиента оформите новую сделку'; END IF;
 IF p_input->>'stay_kind' IS DISTINCT FROM 'long_term' OR nullif(p_input->>'start_date','') IS NULL OR nullif(p_input->>'end_date','') IS NULL OR nullif(p_input->>'payment_day','') IS NULL OR nullif(p_input->>'status','') IS NULL OR nullif(p_input->>'price_type','') IS NULL OR (p_input->>'end_date')::date<=(p_input->>'start_date')::date OR p_input->>'price_type' NOT IN ('fixed','periodic') OR (p_input->>'payment_day')::int NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Проверьте условия долгосрочной аренды'; END IF;
 UPDATE public.bookings SET start_date=(p_input->>'start_date')::date,end_date=(p_input->>'end_date')::date,price_type=(p_input->>'price_type')::public.booking_price_type,price_month=(p_input->>'price_month')::numeric,payment_day=(p_input->>'payment_day')::int,deposit=(p_input->>'deposit')::numeric,status=(p_input->>'status')::public.booking_status,source=(p_input->>'source')::public.booking_source,comment=coalesce(p_input->>'comment','') WHERE id=p_booking;
 DELETE FROM public.booking_price_periods WHERE booking_id=p_booking;
 IF p_input->>'price_type'='periodic' THEN
 FOR x IN SELECT value FROM jsonb_array_elements(p_input->'periods') LOOP
  IF nullif(x->>'start_date','') IS NULL OR nullif(x->>'end_date','') IS NULL OR nullif(x->>'price_month','') IS NULL OR (x->>'start_date')::date<(p_input->>'start_date')::date OR (x->>'end_date')::date>(p_input->>'end_date')::date OR (SELECT count(*) FROM jsonb_array_elements(p_input->'periods') z WHERE (z->>'start_date')::date<=(x->>'end_date')::date AND (z->>'end_date')::date>=(x->>'start_date')::date)>1 OR (x->>'end_date')::date<(x->>'start_date')::date OR (x->>'price_month')::numeric<=0 THEN RAISE EXCEPTION 'Проверьте период и цену'; END IF;
  INSERT INTO public.booking_price_periods(booking_id,start_date,end_date,price_month) VALUES(p_booking,(x->>'start_date')::date,(x->>'end_date')::date,(x->>'price_month')::numeric);
 END LOOP;
 END IF;
 UPDATE public.deals SET start_date=(p_input->>'start_date')::date,end_date=(p_input->>'end_date')::date,price_month=(p_input->>'price_month')::numeric,payment_day=(p_input->>'payment_day')::int WHERE id=d.id;
 PERFORM public.crm_sync_commission(d.id);
 RETURN p_booking;
END $$;
REVOKE ALL ON FUNCTION public.crm_save_finance_booking(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_save_finance_booking(uuid,jsonb) TO authenticated;
-- Never allow an alternative editor to silently bypass the linked financial schedule.
CREATE FUNCTION public.crm_guard_linked_booking_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid;
BEGIN
 IF TG_TABLE_NAME='bookings' THEN b:=NEW.id;
 ELSE b:=CASE WHEN TG_OP='DELETE' THEN OLD.booking_id ELSE NEW.booking_id END;
 END IF;
 IF EXISTS(SELECT 1 FROM public.deals WHERE booking_id=b AND finance_terms IS NOT NULL) AND current_setting('rm.crm_finance_write',true) IS DISTINCT FROM b::text THEN
  RAISE EXCEPTION 'Для связанной с финансами брони используйте редактор брони администратора: график должен пересчитываться вместе с условиями';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_linked_booking_write BEFORE UPDATE OF start_date,end_date,price_type,price_month,payment_day,status,property_id,client_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.crm_guard_linked_booking_write();
CREATE TRIGGER crm_linked_booking_period_write BEFORE INSERT OR UPDATE OR DELETE ON public.booking_price_periods FOR EACH ROW EXECUTE FUNCTION public.crm_guard_linked_booking_write();
CREATE FUNCTION public.crm_protect_finance_booking() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.deals WHERE booking_id=OLD.id AND finance_terms IS NOT NULL) THEN RAISE EXCEPTION 'У брони есть финансовый график: отмените бронь вместо удаления'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER crm_protect_finance_booking BEFORE DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.crm_protect_finance_booking();
NOTIFY pgrst,'reload schema';
