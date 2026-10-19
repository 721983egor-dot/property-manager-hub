-- The owner stays linked to the object; the contractual payout day belongs to the booking.
ALTER TABLE public.bookings ADD COLUMN owner_payout_day integer CHECK(owner_payout_day BETWEEN 1 AND 31);
ALTER TABLE public.payments ADD COLUMN owner_payout_day integer CHECK(owner_payout_day BETWEEN 1 AND 31);
-- Copy only scheduling metadata. Avoid rebuilding receipts or liabilities during the migration.
ALTER TABLE public.bookings DISABLE TRIGGER finance_booking_changed;
UPDATE public.bookings b SET owner_payout_day=s.payout_day FROM public.finance_object_settings s WHERE s.property_id=b.property_id AND s.payout_day IS NOT NULL;
ALTER TABLE public.bookings ENABLE TRIGGER finance_booking_changed;
ALTER TABLE public.payments DISABLE TRIGGER finance_rental_payment_terms;
ALTER TABLE public.payments DISABLE TRIGGER finance_rental_receipt_changed;
UPDATE public.payments p SET owner_payout_day=coalesce(b.owner_payout_day,s.payout_day)
 FROM public.finance_object_settings s LEFT JOIN public.bookings b ON b.property_id=s.property_id
 WHERE p.property_id=s.property_id AND p.rental_component IN ('rent','utilities') AND (p.booking_id=b.id OR (p.booking_id IS NULL AND b.id IS NULL));
-- Cover unlinked legacy receipts without inventing a booking.
UPDATE public.payments p SET owner_payout_day=s.payout_day FROM public.finance_object_settings s
 WHERE p.property_id=s.property_id AND p.booking_id IS NULL AND p.rental_component IN ('rent','utilities') AND p.owner_payout_day IS NULL;
ALTER TABLE public.payments ENABLE TRIGGER finance_rental_payment_terms;
ALTER TABLE public.payments ENABLE TRIGGER finance_rental_receipt_changed;

ALTER TABLE public.finance_owner_settlements ADD COLUMN booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT;
ALTER TABLE public.finance_owner_settlements DROP CONSTRAINT finance_owner_settlements_property_id_period_key;
UPDATE public.finance_owner_settlements st SET booking_id=(SELECT min(p.booking_id::text)::uuid FROM public.payments p WHERE p.property_id=st.property_id AND p.rental_period=st.period AND p.rental_component IN ('rent','utilities'))
 WHERE (SELECT count(DISTINCT p.booking_id) FROM public.payments p WHERE p.property_id=st.property_id AND p.rental_period=st.period AND p.rental_component IN ('rent','utilities'))=1
 AND NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.property_id=st.property_id AND p.rental_period=st.period AND p.rental_component IN ('rent','utilities') AND p.booking_id IS NULL);
CREATE UNIQUE INDEX finance_owner_legacy_period ON public.finance_owner_settlements(property_id,period) WHERE booking_id IS NULL;
CREATE UNIQUE INDEX finance_owner_booking_period ON public.finance_owner_settlements(booking_id,period) WHERE booking_id IS NOT NULL;

CREATE FUNCTION public.finance_owner_day_locked(p public.payments) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE payout_month date:=coalesce(p.rental_period,date_trunc('month',p.planned_date)::date); due date;
 today date:=(now() AT TIME ZONE 'Europe/Moscow')::date; received boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM public.payments x LEFT JOIN public.finance_owner_settlements st ON st.obligation_id=x.obligation_id WHERE x.property_id=p.property_id AND x.kind='owner_payout' AND x.rental_component IS DISTINCT FROM 'owner_plan'
  AND coalesce(st.period,x.rental_period,date_trunc('month',x.planned_date)::date)=payout_month AND (st.booking_id IS NULL OR st.booking_id IS NOT DISTINCT FROM p.booking_id) AND (x.status='paid' OR (x.status='partial' AND coalesce(x.paid_amount,0)>0))) THEN RETURN true; END IF;
 received:=p.status='paid' OR (p.status='partial' AND coalesce(p.paid_amount,0)>0) OR (p.status IN ('expected','overdue') AND p.planned_date<=today);
 IF NOT received OR p.owner_payout_day IS NULL THEN RETURN false; END IF;
 due:=payout_month+(least(p.owner_payout_day,extract(day FROM payout_month+interval '1 month - 1 day')::int)-1);
 RETURN due<=today;
