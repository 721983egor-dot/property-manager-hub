-- Keep the original release migration immutable; upgrade existing installations too.
CREATE OR REPLACE FUNCTION public.crm_sync_commission(p_deal uuid) RETURNS void
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
 DELETE FROM public.payments WHERE deal_id=d.id AND crm_charge IS NOT NULL AND NOT(crm_charge=ANY(keep)) AND status IN ('expected','overdue') AND coalesce(paid_amount,0)=0 AND paid_at IS NULL AND (b.status<>'cancelled' OR planned_date>=(now() AT TIME ZONE 'Europe/Moscow')::date);
END $$;

CREATE OR REPLACE FUNCTION public.crm_guard_linked_booking_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid;
BEGIN
 IF TG_TABLE_NAME='bookings' THEN b:=NEW.id;
  IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status AND
   (to_jsonb(NEW)-'status'-'updated_at')=(to_jsonb(OLD)-'status'-'updated_at') AND
   coalesce(auth.role()='service_role' OR public.has_role(auth.uid(),'admin'),false) THEN RETURN NEW; END IF;
 ELSE b:=CASE WHEN TG_OP='DELETE' THEN OLD.booking_id ELSE NEW.booking_id END;
 END IF;
 IF EXISTS(SELECT 1 FROM public.deals WHERE booking_id=b AND finance_terms IS NOT NULL) AND current_setting('rm.crm_finance_write',true) IS DISTINCT FROM b::text THEN
  RAISE EXCEPTION 'Для связанной с финансами брони используйте редактор брони администратора: график должен пересчитываться вместе с условиями';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.crm_cancel_linked_commission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid;
BEGIN
 IF current_setting('rm.crm_finance_write',true)=NEW.id::text THEN RETURN NEW; END IF;
 SELECT id INTO d FROM public.deals WHERE booking_id=NEW.id AND finance_terms IS NOT NULL;
 IF d IS NOT NULL THEN PERFORM public.crm_sync_commission(d); END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.crm_protect_finance_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.deals WHERE booking_id=OLD.id AND finance_terms IS NOT NULL) THEN RAISE EXCEPTION 'У брони есть финансовый график: отмените бронь вместо удаления'; END IF;
 RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS crm_cancel_linked_commission ON public.bookings;
CREATE TRIGGER crm_cancel_linked_commission AFTER UPDATE OF status ON public.bookings FOR EACH ROW WHEN (NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.crm_cancel_linked_commission();
NOTIFY pgrst,'reload schema';
