-- One atomic booking editor for regular, quarterly, agreed and prepaid cash conditions.
ALTER TABLE public.finance_booking_cash_terms ADD COLUMN collection_interval integer NOT NULL DEFAULT 1
 CHECK(collection_interval BETWEEN 0 AND 12);
-- Existing explicitly agreed schedules remain fixed; no payment data changes on migration.
UPDATE public.finance_booking_cash_terms SET collection_interval=0 WHERE collection_plan IS NOT NULL;

CREATE FUNCTION public.finance_booking_cash_monthly_fee(p_booking uuid,p_period date,p_amount numeric) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE terms public.finance_booking_cash_terms; b public.bookings; prop public.properties; deal public.deals; calculation jsonb;
 day date; price numeric; owner_amount numeric; daily_fee numeric; total numeric:=0; matches int; rate numeric; fee_type text;
BEGIN
 SELECT * INTO terms FROM public.finance_booking_cash_terms WHERE id=p_booking;
 IF terms.id IS NULL OR terms.owner_rates='[]'::jsonb THEN RETURN NULL; END IF;
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
REVOKE ALL ON FUNCTION public.finance_booking_cash_monthly_fee(uuid,date,numeric) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finance_booking_auto_collection_plan(p_booking uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; t public.finance_booking_cash_terms; prop public.properties; d public.deals;
 m date; part_month date; calc jsonb; entry jsonb; old_entry jsonb; result jsonb:='[]';
 due date; through date; total numeric; fee numeric; part_fee numeric; rent numeric; i integer;
 today date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
 SELECT * INTO b FROM public.bookings WHERE id=p_booking;
 SELECT * INTO t FROM public.finance_booking_cash_terms WHERE id=p_booking;
 SELECT * INTO prop FROM public.properties WHERE id=b.property_id;
 SELECT * INTO d FROM public.deals WHERE booking_id=b.id AND finance_terms IS NOT NULL;
 IF t.collection_interval IS NULL OR t.collection_interval<=1 THEN RETURN t.collection_plan; END IF;
 m:=date_trunc('month',t.receipts_from)::date;
 WHILE m<b.end_date LOOP
  total:=0; fee:=0; through:=NULL;
  calc:=public.finance_booking_period(b.id,m);
  due:=CASE WHEN m=date_trunc('month',t.receipts_from)::date THEN t.receipts_from ELSE (calc->>'due')::date END;
  FOR i IN 0..t.collection_interval-1 LOOP
   part_month:=(m+make_interval(months=>i))::date;
   calc:=public.finance_booking_period(b.id,part_month);
   IF NOT coalesce((calc->>'scheduled')::boolean,false) THEN CONTINUE; END IF;
   rent:=(calc->>'amount')::numeric;
   part_fee:=coalesce(public.finance_booking_cash_monthly_fee(b.id,part_month,rent),
    round(CASE WHEN coalesce(d.income_type::text,prop.management_fee_type::text)='percent' THEN rent*coalesce(d.income_value,prop.management_fee_value)/100
    ELSE coalesce(d.income_value,prop.management_fee_value)*(calc->>'occupiedDays')::numeric/(calc->>'cycleDays')::numeric END,2));
   IF part_fee IS NULL OR part_fee<0 OR part_fee>rent THEN RAISE EXCEPTION 'Уточните комиссию или сумму собственнику'; END IF;
   total:=total+rent; fee:=fee+part_fee; through:=(calc->>'to')::date-1;
  END LOOP;
  SELECT x INTO old_entry FROM jsonb_array_elements(coalesce(t.collection_plan,'[]')) x WHERE (x->>'period')::date=m;
  IF old_entry IS NOT NULL AND EXISTS(SELECT 1 FROM public.payments WHERE booking_id=b.id AND rental_component='rent' AND rental_period=m AND
    (status IN ('paid','partial') OR paid_at IS NOT NULL OR coalesce(paid_amount,0)>0 OR planned_date<=today)) THEN
   entry:=old_entry;
  ELSE
   entry:=jsonb_build_object('period',m,'through',through,'date',due,'amount',round(total,2),'company_fee',round(fee,2));
  END IF;
  IF total>0 THEN result:=result||jsonb_build_array(entry); END IF;
  m:=(m+make_interval(months=>t.collection_interval))::date;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_booking_auto_collection_plan(uuid) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.finance_sync_booking(uuid) RENAME TO finance_sync_booking_rows;
REVOKE ALL ON FUNCTION public.finance_sync_booking_rows(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.finance_sync_booking_rows(p_booking uuid) RETURNS integer
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
   due:=coalesce((entry->>'date')::date,(SELECT receipts_from FROM public.finance_booking_cash_terms WHERE id=b.id AND date_trunc('month',receipts_from)::date=m),(calculation->>'due')::date);
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



CREATE FUNCTION public.finance_sync_booking(p_booking uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE plan jsonb;
BEGIN
 IF current_setting('rm.booking_finance_batch',true)='yes' THEN RETURN 0; END IF;
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.bookings WHERE id=p_booking) FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.finance_booking_cash_terms WHERE id=p_booking AND collection_interval>1) THEN
  plan:=public.finance_booking_auto_collection_plan(p_booking);
  UPDATE public.finance_booking_cash_terms SET collection_plan=plan,updated_at=now() WHERE id=p_booking AND collection_plan IS DISTINCT FROM plan;
 END IF;
 RETURN public.finance_sync_booking_rows(p_booking);
END $$;
REVOKE ALL ON FUNCTION public.finance_sync_booking(uuid) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.finance_set_booking_collection_plan(uuid,jsonb,uuid) RENAME TO finance_set_booking_collection_plan_base;
REVOKE ALL ON FUNCTION public.finance_set_booking_collection_plan_base(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.finance_set_booking_collection_plan_base(p_booking uuid,p_plan jsonb,p_actor uuid DEFAULT NULL) RETURNS void
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
    (x->>'date')::date<terms.receipts_from OR (x->>'date')::date>b.end_date OR
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

CREATE FUNCTION public.finance_set_booking_collection_plan(p_booking uuid,p_plan jsonb,p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.bookings WHERE id=p_booking) FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=p_booking FOR UPDATE;
 UPDATE public.finance_booking_cash_terms SET collection_interval=CASE WHEN p_plan IS NULL THEN 1 ELSE 0 END WHERE id=p_booking;
 PERFORM public.finance_set_booking_collection_plan_base(p_booking,p_plan,p_actor);
END $$;
REVOKE ALL ON FUNCTION public.finance_set_booking_collection_plan(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_set_booking_collection_plan(uuid,jsonb,uuid) TO authenticated,service_role;

ALTER FUNCTION public.finance_set_booking_cash_terms(uuid,date,jsonb,uuid) RENAME TO finance_set_booking_cash_terms_base;
REVOKE ALL ON FUNCTION public.finance_set_booking_cash_terms_base(uuid,date,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.finance_set_booking_cash_terms_base(p_booking uuid,p_receipts_from date,p_owner_rates jsonb DEFAULT '[]',p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; x jsonb; m date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.bookings WHERE id=p_booking) FOR UPDATE;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF b.id IS NULL OR b.stay_kind::text<>'long_term' OR p_receipts_from IS NULL OR p_receipts_from<b.start_date OR p_receipts_from>b.end_date THEN RAISE EXCEPTION 'Проверьте дату первого поступления по брони'; END IF;
 IF jsonb_typeof(p_owner_rates) IS DISTINCT FROM 'array' OR jsonb_array_length(p_owner_rates)>100 THEN RAISE EXCEPTION 'Проверьте периоды выплат собственнику'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_owner_rates) LOOP
  IF nullif(x->>'from','') IS NULL OR nullif(x->>'to','') IS NULL OR nullif(x->>'owner_monthly','') IS NULL OR (x->>'from')::date<b.start_date OR (x->>'to')::date>b.end_date OR (x->>'to')::date<(x->>'from')::date OR (x->>'owner_monthly')::numeric<0 OR (x->>'owner_monthly') IN ('NaN','Infinity','-Infinity') OR (SELECT count(*) FROM jsonb_array_elements(p_owner_rates) v WHERE (v->>'from')::date<=(x->>'to')::date AND (v->>'to')::date>=(x->>'from')::date)>1 THEN RAISE EXCEPTION 'Проверьте непересекающиеся периоды выплат собственнику'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.payments WHERE booking_id=b.id AND rental_schedule AND planned_date<p_receipts_from AND rental_installment_id IS NOT NULL) THEN RAISE EXCEPTION 'Сначала проверьте отдельный график предоплаты'; END IF;
 INSERT INTO public.finance_booking_cash_terms(id,receipts_from,owner_rates) VALUES(b.id,p_receipts_from,p_owner_rates)
 ON CONFLICT(id) DO UPDATE SET receipts_from=EXCLUDED.receipts_from,owner_rates=EXCLUDED.owner_rates,updated_at=now();
 -- Validate even future seasonal periods before changing the schedule.
 FOR m IN SELECT generate_series(date_trunc('month',b.start_date),date_trunc('month',b.end_date),interval '1 month')::date LOOP
  PERFORM public.finance_booking_cash_fee(b.id,m,1);
 END LOOP;
 PERFORM public.finance_sync_booking(b.id);
END $$;

CREATE FUNCTION public.finance_set_booking_cash_terms(p_booking uuid,p_receipts_from date,p_owner_rates jsonb DEFAULT '[]',p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.finance_booking_cash_terms;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.bookings WHERE id=p_booking) FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=p_booking FOR UPDATE;
 SELECT * INTO t FROM public.finance_booking_cash_terms WHERE id=p_booking;
 IF t.collection_interval>1 AND t.receipts_from IS DISTINCT FROM p_receipts_from AND EXISTS(SELECT 1 FROM public.payments WHERE booking_id=p_booking AND rental_component='rent' AND
  (status IN ('paid','partial') OR paid_at IS NOT NULL OR coalesce(paid_amount,0)>0 OR planned_date<=(now() AT TIME ZONE 'Europe/Moscow')::date)) THEN
  RAISE EXCEPTION 'Нельзя сдвигать уже оплаченный квартальный график: согласуйте следующий период отдельно';
 END IF;
 PERFORM public.finance_set_booking_cash_terms_base(p_booking,p_receipts_from,p_owner_rates,p_actor);
END $$;
REVOKE ALL ON FUNCTION public.finance_set_booking_cash_terms(uuid,date,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_set_booking_cash_terms(uuid,date,jsonb,uuid) TO authenticated,service_role;

CREATE FUNCTION public.finance_set_prepaid_owner_payouts(p_booking uuid,p_payouts jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; owner uuid; owner_name text; first_receipt date; x jsonb; s public.finance_owner_settlements; ob public.finance_obligations;
 account_name text; article uuid; previous text; keep date[]:=ARRAY[]::date[];
 today date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
 SELECT * INTO b FROM public.bookings WHERE id=p_booking FOR UPDATE;
 SELECT cfg.owner_counterparty_id,c.name INTO owner,owner_name FROM public.finance_object_settings cfg JOIN public.finance_counterparties c ON c.id=cfg.owner_counterparty_id WHERE cfg.property_id=b.property_id;
 SELECT receipts_from INTO first_receipt FROM public.finance_booking_cash_terms WHERE id=b.id;
 SELECT a.name INTO account_name FROM public.finance_booking_schedules sch JOIN public.finance_accounts a ON a.id=sch.account_id WHERE sch.id=b.id;
 SELECT id INTO article FROM public.finance_articles WHERE code='owner_payout';
 IF jsonb_typeof(p_payouts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_payouts)>100 THEN RAISE EXCEPTION 'Проверьте выплаты за ранее оплаченную аренду'; END IF;
 previous:=current_setting('rm.owner_plan_write',true);
 PERFORM set_config('rm.owner_plan_write','yes',true);
 FOR x IN SELECT value FROM jsonb_array_elements(p_payouts) LOOP
  IF owner IS NULL THEN RAISE EXCEPTION 'Прикрепите собственника к объекту'; END IF;
  IF nullif(x->>'period','') IS NULL OR nullif(x->>'date','') IS NULL OR nullif(x->>'amount','') IS NULL OR
   (x->>'period')::date<>date_trunc('month',(x->>'period')::date)::date OR (x->>'period')::date<date_trunc('month',b.start_date)::date OR
   (x->>'period')::date>=date_trunc('month',first_receipt)::date OR (x->>'date')::date<(x->>'period')::date OR (x->>'date')::date>b.end_date OR
   (x->>'amount')::numeric<=0 OR (x->>'amount') IN ('NaN','Infinity','-Infinity') OR (x->>'period')::date=ANY(keep)
  THEN RAISE EXCEPTION 'Укажите отдельные месяцы до первого нового поступления, даты и положительные суммы выплат'; END IF;
  keep:=array_append(keep,(x->>'period')::date);
  SELECT * INTO s FROM public.finance_owner_settlements WHERE booking_id=b.id AND period=(x->>'period')::date FOR UPDATE;
  IF s.id IS NOT NULL THEN
   SELECT * INTO ob FROM public.finance_obligations WHERE id=s.obligation_id FOR UPDATE;
   IF s.automatic OR ob.counterparty_id IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Расчёт уже связан с другими поступлениями или собственником'; END IF;
   IF coalesce(s.gross_amount,ob.amount)=round((x->>'amount')::numeric,2) AND ob.planned_date=(x->>'date')::date THEN CONTINUE; END IF;
   IF ob.planned_date<=today OR ob.status='closed' OR coalesce(s.expense_amount,0)>0 OR EXISTS(SELECT 1 FROM public.payments WHERE obligation_id=ob.id AND rental_component IS DISTINCT FROM 'owner_plan') THEN RAISE EXCEPTION 'Проведённую выплату или расчёт с удержаниями нельзя переписать из брони'; END IF;
   IF (x->>'date')::date<today THEN RAISE EXCEPTION 'Новая дата выплаты должна быть сегодня или позже'; END IF;
   UPDATE public.finance_owner_settlements SET gross_amount=round((x->>'amount')::numeric,2) WHERE id=s.id;
   UPDATE public.finance_obligations SET amount=round((x->>'amount')::numeric,2),planned_date=(x->>'date')::date WHERE id=ob.id;
   UPDATE public.payments SET amount=round((x->>'amount')::numeric,2),planned_date=(x->>'date')::date,account=account_name WHERE obligation_id=ob.id AND rental_component='owner_plan';
  ELSE
   IF (x->>'date')::date<today THEN RAISE EXCEPTION 'Новая выплата должна быть сегодня или позже'; END IF;
   INSERT INTO public.finance_obligations(counterparty_id,property_id,planned_date,amount,direction,status,description,legal_entity)
    VALUES(owner,b.property_id,(x->>'date')::date,round((x->>'amount')::numeric,2),'payable','open','Выплата за ранее оплаченную аренду '||to_char((x->>'period')::date,'MM.YYYY'),'Управление арендой') RETURNING * INTO ob;
   INSERT INTO public.finance_owner_settlements(property_id,booking_id,period,obligation_id,automatic,gross_amount)
    VALUES(b.property_id,b.id,(x->>'period')::date,ob.id,false,round((x->>'amount')::numeric,2));
   INSERT INTO public.payments(property_id,booking_id,counterparty_id,counterparty_name,obligation_id,planned_date,amount,direction,status,kind,rental_component,rental_period,paid_amount,account,article_id,comment)
    VALUES(b.property_id,b.id,owner,owner_name,ob.id,(x->>'date')::date,round((x->>'amount')::numeric,2),'out','partial','owner_payout','owner_plan',(x->>'period')::date,0,account_name,article,'Аренда оплачена ранее. Без нового поступления и комиссии компании.');
  END IF;
 END LOOP;
 FOR s IN SELECT * FROM public.finance_owner_settlements WHERE booking_id=b.id AND NOT automatic AND NOT(period=ANY(keep)) FOR UPDATE LOOP
  SELECT * INTO ob FROM public.finance_obligations WHERE id=s.obligation_id FOR UPDATE;
  IF ob.planned_date<=today OR ob.status='closed' OR coalesce(s.expense_amount,0)>0 OR EXISTS(SELECT 1 FROM public.payments WHERE obligation_id=ob.id AND rental_component IS DISTINCT FROM 'owner_plan') THEN RAISE EXCEPTION 'Нельзя удалить проведённую выплату или расчёт с удержаниями'; END IF;
  DELETE FROM public.payments WHERE obligation_id=ob.id AND rental_component='owner_plan';
  DELETE FROM public.finance_owner_settlements WHERE id=s.id;
  DELETE FROM public.finance_obligations WHERE id=ob.id;
 END LOOP;
 PERFORM set_config('rm.owner_plan_write',coalesce(previous,''),true);
 PERFORM public.finance_apply_owner_expenses(b.property_id);
END $$;
REVOKE ALL ON FUNCTION public.finance_set_prepaid_owner_payouts(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.finance_save_booking(uuid,jsonb,uuid,uuid) RENAME TO finance_save_booking_base;
REVOKE ALL ON FUNCTION public.finance_save_booking_base(uuid,jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.finance_save_booking(p_booking uuid,p_input jsonb,p_account uuid DEFAULT NULL,p_actor uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid; f jsonb:=p_input->'financial_terms'; previous text; t public.finance_booking_cash_terms; frequency integer; m date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(p_input->>'property_id')::uuid FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=p_booking FOR UPDATE;
 previous:=current_setting('rm.booking_finance_batch',true);
 IF p_input ? 'financial_terms' THEN
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR nullif(f->>'receipts_from','') IS NULL OR nullif(f->>'collection_interval','') IS NULL OR NOT(f ?& ARRAY['owner_rates','prepaid_owner_payouts']) THEN RAISE EXCEPTION 'Заполните условия поступлений и выплат'; END IF;
  frequency:=(f->>'collection_interval')::integer;
  IF frequency NOT BETWEEN 0 AND 12 THEN RAISE EXCEPTION 'Периодичность оплаты — от 1 до 12 месяцев, либо отдельный график'; END IF;
  SELECT * INTO t FROM public.finance_booking_cash_terms WHERE id=p_booking;
  IF t.id IS NOT NULL AND frequency<>t.collection_interval AND EXISTS(SELECT 1 FROM public.payments WHERE booking_id=p_booking AND rental_component='rent' AND (status IN ('paid','partial') OR paid_at IS NOT NULL OR coalesce(paid_amount,0)>0 OR planned_date<=(now() AT TIME ZONE 'Europe/Moscow')::date OR rental_installment_id IS NOT NULL)) THEN RAISE EXCEPTION 'Периодичность уже связана с оплатами. Сохраните историю и согласуйте следующий график отдельно'; END IF;
  IF frequency>1 AND (t.id IS NULL OR t.collection_interval<=1) AND EXISTS(SELECT 1 FROM public.payments WHERE booking_id=p_booking AND rental_component='rent' AND rental_period>=date_trunc('month',(f->>'receipts_from')::date)::date AND
   (status IN ('paid','partial') OR paid_at IS NOT NULL OR coalesce(paid_amount,0)>0 OR planned_date<=(now() AT TIME ZONE 'Europe/Moscow')::date OR rental_installment_id IS NOT NULL)) THEN RAISE EXCEPTION 'Новый график пересекается с уже оплаченными периодами'; END IF;
  PERFORM set_config('rm.booking_finance_batch','yes',true);
 END IF;
 result:=public.finance_save_booking_base(p_booking,p_input-'financial_terms',p_account,p_actor);
 IF p_input ? 'financial_terms' THEN
  PERFORM public.finance_set_booking_cash_terms(result,(f->>'receipts_from')::date,f->'owner_rates',p_actor);
  IF frequency=0 THEN
   IF f->'collection_plan' IS NULL OR f->'collection_plan'='null'::jsonb THEN RAISE EXCEPTION 'Добавьте поступления отдельного графика'; END IF;
   PERFORM public.finance_set_booking_collection_plan(result,f->'collection_plan',p_actor);
  ELSE
   IF t.collection_interval=0 AND t.collection_plan IS NOT NULL AND EXISTS(SELECT 1 FROM public.payments WHERE booking_id=result AND rental_component='rent' AND (status IN ('paid','partial') OR paid_at IS NOT NULL OR coalesce(paid_amount,0)>0 OR planned_date<=(now() AT TIME ZONE 'Europe/Moscow')::date)) THEN RAISE EXCEPTION 'Отдельный график уже связан с оплатами'; END IF;
   UPDATE public.finance_booking_cash_terms SET collection_interval=frequency,collection_plan=CASE WHEN frequency=1 THEN NULL ELSE collection_plan END WHERE id=result;
  END IF;
  FOR m IN SELECT generate_series(date_trunc('month',(p_input->>'start_date')::date),date_trunc('month',(p_input->>'end_date')::date),interval '1 month')::date LOOP
   PERFORM public.finance_booking_cash_monthly_fee(result,m,1);
  END LOOP;
  PERFORM public.finance_set_prepaid_owner_payouts(result,f->'prepaid_owner_payouts');
  PERFORM set_config('rm.booking_finance_batch',coalesce(previous,''),true);
  PERFORM public.finance_sync_booking(result);
  IF p_input ? 'management_fee_value' THEN PERFORM public.finance_recalculate_property_terms((p_input->>'property_id')::uuid); END IF;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_save_booking(uuid,jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_save_booking(uuid,jsonb,uuid,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
