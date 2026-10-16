-- Gross rent is a bank receipt. Commission is an allocation, never another bank receipt.
ALTER TABLE public.payments
 ADD COLUMN rental_schedule boolean NOT NULL DEFAULT false,
 ADD COLUMN rental_component text CHECK (rental_component IN ('rent','utilities','owner_plan')),
 ADD COLUMN rental_period date CHECK (extract(day FROM rental_period)=1),
 ADD COLUMN company_fee numeric CHECK (company_fee >= 0 AND company_fee <= amount);
ALTER TABLE public.finance_owner_settlements ADD COLUMN automatic boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX finance_owner_pending_unique ON public.payments(obligation_id) WHERE rental_component='owner_plan';
CREATE INDEX finance_rental_receipts ON public.payments(property_id,rental_period) WHERE rental_component IN ('rent','utilities');
CREATE FUNCTION public.finance_rental_payment_terms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; d public.deals; p public.properties; rate numeric; fee numeric; nominal numeric;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.rental_component='owner_plan' AND current_setting('rm.owner_plan_write',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'План выплаты изменяется через расчёт собственника'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.rental_component='owner_plan' OR (TG_OP='UPDATE' AND OLD.rental_component='owner_plan') THEN
  IF current_setting('rm.owner_plan_write',true) IS DISTINCT FROM 'yes' OR NEW.kind<>'owner_payout' OR NEW.direction<>'out' OR NEW.status<>'partial' OR NEW.paid_amount IS DISTINCT FROM 0 OR NEW.obligation_id IS NULL THEN RAISE EXCEPTION 'Используйте подтверждение выплаты в расчётах с собственником'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.rental_component IS NULL THEN NEW.company_fee:=NULL; RETURN NEW; END IF;
 IF NEW.amount<=0 OR NEW.amount::text IN ('NaN','Infinity','-Infinity') OR (NEW.paid_amount IS NOT NULL AND (NEW.paid_amount<0 OR NEW.paid_amount>NEW.amount OR NEW.paid_amount::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'Проверьте сумму поступления и частичную оплату'; END IF;
 IF (TG_OP='INSERT' OR NEW.account IS DISTINCT FROM OLD.account) AND NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE name=NEW.account AND NOT archived) THEN RAISE EXCEPTION 'Выберите действующий счёт'; END IF;
 SELECT * INTO b FROM public.bookings WHERE id=NEW.booking_id;
 IF b.id IS NULL OR NEW.client_id IS DISTINCT FROM b.client_id OR NEW.property_id IS DISTINCT FROM b.property_id OR NEW.direction<>'in' THEN RAISE EXCEPTION 'Платёж должен быть связан с клиентом и объектом выбранной аренды'; END IF;
 IF NEW.rental_period IS NULL THEN NEW.rental_period:=date_trunc('month',NEW.planned_date)::date; END IF;
 IF NEW.rental_component='utilities' THEN NEW.company_fee:=0; RETURN NEW; END IF;
 IF NEW.kind<>'rent_in' THEN RAISE EXCEPTION 'Выберите статью арендной платы'; END IF;
 IF TG_OP='UPDATE' AND NEW.rental_component=OLD.rental_component AND NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id AND NEW.rental_period IS NOT DISTINCT FROM OLD.rental_period AND OLD.company_fee IS NOT NULL AND (OLD.status IN ('paid','partial') OR OLD.planned_date<=(now() AT TIME ZONE 'Europe/Moscow')::date) THEN
  NEW.company_fee:=round(OLD.company_fee*NEW.amount/OLD.amount,2); RETURN NEW;
 END IF;
 SELECT * INTO p FROM public.properties WHERE id=b.property_id;
 SELECT * INTO d FROM public.deals WHERE booking_id=b.id AND finance_terms IS NOT NULL;
 nominal:=b.price_month;
 IF b.price_type='periodic' THEN
  SELECT CASE WHEN count(*)=1 THEN min(price_month) ELSE NULL END INTO nominal FROM public.booking_price_periods WHERE booking_id=b.id AND start_date<=NEW.planned_date AND end_date>=NEW.planned_date;
 END IF;
 IF d.id IS NOT NULL THEN rate:=d.income_value; fee:=CASE WHEN d.income_type='percent' THEN NEW.amount*rate/100 ELSE NEW.amount*rate/nullif(nominal,0) END;
 ELSE rate:=p.management_fee_value; fee:=CASE WHEN p.management_fee_type='percent' THEN NEW.amount*rate/100 ELSE NEW.amount*rate/nullif(nominal,0) END; END IF;
 IF rate IS NULL OR fee IS NULL OR fee<0 OR fee>NEW.amount THEN RAISE EXCEPTION 'Укажите корректную комиссию за управление в условиях аренды/объекта'; END IF;
 NEW.company_fee:=round(fee,2); RETURN NEW;
END $$;
CREATE TRIGGER finance_rental_payment_terms BEFORE INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_rental_payment_terms();

CREATE FUNCTION public.finance_sync_owner_month(p_property uuid,p_period date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.finance_object_settings; s public.finance_owner_settlements; o public.finance_obligations; net numeric; paid numeric; due date; account_name text; a uuid; previous text; today date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
 PERFORM 1 FROM public.properties WHERE id=p_property FOR UPDATE;
 SELECT * INTO cfg FROM public.finance_object_settings WHERE property_id=p_property;
 IF cfg.owner_counterparty_id IS NULL OR cfg.payout_day IS NULL THEN RETURN; END IF;
 SELECT * INTO s FROM public.finance_owner_settlements WHERE property_id=p_property AND period=p_period FOR UPDATE;
 IF s.id IS NOT NULL AND NOT s.automatic THEN RETURN; END IF;
 -- Do not invent a second liability over historical remittances with no settlement link.
 IF s.id IS NULL AND EXISTS(SELECT 1 FROM public.payments WHERE property_id=p_property AND kind='owner_payout' AND obligation_id IS NULL AND coalesce(rental_period,date_trunc('month',planned_date)::date)=p_period) THEN RETURN; END IF;
 SELECT coalesce(sum((CASE WHEN status='partial' THEN coalesce(paid_amount,0) WHEN status='paid' THEN coalesce(paid_amount,amount) WHEN planned_date<=today THEN amount ELSE 0 END)*(1-coalesce(company_fee,0)/amount)),0)
 INTO net FROM public.payments WHERE property_id=p_property AND rental_period=p_period AND rental_component IN ('rent','utilities') AND company_fee IS NOT NULL AND amount>0;
 net:=round(net,2);
 due:=p_period+(least(cfg.payout_day,extract(day FROM (p_period+interval '1 month - 1 day'))::int)-1);
 IF s.id IS NULL THEN
  IF net<=0 THEN RETURN; END IF;
  INSERT INTO public.finance_obligations(counterparty_id,planned_date,amount,direction,description,legal_entity,property_id,status)
   VALUES(cfg.owner_counterparty_id,due,net,'payable','Выплата собственнику за '||to_char(p_period,'MM.YYYY'),'Управление арендой',p_property,'open') RETURNING * INTO o;
  INSERT INTO public.finance_owner_settlements(property_id,period,obligation_id,automatic) VALUES(p_property,p_period,o.id,true) RETURNING * INTO s;
 ELSE SELECT * INTO o FROM public.finance_obligations WHERE id=s.obligation_id FOR UPDATE; END IF;
 SELECT coalesce(sum(CASE WHEN status='paid' THEN coalesce(paid_amount,amount) WHEN status='partial' THEN coalesce(paid_amount,0) ELSE 0 END),0) INTO paid FROM public.payments WHERE obligation_id=o.id AND direction='out' AND rental_component IS DISTINCT FROM 'owner_plan';
 IF net<paid THEN RAISE EXCEPTION 'Поступления меньше уже выплаченной собственнику суммы. Сначала скорректируйте выплату'; END IF;
 previous:=current_setting('rm.owner_plan_write',true); PERFORM set_config('rm.owner_plan_write','yes',true);
 IF net=0 THEN
  DELETE FROM public.payments WHERE obligation_id=o.id AND rental_component='owner_plan';
  UPDATE public.finance_obligations SET status='closed' WHERE id=o.id AND status<>'closed';
 ELSE
  UPDATE public.finance_obligations SET amount=net,planned_date=due,status='open' WHERE id=o.id AND (amount<>net OR planned_date<>due OR status<>'open');
  SELECT account INTO account_name FROM public.payments WHERE property_id=p_property AND rental_period=p_period AND rental_component IN ('rent','utilities') ORDER BY planned_date,id LIMIT 1;
  SELECT id INTO a FROM public.finance_articles WHERE code='owner_payout' LIMIT 1;
  IF net>paid THEN
   -- Zero actual amount keeps older app versions (shared preview DB) from auto-posting a due owner plan.
   -- New clients display owner_plan as planned/overdue, never as a partial transfer.
   INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,counterparty_id,counterparty_name,account,comment,obligation_id,article_id,rental_component,rental_period,paid_amount)
    VALUES(due,net-paid,'out','partial','owner_payout',p_property,o.counterparty_id,(SELECT name FROM public.finance_counterparties WHERE id=o.counterparty_id),account_name,o.description,o.id,a,'owner_plan',p_period,0)
    ON CONFLICT(obligation_id) WHERE rental_component='owner_plan' DO UPDATE SET amount=EXCLUDED.amount,planned_date=EXCLUDED.planned_date
    WHERE payments.amount<>EXCLUDED.amount OR payments.planned_date<>EXCLUDED.planned_date;
  ELSE DELETE FROM public.payments WHERE obligation_id=o.id AND rental_component='owner_plan'; END IF;
 END IF;
 PERFORM set_config('rm.owner_plan_write',coalesce(previous,''),true);
END $$;
CREATE FUNCTION public.finance_refresh_rental_settlements() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 UPDATE public.payments p SET booking_id=b.id,client_id=b.client_id,rental_component='rent',rental_period=date_trunc('month',p.planned_date)::date
 FROM public.bookings b JOIN public.properties prop ON prop.id=b.property_id LEFT JOIN public.deals d ON d.booking_id=b.id AND d.finance_terms IS NOT NULL
 WHERE p.kind='rent_in' AND p.direction='in' AND p.planned_date>=date_trunc('month',now())::date AND p.company_fee IS NULL AND (p.rental_component IS NULL OR p.rental_component='rent')
 AND p.property_id=b.property_id AND p.client_id=b.client_id
 AND (p.booking_id=b.id OR (p.booking_id IS NULL AND p.planned_date>=b.start_date AND p.planned_date<b.end_date
  AND NOT EXISTS(SELECT 1 FROM public.bookings other WHERE other.id<>b.id AND other.client_id=b.client_id AND other.property_id=b.property_id AND p.planned_date>=other.start_date AND p.planned_date<other.end_date)))
 AND (CASE WHEN d.id IS NOT NULL THEN d.income_value ELSE prop.management_fee_value END) IS NOT NULL
 AND b.price_type<>'periodic';
 FOR r IN SELECT DISTINCT property_id,rental_period FROM public.payments WHERE rental_component IN ('rent','utilities') AND company_fee IS NOT NULL ORDER BY property_id,rental_period LOOP PERFORM public.finance_sync_owner_month(r.property_id,r.rental_period); END LOOP;
END $$;
CREATE FUNCTION public.finance_rental_receipt_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p uuid; period date;
BEGIN
 IF TG_OP<>'INSERT' AND OLD.rental_component IN ('rent','utilities') THEN PERFORM public.finance_sync_owner_month(OLD.property_id,OLD.rental_period); END IF;
 IF TG_OP<>'DELETE' AND NEW.rental_component IN ('rent','utilities') THEN PERFORM public.finance_sync_owner_month(NEW.property_id,NEW.rental_period); END IF;
 IF TG_OP<>'DELETE' AND NEW.kind='owner_payout' AND NEW.rental_component IS DISTINCT FROM 'owner_plan' THEN
  SELECT s.property_id,s.period INTO p,period FROM public.finance_owner_settlements s WHERE obligation_id=NEW.obligation_id;
  IF p IS NOT NULL THEN PERFORM public.finance_sync_owner_month(p,period); END IF;
 END IF;
 IF TG_OP<>'INSERT' AND OLD.kind='owner_payout' AND OLD.rental_component IS DISTINCT FROM 'owner_plan' THEN
  SELECT s.property_id,s.period INTO p,period FROM public.finance_owner_settlements s WHERE obligation_id=OLD.obligation_id;
  IF p IS NOT NULL THEN PERFORM public.finance_sync_owner_month(p,period); END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER finance_rental_receipt_changed AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_rental_receipt_changed();
CREATE FUNCTION public.finance_create_rental_schedule(p_booking uuid,p_account text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; m date; due date; rent numeric; a uuid; count_created integer:=0; i integer:=0;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF b.id IS NULL OR b.client_id IS NULL OR b.status<>'active' THEN RAISE EXCEPTION 'Выберите действующую аренду с клиентом'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE name=p_account AND NOT archived) THEN RAISE EXCEPTION 'Выберите действующий счёт'; END IF;
 SELECT id INTO a FROM public.finance_articles WHERE code='rent' OR code='rent_in' ORDER BY code LIMIT 1;
 m:=greatest(date_trunc('month',b.start_date)::date,date_trunc('month',(now() AT TIME ZONE 'Europe/Moscow')::date)::date);
 WHILE m<b.end_date AND i<36 LOOP
  i:=i+1; due:=m+(least(b.payment_day,extract(day FROM (m+interval '1 month - 1 day'))::int)-1);
  IF due>=b.start_date AND due<b.end_date THEN
   rent:=b.price_month;
   IF b.price_type='periodic' THEN SELECT CASE WHEN count(*)=1 THEN min(price_month) ELSE NULL END INTO rent FROM public.booking_price_periods WHERE booking_id=b.id AND start_date<=due AND end_date>=due; END IF;
   IF rent IS NULL OR rent<=0 THEN RAISE EXCEPTION 'Не определена цена аренды на %',due; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.payments WHERE kind='rent_in' AND (booking_id=b.id OR (client_id=b.client_id AND property_id=b.property_id)) AND coalesce(rental_period,date_trunc('month',planned_date)::date)=m) THEN
    INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,client_id,booking_id,account,comment,article_id,rental_component,rental_period,rental_schedule)
     VALUES(due,rent,'in','expected','rent_in',b.property_id,b.client_id,b.id,p_account,'Аренда за '||to_char(m,'MM.YYYY'),a,'rent',m,true);
    count_created:=count_created+1;
   ELSE
    UPDATE public.payments SET amount=rent,planned_date=due WHERE booking_id=b.id AND rental_period=m AND rental_schedule AND status IN ('expected','overdue') AND paid_at IS NULL AND coalesce(paid_amount,0)=0 AND planned_date>(now() AT TIME ZONE 'Europe/Moscow')::date;
   END IF;
  END IF;
  m:=(m+interval '1 month')::date;
 END LOOP;
 RETURN count_created;
