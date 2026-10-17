-- A booking is the source of rental dates, seasonal prices and payment dates.
CREATE TABLE public.finance_booking_schedules (
 id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE RESTRICT,
 account_id uuid NOT NULL REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_booking_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_booking_schedules_admin ON public.finance_booking_schedules
 FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin'))
 WITH CHECK(public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.finance_booking_schedules TO authenticated;
GRANT ALL ON public.finance_booking_schedules TO service_role;
CREATE TRIGGER log_finance_booking_schedules AFTER INSERT OR UPDATE OR DELETE
 ON public.finance_booking_schedules FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE FUNCTION public.finance_sync_booking(p_booking uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; acct text; account_id uuid; m date; due date; rent numeric;
 a uuid; d public.deals; n int:=0; keep date[]:=ARRAY[]::date[];
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
   due:=m+(least(b.payment_day,extract(day FROM m+interval '1 month - 1 day')::int)-1);
   IF due<b.start_date OR due>=b.end_date OR due<today THEN CONTINUE; END IF;
   rent:=b.price_month;
   IF b.price_type::text='periodic' THEN
    SELECT CASE WHEN count(*)=1 THEN min(price_month) ELSE NULL END INTO rent FROM public.booking_price_periods WHERE booking_id=b.id AND start_date<=due AND end_date>=due;
   END IF;
   IF rent IS NULL OR rent<=0 OR rent::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Укажите единственную положительную цену аренды на %',due; END IF;
   keep:=array_append(keep,m);
   -- Explicit advance/balance pairs and manual/received payments are never rewritten.
   IF EXISTS(SELECT 1 FROM public.payments WHERE booking_id=b.id AND rental_period=m AND rental_component='rent' AND (NOT rental_schedule OR rental_installment_id IS NOT NULL OR status::text IN ('paid','partial') OR paid_at IS NOT NULL OR coalesce(paid_amount,0)>0 OR planned_date<=today)) THEN CONTINUE; END IF;
   UPDATE public.payments SET amount=rent,planned_date=due,account=acct,company_fee=NULL
    WHERE booking_id=b.id AND rental_period=m AND rental_schedule AND planned_date>today
     AND status::text IN ('expected','overdue') AND paid_at IS NULL AND coalesce(paid_amount,0)=0
     AND (amount IS DISTINCT FROM rent OR planned_date IS DISTINCT FROM due OR account IS DISTINCT FROM acct);
   IF NOT EXISTS(SELECT 1 FROM public.payments WHERE booking_id=b.id AND rental_period=m AND rental_component='rent') THEN
    INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,client_id,booking_id,deal_id,account,comment,article_id,rental_component,rental_period,rental_schedule)
    VALUES(due,rent,'in','expected','rent_in',b.property_id,b.client_id,b.id,d.id,acct,'Аренда за '||to_char(m,'MM.YYYY'),a,'rent',m,true);
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
REVOKE ALL ON FUNCTION public.finance_sync_booking(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Deferred triggers see the final set of seasonal periods in the transaction.
CREATE FUNCTION public.finance_booking_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid;
BEGIN
 IF TG_TABLE_NAME='bookings' THEN b:=NEW.id;
 ELSE b:=CASE WHEN TG_OP='DELETE' THEN OLD.booking_id ELSE NEW.booking_id END; END IF;
 PERFORM public.finance_sync_booking(b);
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finance_booking_changed AFTER INSERT OR UPDATE ON public.bookings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finance_booking_changed();
CREATE CONSTRAINT TRIGGER finance_booking_period_changed AFTER INSERT OR UPDATE OR DELETE ON public.booking_price_periods
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finance_booking_changed();
REVOKE ALL ON FUNCTION public.finance_booking_changed() FROM PUBLIC,anon,authenticated,service_role;

-- Retain the existing action for old clients, but enable permanent synchronization.
CREATE OR REPLACE FUNCTION public.finance_create_rental_schedule(p_booking uuid,p_account text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a uuid;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 SELECT id INTO a FROM public.finance_accounts WHERE name=p_account AND NOT archived;
 IF a IS NULL THEN RAISE EXCEPTION 'Выберите действующий счёт'; END IF;
 INSERT INTO public.finance_booking_schedules(id,account_id) VALUES(p_booking,a)
 ON CONFLICT(id) DO UPDATE SET account_id=EXCLUDED.account_id;
 RETURN public.finance_sync_booking(p_booking);
END $$;

-- All editor changes are atomic: booking, seasonal periods, CRM and finance.
CREATE FUNCTION public.finance_save_booking(p_booking uuid,p_input jsonb,p_account uuid DEFAULT NULL,p_actor uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid:=coalesce(p_booking,gen_random_uuid()); old public.bookings; d public.deals;
 x jsonb; a uuid; s date:=(p_input->>'start_date')::date; e date:=(p_input->>'end_date')::date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
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
 IF d.id IS NOT NULL THEN
  UPDATE public.deals SET start_date=s,end_date=e,price_month=(p_input->>'price_month')::numeric,payment_day=(p_input->>'payment_day')::int,deposit=(p_input->>'deposit')::numeric,
   finance_terms=jsonb_set(finance_terms,'{seasons}',CASE WHEN p_input->>'price_type'='periodic' THEN
    coalesce((SELECT jsonb_agg(jsonb_build_object('start_date',start_date,'end_date',least(end_date,e-1),'price_month',price_month) ORDER BY start_date) FROM public.booking_price_periods WHERE booking_id=b AND price_month IS DISTINCT FROM (p_input->>'price_month')::numeric),'[]'::jsonb) ELSE '[]'::jsonb END)
   WHERE id=d.id;
  PERFORM public.crm_sync_commission(d.id);
 END IF;
 PERFORM public.finance_sync_booking(b);
 RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.finance_save_booking(uuid,jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_save_booking(uuid,jsonb,uuid,uuid) TO authenticated,service_role;

-- Removing a financed booking means cancellation; financial history remains attached.
CREATE FUNCTION public.finance_cancel_booking(p_booking uuid,p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 IF NOT EXISTS(SELECT 1 FROM public.bookings b JOIN public.properties p ON p.id=b.property_id WHERE b.id=p_booking AND b.stay_kind::text='long_term' AND p.portfolio='rm') THEN RAISE EXCEPTION 'Бронь РМ не найдена'; END IF;
 UPDATE public.bookings SET status='cancelled' WHERE id=p_booking;
 PERFORM public.finance_sync_booking(p_booking);
END $$;
REVOKE ALL ON FUNCTION public.finance_cancel_booking(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_cancel_booking(uuid,uuid) TO authenticated,service_role;

-- Protect the generated contract rows from independent schedule edits.
CREATE FUNCTION public.finance_guard_booking_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT OLD.rental_schedule OR current_setting('rm.booking_schedule_write',true)=OLD.booking_id::text THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Отмените бронь: график связан с её условиями'; END IF;
 IF (NEW.amount,NEW.planned_date,NEW.booking_id,NEW.property_id,NEW.client_id,NEW.rental_component,NEW.rental_period,NEW.rental_schedule) IS DISTINCT FROM (OLD.amount,OLD.planned_date,OLD.booking_id,OLD.property_id,OLD.client_id,OLD.rental_component,OLD.rental_period,OLD.rental_schedule) THEN RAISE EXCEPTION 'Измените условия брони: график обновится автоматически'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_guard_booking_payment BEFORE UPDATE OR DELETE ON public.payments
 FOR EACH ROW EXECUTE FUNCTION public.finance_guard_booking_payment();
REVOKE ALL ON FUNCTION public.finance_guard_booking_payment() FROM PUBLIC,anon,authenticated,service_role;
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

REVOKE ALL ON FUNCTION public.crm_sync_commission_legacy(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_sync_commission(p_deal uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid;
BEGIN
 PERFORM public.crm_sync_commission_legacy(p_deal);
 SELECT booking_id INTO b FROM public.deals WHERE id=p_deal;
 IF b IS NOT NULL THEN PERFORM public.finance_sync_booking(b); END IF;
END $$;
REVOKE ALL ON FUNCTION public.crm_sync_commission(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Cancellation cleanup now passes through the synchronized writer guard.
CREATE OR REPLACE FUNCTION public.finance_cancel_rental_schedule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.finance_sync_booking(NEW.id);
 RETURN NEW;
END $$;
NOTIFY pgrst,'reload schema';

DROP TRIGGER IF EXISTS finance_cancel_rental_schedule ON public.bookings;

-- Account deletion transfers the stable schedule link together with payment history.
ALTER FUNCTION public.finance_account_usage(uuid) RENAME TO finance_account_usage_before_booking_sync;
CREATE FUNCTION public.finance_account_usage(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN public.finance_account_usage_before_booking_sync(p_id)||jsonb_build_object('schedules',(SELECT count(*) FROM public.finance_booking_schedules WHERE account_id=p_id));
END $$;
ALTER FUNCTION public.delete_finance_account(uuid,uuid) RENAME TO delete_finance_account_before_booking_sync;
CREATE FUNCTION public.delete_finance_account(p_id uuid,p_transfer_to uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT coalesce(auth.role()='service_role' OR public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 PERFORM 1 FROM public.finance_accounts WHERE id IN(p_id,p_transfer_to) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.finance_booking_schedules WHERE account_id=p_id) THEN
  IF p_transfer_to IS NULL OR p_transfer_to=p_id OR NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE id=p_transfer_to AND NOT archived) THEN RAISE EXCEPTION 'Выберите действующий счёт для переноса графиков аренды'; END IF;
  UPDATE public.finance_booking_schedules SET account_id=p_transfer_to WHERE account_id=p_id;
 END IF;
 PERFORM public.delete_finance_account_before_booking_sync(p_id,p_transfer_to);
END $$;
REVOKE ALL ON FUNCTION public.finance_account_usage_before_booking_sync(uuid),public.delete_finance_account_before_booking_sync(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finance_account_usage(uuid),public.delete_finance_account(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_account_usage(uuid),public.delete_finance_account(uuid,uuid) TO authenticated,service_role;

-- A prepayment pair replaces the month's unreceived automatic receipt atomically.
ALTER FUNCTION public.finance_create_rental_installments(uuid,date,numeric,numeric,numeric,date,date,text,uuid)
 RENAME TO finance_create_rental_installments_before_booking_sync;
CREATE FUNCTION public.finance_create_rental_installments(
 p_booking uuid,p_period date,p_total numeric,p_fee numeric,p_advance numeric,
 p_advance_date date,p_balance_date date,p_account text,p_request uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid; previous text;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.bookings WHERE id=p_booking) FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=p_booking FOR UPDATE;
 previous:=current_setting('rm.booking_schedule_write',true);
 PERFORM set_config('rm.booking_schedule_write',p_booking::text,true);
 DELETE FROM public.payments WHERE booking_id=p_booking AND rental_period=p_period AND rental_schedule
  AND rental_component='rent' AND rental_installment_id IS NULL AND planned_date>(now() AT TIME ZONE 'Europe/Moscow')::date
  AND status::text IN ('expected','overdue') AND paid_at IS NULL AND coalesce(paid_amount,0)=0;
 result:=public.finance_create_rental_installments_before_booking_sync(p_booking,p_period,p_total,p_fee,p_advance,p_advance_date,p_balance_date,p_account,p_request);
 PERFORM set_config('rm.booking_schedule_write',coalesce(previous,''),true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_create_rental_installments_before_booking_sync(uuid,date,numeric,numeric,numeric,date,date,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finance_create_rental_installments(uuid,date,numeric,numeric,numeric,date,date,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finance_create_rental_installments(uuid,date,numeric,numeric,numeric,date,date,text,uuid) TO authenticated;

-- Receive or partially settle the existing row instead of adding the same rent twice.
CREATE FUNCTION public.finance_guard_duplicate_scheduled_rent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.rental_component='rent' AND NOT NEW.rental_schedule AND NEW.rental_installment_id IS NULL THEN
  PERFORM 1 FROM public.properties WHERE id=NEW.property_id FOR UPDATE;
  PERFORM 1 FROM public.bookings WHERE id=NEW.booking_id FOR UPDATE;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.rental_component,OLD.booking_id,OLD.rental_period) IS NOT DISTINCT FROM (NEW.rental_component,NEW.booking_id,NEW.rental_period) THEN RETURN NEW; END IF;
 IF NEW.rental_component='rent' AND NOT NEW.rental_schedule AND NEW.rental_installment_id IS NULL
  AND EXISTS(SELECT 1 FROM public.payments WHERE booking_id=NEW.booking_id AND rental_schedule AND rental_component='rent'
   AND rental_period=coalesce(NEW.rental_period,date_trunc('month',NEW.planned_date)::date))
 THEN RAISE EXCEPTION 'Аренда за этот месяц уже есть в графике. Откройте её для подтверждения оплаты или используйте «Предоплата и остаток»'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_guard_duplicate_scheduled_rent BEFORE INSERT OR UPDATE ON public.payments
 FOR EACH ROW EXECUTE FUNCTION public.finance_guard_duplicate_scheduled_rent();
REVOKE ALL ON FUNCTION public.finance_guard_duplicate_scheduled_rent() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
