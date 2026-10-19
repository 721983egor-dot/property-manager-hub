-- Service months follow arrival day, independently of payment deadline.
-- Only occupied days are charged; checkout is excluded. No history backfill.
CREATE FUNCTION public.finance_booking_period(p_booking uuid,p_month date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; m date:=date_trunc('month',p_month)::date; next_m date; anchor int;
 s date; e date; full_e date; due date; full_days int; occupied int; day date; price numeric; matches int;
 total numeric:=0; parts jsonb:='[]'; last_rate numeric; part_start date; part_days int:=0; piece jsonb;
BEGIN
 SELECT * INTO b FROM public.bookings WHERE id=p_booking;
 IF NOT FOUND THEN RAISE EXCEPTION 'Бронь не найдена'; END IF;
 next_m:=(m+interval '1 month')::date; anchor:=extract(day FROM b.start_date)::int;
 s:=m+(least(anchor,extract(day FROM m+interval '1 month - 1 day')::int)-1);
 full_e:=next_m+(least(anchor,extract(day FROM next_m+interval '1 month - 1 day')::int)-1);
 e:=least(full_e,b.end_date); full_days:=full_e-s; occupied:=greatest(0,e-s);
 due:=m+(least(b.payment_day,extract(day FROM m+interval '1 month - 1 day')::int)-1);
 due:=greatest(b.start_date,least(due,e));
 IF s<b.start_date OR s>=b.end_date THEN RETURN jsonb_build_object('scheduled',false); END IF;
 FOR day IN SELECT generate_series(s,e-1,interval '1 day')::date LOOP
  price:=b.price_month;
  IF b.price_type::text='periodic' THEN
   SELECT count(*),min(price_month) INTO matches,price FROM public.booking_price_periods WHERE booking_id=b.id AND start_date<=day AND end_date>=day;
   IF matches<>1 THEN RAISE EXCEPTION 'На % задайте единственную цену аренды',to_char(day,'DD.MM.YYYY'); END IF;
  END IF;
  IF price IS NULL OR price<=0 OR price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'На % задайте положительную цену аренды',to_char(day,'DD.MM.YYYY'); END IF;
  total:=total+price/full_days;
  IF last_rate IS DISTINCT FROM price AND part_days>0 THEN
   parts:=parts||jsonb_build_array(jsonb_build_object('from',part_start,'to',day,'days',part_days,'monthlyRate',last_rate)); part_days:=0;
  END IF;
  IF part_days=0 THEN part_start:=day; END IF;
  last_rate:=price; part_days:=part_days+1;
 END LOOP;
 IF part_days>0 THEN parts:=parts||jsonb_build_array(jsonb_build_object('from',part_start,'to',e,'days',part_days,'monthlyRate',last_rate)); END IF;
 RETURN jsonb_build_object('scheduled',true,'from',s,'to',e,'cycleEnd',full_e,'due',due,'cycleDays',full_days,'occupiedDays',occupied,'amount',round(total,2),'parts',parts);
END $$;
REVOKE ALL ON FUNCTION public.finance_booking_period(uuid,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.finance_sync_booking(p_booking uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; acct text; account_id uuid; m date; due date; rent numeric;
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
   rent:=(calculation->>'amount')::numeric;
   description:='Аренда за '||to_char((calculation->>'from')::date,'DD.MM.YYYY')||' — '||to_char((calculation->>'to')::date,'DD.MM.YYYY')||' (выезд не включён), '||(calculation->>'occupiedDays')||'/'||(calculation->>'cycleDays')||' дней';
   keep:=array_append(keep,m);
   -- Explicit advance/balance pairs and manual/received payments are never rewritten.
   IF EXISTS(SELECT 1 FROM public.payments WHERE booking_id=b.id AND rental_period=m AND rental_component='rent' AND (NOT rental_schedule OR rental_installment_id IS NOT NULL OR status::text IN ('paid','partial') OR paid_at IS NOT NULL OR coalesce(paid_amount,0)>0 OR planned_date<=today)) THEN CONTINUE; END IF;
   UPDATE public.payments SET amount=rent,planned_date=due,account=acct,company_fee=NULL,comment=description
    WHERE booking_id=b.id AND rental_period=m AND rental_schedule AND planned_date>today
     AND status::text IN ('expected','overdue') AND paid_at IS NULL AND coalesce(paid_amount,0)=0
     AND (amount IS DISTINCT FROM rent OR planned_date IS DISTINCT FROM due OR account IS DISTINCT FROM acct OR comment IS DISTINCT FROM description);
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

CREATE OR REPLACE FUNCTION public.finance_rental_payment_terms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; d public.deals; p public.properties; rate numeric; fee numeric; nominal numeric; calculation jsonb; fraction numeric; g public.finance_rental_installments;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.rental_installment_id IS NOT NULL THEN RAISE EXCEPTION 'Платёж связан с графиком предоплаты; отдельное удаление недоступно'; END IF;
  IF OLD.rental_component='owner_plan' AND current_setting('rm.owner_plan_write',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'План выплаты изменяется через расчёт собственника'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.rental_component='owner_plan' OR (TG_OP='UPDATE' AND OLD.rental_component='owner_plan') THEN
  IF current_setting('rm.owner_plan_write',true) IS DISTINCT FROM 'yes' OR NEW.kind<>'owner_payout' OR NEW.direction<>'out' OR NEW.status<>'partial' OR NEW.paid_amount IS DISTINCT FROM 0 OR NEW.obligation_id IS NULL THEN RAISE EXCEPTION 'Используйте подтверждение выплаты в расчётах с собственником'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD.rental_installment_id IS NOT NULL AND NEW.rental_component IS DISTINCT FROM OLD.rental_component THEN RAISE EXCEPTION 'Нельзя менять назначение платежа графика'; END IF;
 IF NEW.rental_component IS NULL THEN NEW.company_fee:=NULL; RETURN NEW; END IF;
 IF NEW.amount<=0 OR NEW.amount::text IN ('NaN','Infinity','-Infinity') OR (NEW.paid_amount IS NOT NULL AND (NEW.paid_amount<0 OR NEW.paid_amount>NEW.amount OR NEW.paid_amount::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'Проверьте сумму поступления и частичную оплату'; END IF;
 IF (TG_OP='INSERT' OR NEW.account IS DISTINCT FROM OLD.account) AND NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE name=NEW.account AND NOT archived) THEN RAISE EXCEPTION 'Выберите действующий счёт'; END IF;
 SELECT * INTO b FROM public.bookings WHERE id=NEW.booking_id;
 IF b.id IS NULL OR NEW.client_id IS DISTINCT FROM b.client_id OR NEW.property_id IS DISTINCT FROM b.property_id OR NEW.direction<>'in' THEN RAISE EXCEPTION 'Платёж должен быть связан с клиентом и объектом выбранной аренды'; END IF;
 IF NEW.rental_period IS NULL THEN NEW.rental_period:=date_trunc('month',NEW.planned_date)::date; END IF;
 IF NEW.rental_component='utilities' THEN NEW.company_fee:=0; RETURN NEW; END IF;
 IF NEW.kind<>'rent_in' THEN RAISE EXCEPTION 'Выберите статью арендной платы'; END IF;
 IF TG_OP='UPDATE' AND OLD.rental_installment_id IS NOT NULL AND (NEW.rental_installment_id IS DISTINCT FROM OLD.rental_installment_id OR NEW.rental_stage IS DISTINCT FROM OLD.rental_stage) THEN RAISE EXCEPTION 'Нельзя отвязать платёж предоплаты от графика'; END IF;
 IF NEW.rental_installment_id IS NOT NULL THEN
  SELECT * INTO g FROM public.finance_rental_installments WHERE id=NEW.rental_installment_id;
  IF g.id IS NULL OR NEW.booking_id IS DISTINCT FROM g.booking_id OR NEW.rental_period IS DISTINCT FROM g.period OR NEW.rental_component<>'rent' OR NEW.rental_stage IS NULL THEN RAISE EXCEPTION 'Проверьте связь платежа с графиком предоплаты'; END IF;
  IF NEW.amount IS DISTINCT FROM (CASE WHEN NEW.rental_stage='prepayment' THEN g.advance_amount ELSE g.total_amount-g.advance_amount END) OR NEW.planned_date IS DISTINCT FROM (CASE WHEN NEW.rental_stage='prepayment' THEN g.advance_date ELSE g.balance_date END) THEN RAISE EXCEPTION 'Сумма и дата закреплены в графике предоплаты'; END IF;
  NEW.company_fee:=CASE WHEN NEW.rental_stage='prepayment' THEN g.total_fee ELSE 0 END;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NEW.rental_component=OLD.rental_component AND NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id AND NEW.rental_period IS NOT DISTINCT FROM OLD.rental_period AND OLD.company_fee IS NOT NULL AND (OLD.status IN ('paid','partial') OR OLD.planned_date<=(now() AT TIME ZONE 'Europe/Moscow')::date) THEN
  NEW.company_fee:=round(OLD.company_fee*NEW.amount/OLD.amount,2); RETURN NEW;
 END IF;
 SELECT * INTO p FROM public.properties WHERE id=b.property_id;
 SELECT * INTO d FROM public.deals WHERE booking_id=b.id AND finance_terms IS NOT NULL;
 IF NEW.rental_schedule AND NEW.rental_installment_id IS NULL THEN
  calculation:=public.finance_booking_period(b.id,NEW.rental_period);
  IF NOT coalesce((calculation->>'scheduled')::boolean,false) THEN RAISE EXCEPTION 'Платёж вне срока аренды'; END IF;
  fraction:=(calculation->>'occupiedDays')::numeric/(calculation->>'cycleDays')::numeric;
  IF d.id IS NOT NULL THEN rate:=d.income_value; fee:=CASE WHEN d.income_type='percent' THEN NEW.amount*rate/100 ELSE rate*fraction END;
  ELSE rate:=p.management_fee_value; fee:=CASE WHEN p.management_fee_type='percent' THEN NEW.amount*rate/100 ELSE rate*fraction END; END IF;
 ELSE
  nominal:=b.price_month;
  IF b.price_type='periodic' THEN
   SELECT CASE WHEN count(*)=1 THEN min(price_month) ELSE NULL END INTO nominal FROM public.booking_price_periods WHERE booking_id=b.id AND start_date<=NEW.planned_date AND end_date>=NEW.planned_date;
  END IF;
  IF d.id IS NOT NULL THEN rate:=d.income_value; fee:=CASE WHEN d.income_type='percent' THEN NEW.amount*rate/100 ELSE NEW.amount*rate/nullif(nominal,0) END;
  ELSE rate:=p.management_fee_value; fee:=CASE WHEN p.management_fee_type='percent' THEN NEW.amount*rate/100 ELSE NEW.amount*rate/nullif(nominal,0) END; END IF;
 END IF;
 IF rate IS NULL OR fee IS NULL OR fee<0 OR fee>NEW.amount THEN RAISE EXCEPTION 'Укажите корректную комиссию за управление в условиях аренды/объекта'; END IF;
 NEW.company_fee:=round(fee,2); RETURN NEW;
END $$;
NOTIFY pgrst,'reload schema';
