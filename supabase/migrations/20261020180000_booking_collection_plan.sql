-- Explicit agreed cash schedules (e.g. one collection for a quarter).
-- Amounts are agreed totals, independent of daily accrual; no change to occupancy dates.
ALTER TABLE public.finance_booking_cash_terms ADD COLUMN collection_plan jsonb
 CHECK(collection_plan IS NULL OR jsonb_typeof(collection_plan)='array');

CREATE OR REPLACE FUNCTION public.finance_booking_cash_fee(p_booking uuid,p_period date,p_amount numeric) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE terms public.finance_booking_cash_terms; b public.bookings; prop public.properties; deal public.deals; calculation jsonb;
 day date; price numeric; owner_amount numeric; daily_fee numeric; total numeric:=0; matches int; rate numeric; fee_type text; entry jsonb;
BEGIN
 SELECT * INTO terms FROM public.finance_booking_cash_terms WHERE id=p_booking;
 IF terms.id IS NULL THEN RETURN NULL; END IF;
 IF terms.collection_plan IS NOT NULL THEN
  SELECT x INTO entry FROM jsonb_array_elements(terms.collection_plan) x WHERE (x->>'period')::date=p_period;
  IF entry IS NULL THEN RETURN NULL; END IF;
  RETURN round((entry->>'company_fee')::numeric*p_amount/(entry->>'amount')::numeric,2);
 END IF;
 IF terms.owner_rates='[]'::jsonb THEN RETURN NULL; END IF;
 calculation:=public.finance_booking_period(p_booking,p_period);
 IF NOT coalesce((calculation->>'scheduled')::boolean,false) OR (calculation->>'amount')::numeric<=0 THEN RETURN NULL; END IF;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking;
 SELECT * INTO prop FROM public.properties WHERE id=b.property_id;
 SELECT * INTO deal FROM public.deals WHERE booking_id=b.id AND finance_terms IS NOT NULL;
 rate:=coalesce(deal.income_value,prop.management_fee_value); fee_type:=coalesce(deal.income_type::text,prop.management_fee_type::text);
 FOR day IN SELECT generate_series((calculation->>'from')::date,(calculation->>'to')::date-1,interval '1 day')::date LOOP
  SELECT (x->>'monthlyRate')::numeric INTO price FROM jsonb_array_elements(calculation->'parts') x WHERE (x->>'from')::date<=day AND (x->>'to')::date>day;
  SELECT count(*),min((x->>'owner_monthly')::numeric) INTO matches,owner_amount FROM jsonb_array_elements(terms.owner_rates) x WHERE (x->>'from')::date<=day AND (x->>'to')::date>=day;
  IF matches>1 THEN RAISE EXCEPTION 'Периоды выплат собственнику пересекаются'; END IF;
  IF matches=1 THEN
   IF owner_amount<0 OR owner_amount>price OR owner_amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Сумма собственнику должна входить в арендную плату'; END IF;
   daily_fee:=price-owner_amount;
  ELSE daily_fee:=CASE WHEN fee_type='percent' THEN price*rate/100 ELSE rate END; END IF;
  IF daily_fee IS NULL OR daily_fee<0 OR daily_fee>price THEN RAISE EXCEPTION 'Проверьте комиссию аренды'; END IF;
  total:=total+daily_fee/(calculation->>'cycleDays')::numeric;
 END LOOP;
 RETURN round(total*p_amount/(calculation->>'amount')::numeric,2);
