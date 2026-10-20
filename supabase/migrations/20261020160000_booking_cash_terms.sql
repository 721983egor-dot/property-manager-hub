-- Contract cash collection can start after arrival; prepaid historical months are not new receipts.
-- Optional owner rates are separate finance data, accessible only to administrators.
CREATE TABLE public.finance_booking_cash_terms (
 id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE RESTRICT,
 receipts_from date NOT NULL,
 owner_rates jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(owner_rates)='array'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_booking_cash_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_cash_terms_admin ON public.finance_booking_cash_terms FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.finance_booking_cash_terms TO authenticated;
GRANT ALL ON public.finance_booking_cash_terms TO service_role;
CREATE TRIGGER log_booking_cash_terms AFTER INSERT OR UPDATE OR DELETE ON public.finance_booking_cash_terms FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE FUNCTION public.finance_booking_cash_fee(p_booking uuid,p_period date,p_amount numeric) RETURNS numeric
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
REVOKE ALL ON FUNCTION public.finance_booking_cash_fee(uuid,date,numeric) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finance_booking_cash_payment_terms() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE fee numeric; first_collection date; today date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
 IF NEW.rental_component IS DISTINCT FROM 'rent' OR NEW.rental_installment_id IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id AND NEW.rental_period IS NOT DISTINCT FROM OLD.rental_period AND OLD.company_fee IS NOT NULL AND (OLD.status IN ('paid','partial') OR OLD.paid_at IS NOT NULL OR coalesce(OLD.paid_amount,0)>0 OR OLD.planned_date<=today) THEN RETURN NEW; END IF;
 SELECT receipts_from INTO first_collection FROM public.finance_booking_cash_terms WHERE id=NEW.booking_id;
 IF NEW.rental_schedule AND NEW.planned_date<first_collection THEN RAISE EXCEPTION 'Этот период оплачен ранее: поступления начинаются с %',first_collection; END IF;
 fee:=public.finance_booking_cash_fee(NEW.booking_id,NEW.rental_period,NEW.amount);
 IF fee IS NOT NULL THEN NEW.company_fee:=fee; END IF;
 RETURN NEW;
END $$;
-- Run after the standard rental-term validator; it remains responsible for identity and amounts.
CREATE TRIGGER finance_zz_booking_cash_terms BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_booking_cash_payment_terms();
REVOKE ALL ON FUNCTION public.finance_booking_cash_payment_terms() FROM PUBLIC,anon,authenticated,service_role;

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
   IF due<today OR due<(SELECT receipts_from FROM public.finance_booking_cash_terms WHERE id=b.id) THEN CONTINUE; END IF;
   SELECT * INTO prop FROM public.properties WHERE id=b.property_id;
   rent:=(calculation->>'amount')::numeric;
   expected_fee:=round(CASE WHEN coalesce(d.income_type::text,prop.management_fee_type::text)='percent' THEN rent*coalesce(d.income_value,prop.management_fee_value)/100 ELSE coalesce(d.income_value,prop.management_fee_value)*(calculation->>'occupiedDays')::numeric/(calculation->>'cycleDays')::numeric END,2);
   expected_fee:=coalesce(public.finance_booking_cash_fee(b.id,m,rent),expected_fee);
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

CREATE FUNCTION public.finance_set_booking_cash_terms(p_booking uuid,p_receipts_from date,p_owner_rates jsonb DEFAULT '[]',p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; x jsonb; m date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.bookings WHERE id=p_booking) FOR UPDATE;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF b.id IS NULL OR b.stay_kind::text<>'long_term' OR p_receipts_from IS NULL OR p_receipts_from<b.start_date OR p_receipts_from>=b.end_date THEN RAISE EXCEPTION 'Проверьте дату первого поступления по брони'; END IF;
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
REVOKE ALL ON FUNCTION public.finance_set_booking_cash_terms(uuid,date,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_set_booking_cash_terms(uuid,date,jsonb,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