END $$;
REVOKE ALL ON FUNCTION public.finance_rental_payment_terms(),public.finance_sync_owner_month(uuid,date),public.finance_rental_receipt_changed() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finance_refresh_rental_settlements(),public.finance_create_rental_schedule(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finance_refresh_rental_settlements(),public.finance_create_rental_schedule(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.pay_owner_settlement(p_obligation_id uuid,p_amount numeric,p_account text,p_paid_date date,p_request_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ob public.finance_obligations; paid numeric; result uuid; article uuid; party text;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.finance_obligations WHERE id=p_obligation_id) FOR UPDATE;
 SELECT * INTO ob FROM public.finance_obligations WHERE id=p_obligation_id FOR UPDATE;
 IF ob.id IS NULL OR ob.direction<>'payable' OR NOT EXISTS(SELECT 1 FROM public.finance_owner_settlements WHERE obligation_id=ob.id) THEN RAISE EXCEPTION 'Расчёт собственника не найден'; END IF;
 SELECT id INTO result FROM public.payments WHERE payout_request_id=p_request_id AND obligation_id=ob.id;
 IF result IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.payments WHERE id=result AND amount=p_amount AND account=p_account AND paid_at=p_paid_date) THEN
   RAISE EXCEPTION 'Эта выплата уже сохранена с другими параметрами. Обновите страницу';
  END IF;
  RETURN result;
 END IF;
 IF ob.status<>'open' THEN RAISE EXCEPTION 'Обязательство закрыто'; END IF;
 SELECT coalesce(sum(coalesce(paid_amount,CASE WHEN status='paid' THEN amount ELSE 0 END)),0) INTO paid FROM public.payments WHERE obligation_id=ob.id AND direction='out' AND status IN ('paid','partial');
 IF p_amount IS NULL OR p_amount<=0 OR p_amount='NaN'::numeric OR p_amount='Infinity'::numeric OR p_amount>ob.amount-paid THEN RAISE EXCEPTION 'Сумма должна быть больше нуля и не превышать остаток долга'; END IF;
 IF p_paid_date IS NULL OR p_paid_date>(now() AT TIME ZONE 'Europe/Moscow')::date OR p_request_id IS NULL THEN RAISE EXCEPTION 'Укажите фактическую дату выплаты'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE name=p_account AND NOT archived) THEN RAISE EXCEPTION 'Выберите действующий счёт'; END IF;
 SELECT id INTO article FROM public.finance_articles WHERE code='owner_payout' LIMIT 1;
 SELECT name INTO party FROM public.finance_counterparties WHERE id=ob.counterparty_id;
 INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,counterparty_id,counterparty_name,account,comment,paid_at,paid_amount,obligation_id,article_id,payout_request_id)
 VALUES(p_paid_date,p_amount,'out','paid','owner_payout',ob.property_id,ob.counterparty_id,party,p_account,ob.description,p_paid_date,p_amount,ob.id,article,p_request_id) RETURNING id INTO result;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