END $$;
REVOKE ALL ON FUNCTION public.finance_booking_cash_fee(uuid,date,numeric) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.finance_sync_booking(p_booking uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; acct text; account_id uuid; m date; due date; rent numeric; expected_fee numeric; prop public.properties;
 calculation jsonb; cash_plan jsonb; entry jsonb; description text; a uuid; d public.deals; n int:=0; keep date[]:=ARRAY[]::date[];
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
 SELECT collection_plan INTO cash_plan FROM public.finance_booking_cash_terms WHERE id=b.id;
 previous:=current_setting('rm.booking_schedule_write',true);
 PERFORM set_config('rm.booking_schedule_write',b.id::text,true);
 IF b.status::text='active' THEN
  IF EXISTS(SELECT 1 FROM public.finance_accounts WHERE id=account_id AND archived) THEN RAISE EXCEPTION 'Счёт графика архивный: выберите действующий счёт в брони'; END IF;
  SELECT id INTO a FROM public.finance_articles WHERE code='rent_in';
  FOR m IN SELECT generate_series(greatest(date_trunc('month',b.start_date)::date,date_trunc('month',today)::date),date_trunc('month',b.end_date)::date,interval '1 month')::date LOOP
   entry:=NULL;
   IF cash_plan IS NOT NULL THEN
    SELECT x INTO entry FROM jsonb_array_elements(cash_plan) x WHERE (x->>'period')::date=m;
    IF entry IS NULL THEN CONTINUE; END IF;
   END IF;
   calculation:=public.finance_booking_period(b.id,m);
   IF NOT (calculation->>'scheduled')::boolean THEN CONTINUE; END IF;
   due:=coalesce((entry->>'date')::date,(calculation->>'due')::date);
   IF due<today OR due<(SELECT receipts_from FROM public.finance_booking_cash_terms WHERE id=b.id) THEN CONTINUE; END IF;
   SELECT * INTO prop FROM public.properties WHERE id=b.property_id;
   rent:=coalesce((entry->>'amount')::numeric,(calculation->>'amount')::numeric);
   expected_fee:=round(CASE WHEN coalesce(d.income_type::text,prop.management_fee_type::text)='percent' THEN rent*coalesce(d.income_value,prop.management_fee_value)/100 ELSE coalesce(d.income_value,prop.management_fee_value)*(calculation->>'occupiedDays')::numeric/(calculation->>'cycleDays')::numeric END,2);
   expected_fee:=coalesce(public.finance_booking_cash_fee(b.id,m,rent),expected_fee);
   description:='Аренда за '||to_char((calculation->>'from')::date,'DD.MM.YYYY')||' — '||to_char((calculation->>'to')::date,'DD.MM.YYYY')||' (выезд не включён), '||(calculation->>'occupiedDays')||'/'||(calculation->>'cycleDays')||' дней';
   IF entry IS NOT NULL THEN
    description:='Аренда: согласованный платёж за '||to_char(m,'DD.MM.YYYY')||' — '||to_char((entry->>'through')::date,'DD.MM.YYYY')||'. Сумма и комиссия заданы в отдельном графике брони.';
   END IF;
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


CREATE FUNCTION public.finance_set_booking_collection_plan(p_booking uuid,p_plan jsonb,p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; terms public.finance_booking_cash_terms; x jsonb; today date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.bookings WHERE id=p_booking) FOR UPDATE;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking FOR UPDATE;
 SELECT * INTO terms FROM public.finance_booking_cash_terms WHERE id=p_booking FOR UPDATE;
 IF b.id IS NULL OR b.stay_kind::text<>'long_term' OR terms.id IS NULL THEN RAISE EXCEPTION 'Сначала задайте первое поступление по брони'; END IF;
 IF p_plan IS NOT NULL THEN
  IF jsonb_typeof(p_plan) IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Укажите от 1 до 100 платежей'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_plan) LOOP
   IF NOT(x ?& ARRAY['period','through','date','amount','company_fee']) OR
    nullif(x->>'period','') IS NULL OR nullif(x->>'through','') IS NULL OR nullif(x->>'date','') IS NULL OR
    nullif(x->>'amount','') IS NULL OR nullif(x->>'company_fee','') IS NULL OR
    (x->>'period')::date<>date_trunc('month',(x->>'period')::date)::date OR
    (x->>'period')::date<date_trunc('month',b.start_date)::date OR (x->>'period')::date>=b.end_date OR
    (x->>'through')::date<(x->>'period')::date OR (x->>'through')::date>b.end_date OR
    (x->>'date')::date<terms.receipts_from OR (x->>'date')::date>=b.end_date OR
    (x->>'amount')::numeric<=0 OR (x->>'company_fee')::numeric<0 OR (x->>'company_fee')::numeric>(x->>'amount')::numeric OR
    (x->>'amount') IN ('NaN','Infinity','-Infinity') OR (x->>'company_fee') IN ('NaN','Infinity','-Infinity') OR
    (SELECT count(*) FROM jsonb_array_elements(p_plan) v WHERE (v->>'period')::date<=(x->>'through')::date AND (v->>'through')::date>=(x->>'period')::date)>1
   THEN RAISE EXCEPTION 'Проверьте суммы, сроки и непересекающиеся периоды графика'; END IF;
  END LOOP;
 END IF;
 -- An explicit cash schedule cannot silently replace a paid/partial/manual or advance graph.
 IF EXISTS(SELECT 1 FROM public.payments p WHERE booking_id=b.id AND rental_component='rent' AND
   (NOT rental_schedule OR rental_installment_id IS NOT NULL OR status::text IN ('paid','partial') OR paid_at IS NOT NULL OR coalesce(paid_amount,0)>0 OR planned_date<=today)
   AND p_plan IS DISTINCT FROM terms.collection_plan)
 THEN RAISE EXCEPTION 'В брони есть проведённые платежи или отдельный график: проверьте их перед изменением'; END IF;
 UPDATE public.finance_booking_cash_terms SET collection_plan=p_plan,updated_at=now() WHERE id=b.id;
 PERFORM public.finance_sync_booking(b.id);
END $$;
REVOKE ALL ON FUNCTION public.finance_set_booking_collection_plan(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_set_booking_collection_plan(uuid,jsonb,uuid) TO authenticated,service_role;

CREATE FUNCTION public.finance_guard_collection_installments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.finance_booking_cash_terms WHERE id=NEW.booking_id AND collection_plan IS NOT NULL) THEN
  RAISE EXCEPTION 'У брони есть отдельный график поступлений. Измените его вместо создания второго прихода';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_collection_installments BEFORE INSERT OR UPDATE ON public.finance_rental_installments FOR EACH ROW EXECUTE FUNCTION public.finance_guard_collection_installments();
REVOKE ALL ON FUNCTION public.finance_guard_collection_installments() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