END $$;
REVOKE ALL ON FUNCTION public.finance_owner_day_locked(public.payments) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finance_owner_payment_day() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.rental_component NOT IN ('rent','utilities') OR NEW.rental_component IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id AND public.finance_owner_day_locked(OLD) THEN NEW.owner_payout_day:=OLD.owner_payout_day; RETURN NEW; END IF;
 IF NEW.booking_id IS NOT NULL THEN SELECT owner_payout_day INTO NEW.owner_payout_day FROM public.bookings WHERE id=NEW.booking_id;
 ELSE SELECT payout_day INTO NEW.owner_payout_day FROM public.finance_object_settings WHERE property_id=NEW.property_id; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.finance_owner_payment_day() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER finance_owner_payment_day BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_owner_payment_day();

CREATE FUNCTION public.finance_owner_month_day(p_property uuid,p_period date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result integer;
BEGIN
 SELECT min(owner_payout_day) INTO result FROM public.payments WHERE property_id=p_property AND rental_period=p_period AND rental_component IN ('rent','utilities') AND company_fee IS NOT NULL;
 IF result IS NULL THEN
  SELECT min(owner_payout_day) INTO result FROM public.bookings WHERE property_id=p_property AND status='active' AND stay_kind='long_term' AND start_date<p_period+interval '1 month' AND end_date>p_period;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_owner_month_day(uuid,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.finance_sync_owner_booking_month(p_property uuid,p_period date,p_booking uuid,p_legacy boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.finance_object_settings; s public.finance_owner_settlements; o public.finance_obligations; net numeric; paid numeric; payout integer; due date; account_name text; a uuid; previous text; today date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
 PERFORM 1 FROM public.properties WHERE id=p_property FOR UPDATE;
 SELECT * INTO cfg FROM public.finance_object_settings WHERE property_id=p_property;
 SELECT min(owner_payout_day) INTO payout FROM public.payments WHERE property_id=p_property AND rental_period=p_period AND rental_component IN ('rent','utilities') AND company_fee IS NOT NULL AND (p_legacy OR booking_id IS NOT DISTINCT FROM p_booking);
 IF payout IS NULL AND p_booking IS NOT NULL THEN SELECT owner_payout_day INTO payout FROM public.bookings WHERE id=p_booking; END IF;
 IF cfg.owner_counterparty_id IS NULL OR payout IS NULL THEN RETURN; END IF;
 SELECT * INTO s FROM public.finance_owner_settlements WHERE property_id=p_property AND period=p_period AND booking_id IS NOT DISTINCT FROM p_booking FOR UPDATE;
 IF s.id IS NOT NULL AND NOT s.automatic THEN RETURN; END IF;
 -- Do not invent a second liability over historical remittances with no settlement link.
 IF s.id IS NULL AND EXISTS(SELECT 1 FROM public.payments WHERE property_id=p_property AND kind='owner_payout' AND obligation_id IS NULL AND coalesce(rental_period,date_trunc('month',planned_date)::date)=p_period) THEN RETURN; END IF;
 SELECT coalesce(sum((CASE WHEN status='partial' THEN coalesce(paid_amount,0) WHEN status='paid' THEN coalesce(paid_amount,amount) WHEN planned_date<=today THEN amount ELSE 0 END)*(1-coalesce(company_fee,0)/amount)),0)
 INTO net FROM public.payments WHERE property_id=p_property AND rental_period=p_period AND rental_component IN ('rent','utilities') AND company_fee IS NOT NULL AND amount>0 AND (p_legacy OR booking_id IS NOT DISTINCT FROM p_booking);
 net:=round(net,2);
 due:=p_period+(least(payout,extract(day FROM (p_period+interval '1 month - 1 day'))::int)-1);
 IF s.id IS NULL THEN
  IF net<=0 THEN RETURN; END IF;
  INSERT INTO public.finance_obligations(counterparty_id,planned_date,amount,direction,description,legal_entity,property_id,status)
   VALUES(cfg.owner_counterparty_id,due,net,'payable','Выплата собственнику за '||to_char(p_period,'MM.YYYY'),'Управление арендой',p_property,'open') RETURNING * INTO o;
  INSERT INTO public.finance_owner_settlements(property_id,period,obligation_id,automatic,booking_id) VALUES(p_property,p_period,o.id,true,p_booking) RETURNING * INTO s;
 ELSE SELECT * INTO o FROM public.finance_obligations WHERE id=s.obligation_id FOR UPDATE; END IF;
 SELECT coalesce(sum(CASE WHEN status='paid' THEN coalesce(paid_amount,amount) WHEN status='partial' THEN coalesce(paid_amount,0) ELSE 0 END),0) INTO paid FROM public.payments WHERE obligation_id=o.id AND direction='out' AND rental_component IS DISTINCT FROM 'owner_plan';
 IF paid>0 OR o.planned_date<=today THEN due:=o.planned_date; END IF;
 IF net<paid THEN RAISE EXCEPTION 'Поступления меньше уже выплаченной собственнику суммы. Сначала скорректируйте выплату'; END IF;
 previous:=current_setting('rm.owner_plan_write',true); PERFORM set_config('rm.owner_plan_write','yes',true);
 IF net=0 THEN
  DELETE FROM public.payments WHERE obligation_id=o.id AND rental_component='owner_plan';
  UPDATE public.finance_obligations SET status='closed' WHERE id=o.id AND status<>'closed';
 ELSE
  UPDATE public.finance_obligations SET amount=net,planned_date=due,status='open' WHERE id=o.id AND (amount<>net OR planned_date<>due OR status<>'open');
  SELECT account INTO account_name FROM public.payments WHERE property_id=p_property AND rental_period=p_period AND rental_component IN ('rent','utilities') AND (p_legacy OR booking_id IS NOT DISTINCT FROM p_booking) ORDER BY planned_date,id LIMIT 1;
  SELECT id INTO a FROM public.finance_articles WHERE code='owner_payout' LIMIT 1;
  IF net>paid THEN
   -- Zero actual amount keeps older app versions (shared preview DB) from auto-posting a due owner plan.
   -- New clients display owner_plan as planned/overdue, never as a partial transfer.
   INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,counterparty_id,counterparty_name,account,comment,obligation_id,article_id,rental_component,rental_period,paid_amount,booking_id)
    VALUES(due,net-paid,'out','partial','owner_payout',p_property,o.counterparty_id,(SELECT name FROM public.finance_counterparties WHERE id=o.counterparty_id),account_name,o.description,o.id,a,'owner_plan',p_period,0,p_booking)
    ON CONFLICT(obligation_id) WHERE rental_component='owner_plan' DO UPDATE SET amount=EXCLUDED.amount,planned_date=EXCLUDED.planned_date
    WHERE payments.amount<>EXCLUDED.amount OR payments.planned_date<>EXCLUDED.planned_date;
  ELSE DELETE FROM public.payments WHERE obligation_id=o.id AND rental_component='owner_plan'; END IF;
 END IF;
 PERFORM set_config('rm.owner_plan_write',coalesce(previous,''),true);
END $$;

REVOKE ALL ON FUNCTION public.finance_sync_owner_booking_month(uuid,date,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.finance_sync_owner_month(p_property uuid,p_period date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 PERFORM 1 FROM public.properties WHERE id=p_property FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.finance_owner_settlements WHERE property_id=p_property AND period=p_period AND booking_id IS NULL) THEN
  PERFORM public.finance_sync_owner_booking_month(p_property,p_period,NULL,true); RETURN;
 END IF;
 FOR r IN SELECT DISTINCT booking_id FROM public.payments WHERE property_id=p_property AND rental_period=p_period AND rental_component IN ('rent','utilities') ORDER BY booking_id LOOP
  PERFORM public.finance_sync_owner_booking_month(p_property,p_period,r.booking_id,false);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_owner_settlement(p_property_id uuid,p_period date,p_amount numeric,p_legal_entity text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.finance_object_settings; due date; ob uuid; result uuid; payout integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Только администратор'; END IF;
 SELECT * INTO cfg FROM public.finance_object_settings WHERE property_id=p_property_id FOR UPDATE;
 payout:=public.finance_owner_month_day(p_property_id,p_period);
 IF cfg.owner_counterparty_id IS NULL OR payout IS NULL THEN RAISE EXCEPTION 'Укажите собственника в контрагентах и день выплаты в брони'; END IF;
 IF p_period IS NULL OR extract(day FROM p_period)<>1 OR p_amount IS NULL OR p_amount<=0 OR p_amount='NaN'::numeric OR p_amount='Infinity'::numeric OR length(btrim(coalesce(p_legal_entity,'')))=0 THEN RAISE EXCEPTION 'Укажите месяц, положительную сумму и юридическое лицо'; END IF;
 SELECT id INTO result FROM public.finance_owner_settlements WHERE property_id=p_property_id AND period=p_period;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Расчёт за этот месяц уже создан'; END IF;
 due := p_period + (least(payout,extract(day FROM (p_period+interval '1 month - 1 day'))::int)-1);
 INSERT INTO public.finance_obligations(counterparty_id,planned_date,amount,direction,description,legal_entity,property_id,status)
 VALUES(cfg.owner_counterparty_id,due,p_amount,'payable','Выплата собственнику за '||to_char(p_period,'MM.YYYY'),btrim(p_legal_entity),p_property_id,'open') RETURNING id INTO ob;
 INSERT INTO public.finance_owner_settlements(property_id,period,obligation_id) VALUES(p_property_id,p_period,ob) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.finance_save_booking(p_booking uuid,p_input jsonb,p_account uuid DEFAULT NULL,p_actor uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid:=coalesce(p_booking,gen_random_uuid()); old public.bookings; d public.deals;
 x jsonb; a uuid; s date:=(p_input->>'start_date')::date; e date:=(p_input->>'end_date')::date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 IF p_input ? 'owner_payout_day' AND nullif(p_input->>'owner_payout_day','') IS NOT NULL AND (p_input->>'owner_payout_day')::int NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'День выплаты собственнику — от 1 до 31'; END IF;
 IF (p_input ? 'management_fee_type')<>(p_input ? 'management_fee_value') THEN RAISE EXCEPTION 'Укажите тип и значение комиссии вместе'; END IF;
 PERFORM 1 FROM public.properties WHERE id=(p_input->>'property_id')::uuid AND portfolio='rm' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Выберите объект Резиденции Море'; END IF;
 SELECT * INTO old FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF p_booking IS NOT NULL AND old.id IS NULL THEN RAISE EXCEPTION 'Бронь не найдена'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings WHERE id<>b AND property_id=(p_input->>'property_id')::uuid AND status::text='active' AND start_date<e AND end_date>s) AND p_input->>'status'='active' THEN RAISE EXCEPTION 'Объект уже забронирован на эти даты'; END IF;
 IF old.id IS NOT NULL AND (old.property_id IS DISTINCT FROM (p_input->>'property_id')::uuid OR old.client_id IS DISTINCT FROM (p_input->>'client_id')::uuid) THEN RAISE EXCEPTION 'Для смены клиента или объекта создайте новую бронь, сохранив историю старой'; END IF;
 IF p_booking IS NULL AND nullif(p_input->>'owner_payout_day','') IS NULL AND EXISTS(SELECT 1 FROM public.finance_object_settings WHERE property_id=(p_input->>'property_id')::uuid AND owner_counterparty_id IS NOT NULL) THEN RAISE EXCEPTION 'Укажите день выплаты собственнику в брони'; END IF;
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
   INSERT INTO public.bookings(id,property_id,client_id,start_date,end_date,price_type,price_month,payment_day,owner_payout_day,deposit,source,status,comment,stay_kind)
   VALUES(b,(p_input->>'property_id')::uuid,(p_input->>'client_id')::uuid,s,e,(p_input->>'price_type')::public.booking_price_type,(p_input->>'price_month')::numeric,(p_input->>'payment_day')::int,(p_input->>'owner_payout_day')::int,(p_input->>'deposit')::numeric,(p_input->>'source')::public.booking_source,(p_input->>'status')::public.booking_status,coalesce(p_input->>'comment',''),'long_term');
  ELSE
   UPDATE public.bookings SET start_date=s,end_date=e,price_type=(p_input->>'price_type')::public.booking_price_type,price_month=(p_input->>'price_month')::numeric,payment_day=(p_input->>'payment_day')::int,owner_payout_day=CASE WHEN p_input ? 'owner_payout_day' THEN (p_input->>'owner_payout_day')::int ELSE owner_payout_day END,deposit=(p_input->>'deposit')::numeric,source=(p_input->>'source')::public.booking_source,status=(p_input->>'status')::public.booking_status,comment=coalesce(p_input->>'comment','') WHERE id=b;
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



CREATE FUNCTION public.finance_booking_owner_day_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 PERFORM 1 FROM public.properties WHERE id=NEW.property_id FOR UPDATE;
 UPDATE public.payments p SET owner_payout_day=NEW.owner_payout_day WHERE booking_id=NEW.id
  AND rental_component IN ('rent','utilities') AND NOT public.finance_owner_day_locked(p)
  AND owner_payout_day IS DISTINCT FROM NEW.owner_payout_day;
 FOR r IN SELECT DISTINCT rental_period FROM public.payments WHERE booking_id=NEW.id AND rental_component IN ('rent','utilities') LOOP
  PERFORM public.finance_sync_owner_month(NEW.property_id,r.rental_period);
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.finance_booking_owner_day_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER finance_booking_owner_day_changed AFTER UPDATE ON public.bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN (OLD.owner_payout_day IS DISTINCT FROM NEW.owner_payout_day) EXECUTE FUNCTION public.finance_booking_owner_day_changed();
CREATE FUNCTION public.finance_guard_booking_owner_day() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.owner_payout_day IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.owner_payout_day IS NOT DISTINCT FROM OLD.owner_payout_day THEN RETURN NEW; END IF;
 IF NOT coalesce(public.has_role(auth.uid(),'admin'),false) AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Изменять срок выплаты собственнику может только администратор'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.finance_guard_booking_owner_day() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER finance_guard_booking_owner_day BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.finance_guard_booking_owner_day();
NOTIFY pgrst,'reload schema';