-- Settings and resulting liabilities change in one transaction.
CREATE FUNCTION public.finance_save_rental_settings(p_property uuid,p_owner uuid,p_day integer,p_fee numeric,p_fee_type text,p_owner_name text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 IF p_property IS NULL OR p_owner IS NULL OR p_day IS NULL OR p_day<1 OR p_day>31 OR p_fee IS NULL OR p_fee<0 OR p_fee::text IN ('NaN','Infinity','-Infinity') OR p_fee_type NOT IN ('percent','amount') OR p_fee_type IS NULL OR (p_fee_type='percent' AND p_fee>100) THEN RAISE EXCEPTION 'Проверьте собственника, день выплаты и комиссию'; END IF;
 PERFORM 1 FROM public.properties WHERE id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Объект не найден'; END IF;
 IF nullif(btrim(p_owner_name),'') IS NOT NULL THEN
  INSERT INTO public.finance_counterparties(id,name,kind) VALUES(p_owner,btrim(p_owner_name),'owner') ON CONFLICT(id) DO NOTHING;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_counterparties WHERE id=p_owner AND kind='owner') THEN RAISE EXCEPTION 'Выберите собственника'; END IF;
 UPDATE public.properties SET management_fee_type=p_fee_type::public.management_fee_type,management_fee_value=p_fee WHERE id=p_property;
 UPDATE public.payments SET company_fee=company_fee WHERE property_id=p_property AND rental_component='rent' AND status IN ('expected','overdue') AND planned_date>(now() AT TIME ZONE 'Europe/Moscow')::date;
 INSERT INTO public.finance_object_settings(property_id,owner_counterparty_id,payout_day) VALUES(p_property,p_owner,p_day)
 ON CONFLICT(property_id) DO UPDATE SET owner_counterparty_id=EXCLUDED.owner_counterparty_id,payout_day=EXCLUDED.payout_day;
 FOR r IN SELECT DISTINCT rental_period FROM public.payments WHERE property_id=p_property AND rental_component IN ('rent','utilities') AND company_fee IS NOT NULL ORDER BY rental_period LOOP PERFORM public.finance_sync_owner_month(p_property,r.rental_period); END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.finance_save_rental_settings(uuid,uuid,integer,numeric,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finance_save_rental_settings(uuid,uuid,integer,numeric,text,text) TO authenticated;
CREATE FUNCTION public.finance_cancel_rental_schedule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 DELETE FROM public.payments WHERE booking_id=NEW.id AND rental_schedule AND status IN ('expected','overdue') AND paid_at IS NULL AND coalesce(paid_amount,0)=0 AND planned_date>(now() AT TIME ZONE 'Europe/Moscow')::date AND (NEW.status<>'active' OR planned_date>=NEW.end_date OR planned_date<NEW.start_date);
 RETURN NEW;
END $$;
CREATE TRIGGER finance_cancel_rental_schedule AFTER UPDATE OF status,start_date,end_date ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.finance_cancel_rental_schedule();
REVOKE ALL ON FUNCTION public.finance_cancel_rental_schedule() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';

-- Rename only the seeded tenant group; preserve custom names and existing client groups.
UPDATE public.finance_counterparty_classes SET name='Клиенты' WHERE legacy_kind='tenant' AND name='Арендаторы' AND NOT EXISTS(SELECT 1 FROM public.finance_counterparty_classes WHERE lower(btrim(name))=lower('Клиенты'));
