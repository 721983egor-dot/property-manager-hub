-- The recipient of a payment and the owner bearing its cost are separate identities.
ALTER TABLE public.payments ADD COLUMN expense_bearer text CHECK(expense_bearer IN ('company','owner'));
ALTER TABLE public.payments ADD COLUMN expense_owner_id uuid REFERENCES public.finance_counterparties(id) ON DELETE RESTRICT;
ALTER TABLE public.payments ADD CONSTRAINT owner_expense_scope CHECK(
 (expense_bearer IS DISTINCT FROM 'owner' AND expense_owner_id IS NULL) OR
 (expense_bearer='owner' AND expense_owner_id IS NOT NULL AND property_id IS NOT NULL AND direction='out' AND kind NOT IN ('owner_payout','deposit_out','deposit_in','rent_in') AND rental_component IS NULL AND obligation_id IS NULL));
ALTER TABLE public.finance_owner_settlements ADD COLUMN gross_amount numeric;
ALTER TABLE public.finance_owner_settlements ADD COLUMN expense_amount numeric NOT NULL DEFAULT 0;
CREATE TABLE public.finance_owner_expense_allocations (
 id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 payment_id uuid REFERENCES public.payments(id) ON DELETE RESTRICT,
 settlement_id uuid REFERENCES public.finance_owner_settlements(id) ON DELETE RESTRICT,
 amount numeric NOT NULL CHECK(amount>0),
 locked_amount numeric NOT NULL DEFAULT 0 CHECK(locked_amount>=0 AND locked_amount<=amount),
 PRIMARY KEY(payment_id,settlement_id)
);
ALTER TABLE public.finance_owner_expense_allocations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.finance_owner_expense_allocations TO authenticated;
GRANT ALL ON public.finance_owner_expense_allocations TO service_role;
CREATE POLICY owner_expense_allocations_admin ON public.finance_owner_expense_allocations FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TRIGGER log_owner_expense_allocations AFTER INSERT OR UPDATE OR DELETE ON public.finance_owner_expense_allocations FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE FUNCTION public.finance_expense_fact(p public.payments) RETURNS numeric
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT round(CASE WHEN p.status='paid' THEN coalesce(p.paid_amount,p.amount) WHEN p.status='partial' THEN coalesce(p.paid_amount,0) WHEN p.kind='owner_payout' THEN 0 WHEN p.planned_date<=(now() AT TIME ZONE 'Europe/Moscow')::date THEN p.amount ELSE 0 END,2)
$$;
REVOKE ALL ON FUNCTION public.finance_expense_fact(public.payments) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finance_guard_owner_expense() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid; frozen numeric;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.expense_bearer='owner' THEN
   PERFORM 1 FROM public.properties WHERE id=OLD.property_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.finance_owner_expense_allocations WHERE payment_id=OLD.id AND locked_amount>0) THEN RAISE EXCEPTION 'Расход уже удержан при выплате собственнику. Сначала скорректируйте связанную выплату'; END IF;
   DELETE FROM public.finance_owner_expense_allocations WHERE payment_id=OLD.id;
  END IF;
  RETURN OLD;
 END IF;
 IF NEW.expense_bearer='owner' THEN
  IF NOT coalesce(public.has_role(auth.uid(),'admin'),false) AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Расходы собственника доступны администратору'; END IF;
  SELECT owner_counterparty_id INTO owner_id FROM public.finance_object_settings WHERE property_id=NEW.property_id;
  IF TG_OP='UPDATE' AND OLD.expense_bearer='owner' AND OLD.property_id IS NOT DISTINCT FROM NEW.property_id THEN
   NEW.expense_owner_id:=OLD.expense_owner_id;
  ELSE
   IF owner_id IS NULL THEN RAISE EXCEPTION 'Прикрепите собственника к объекту в контрагентах'; END IF;
   NEW.expense_owner_id:=owner_id;
  END IF;
 ELSE NEW.expense_owner_id:=NULL; END IF;
 IF TG_OP='UPDATE' AND OLD.expense_bearer='owner' THEN
  SELECT coalesce(sum(locked_amount),0) INTO frozen FROM public.finance_owner_expense_allocations WHERE payment_id=OLD.id;
  IF frozen>0 AND (NEW.expense_bearer IS DISTINCT FROM 'owner' OR NEW.property_id IS DISTINCT FROM OLD.property_id OR public.finance_expense_fact(NEW)<frozen) THEN
   RAISE EXCEPTION 'Расход уже удержан при выплате собственнику. Сначала скорректируйте связанную выплату';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_guard_owner_expense BEFORE INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_guard_owner_expense();
REVOKE ALL ON FUNCTION public.finance_guard_owner_expense() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finance_apply_owner_expenses(p_property uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; s record; available numeric; capacity numeric; used numeric; paid numeric; deduction numeric; target numeric; prev text; plan_prev text;
BEGIN
 IF current_setting('rm.owner_expenses_write',true)='yes' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payments WHERE property_id=p_property AND expense_bearer='owner') AND NOT EXISTS(SELECT 1 FROM public.finance_owner_settlements WHERE property_id=p_property AND expense_amount>0) THEN RETURN; END IF;
 PERFORM 1 FROM public.properties WHERE id=p_property FOR UPDATE;
 prev:=current_setting('rm.owner_expenses_write',true); PERFORM set_config('rm.owner_expenses_write','yes',true);
 plan_prev:=current_setting('rm.owner_plan_write',true); PERFORM set_config('rm.owner_plan_write','yes',true);
 -- Only deductions confirmed in an actual remittance are immutable.
 DELETE FROM public.finance_owner_expense_allocations a USING public.finance_owner_settlements st
 WHERE a.settlement_id=st.id AND st.property_id=p_property AND a.locked_amount=0;
 UPDATE public.finance_owner_expense_allocations a SET amount=a.locked_amount FROM public.finance_owner_settlements st
 WHERE a.settlement_id=st.id AND st.property_id=p_property AND a.amount<>a.locked_amount;
 FOR e IN SELECT p.*,public.finance_expense_fact(p) fact FROM public.payments p
  WHERE p.property_id=p_property AND p.expense_bearer='owner' ORDER BY coalesce(p.paid_at,p.planned_date),p.id LOOP
  SELECT coalesce(sum(amount),0) INTO used FROM public.finance_owner_expense_allocations WHERE payment_id=e.id;
  available:=greatest(0,e.fact-used);
  FOR s IN SELECT st.*,o.amount liability,o.planned_date,o.counterparty_id FROM public.finance_owner_settlements st JOIN public.finance_obligations o ON o.id=st.obligation_id
   WHERE st.property_id=p_property AND o.counterparty_id=e.expense_owner_id AND o.status='open'
   ORDER BY o.planned_date,st.period,st.id LOOP
   EXIT WHEN available<=0;
   SELECT coalesce(sum(public.finance_expense_fact(x)),0) INTO paid FROM public.payments x WHERE x.obligation_id=s.obligation_id AND x.direction='out' AND x.rental_component IS DISTINCT FROM 'owner_plan';
   SELECT coalesce(sum(amount),0) INTO used FROM public.finance_owner_expense_allocations WHERE settlement_id=s.id;
   capacity:=greatest(0,coalesce(s.gross_amount,s.liability+s.expense_amount)-paid-used);
   deduction:=least(available,capacity);
   IF deduction>0 THEN
    INSERT INTO public.finance_owner_expense_allocations(payment_id,settlement_id,amount) VALUES(e.id,s.id,deduction)
     ON CONFLICT(payment_id,settlement_id) DO UPDATE SET amount=finance_owner_expense_allocations.amount+EXCLUDED.amount;
    available:=available-deduction;
   END IF;
  END LOOP;
 END LOOP;
 FOR s IN SELECT st.*,o.amount liability FROM public.finance_owner_settlements st JOIN public.finance_obligations o ON o.id=st.obligation_id WHERE st.property_id=p_property LOOP
  SELECT coalesce(sum(amount),0) INTO deduction FROM public.finance_owner_expense_allocations WHERE settlement_id=s.id;
  target:=coalesce(s.gross_amount,s.liability+s.expense_amount)-deduction;
  SELECT coalesce(sum(public.finance_expense_fact(x)),0) INTO paid FROM public.payments x WHERE x.obligation_id=s.obligation_id AND x.direction='out' AND x.rental_component IS DISTINCT FROM 'owner_plan';
  IF target<paid THEN RAISE EXCEPTION 'Расходы превышают доступную сумму после уже проведённой выплаты'; END IF;
  UPDATE public.finance_owner_settlements SET gross_amount=coalesce(s.gross_amount,s.liability+s.expense_amount),expense_amount=deduction WHERE id=s.id AND (gross_amount IS NULL OR expense_amount<>deduction);
  UPDATE public.finance_obligations SET amount=target WHERE id=s.obligation_id AND amount<>target;
  IF target<=paid THEN DELETE FROM public.payments WHERE obligation_id=s.obligation_id AND rental_component='owner_plan';
  ELSE
   UPDATE public.payments SET amount=target-paid WHERE obligation_id=s.obligation_id AND rental_component='owner_plan' AND amount<>target-paid;
   IF NOT EXISTS(SELECT 1 FROM public.payments WHERE obligation_id=s.obligation_id AND rental_component='owner_plan') AND EXISTS(SELECT 1 FROM public.finance_obligations WHERE id=s.obligation_id AND status='open') THEN
    INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,counterparty_id,counterparty_name,account,comment,obligation_id,article_id,rental_component,rental_period,paid_amount,booking_id)
    SELECT o.planned_date,target-paid,'out','partial','owner_payout',o.property_id,o.counterparty_id,c.name,coalesce((SELECT account FROM public.payments WHERE property_id=p_property ORDER BY planned_date DESC LIMIT 1),'Основной'),o.description,o.id,(SELECT id FROM public.finance_articles WHERE code='owner_payout' LIMIT 1),'owner_plan',s.period,0,s.booking_id
     FROM public.finance_obligations o JOIN public.finance_counterparties c ON c.id=o.counterparty_id WHERE o.id=s.obligation_id;
   END IF;
  END IF;
 END LOOP;
 PERFORM set_config('rm.owner_plan_write',coalesce(plan_prev,''),true);
 PERFORM set_config('rm.owner_expenses_write',coalesce(prev,''),true);
END $$;
REVOKE ALL ON FUNCTION public.finance_apply_owner_expenses(uuid) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.finance_sync_owner_booking_month(uuid,date,uuid,boolean) RENAME TO finance_sync_owner_booking_month_gross;
CREATE OR REPLACE FUNCTION public.finance_sync_owner_booking_month_gross(p_property uuid,p_period date,p_booking uuid,p_legacy boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 UPDATE public.finance_owner_settlements SET gross_amount=net WHERE id=s.id;
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


CREATE FUNCTION public.finance_sync_owner_booking_month(p_property uuid,p_period date,p_booking uuid,p_legacy boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF current_setting('rm.owner_expenses_write',true)='yes' THEN RETURN; END IF;
 PERFORM public.finance_sync_owner_booking_month_gross(p_property,p_period,p_booking,p_legacy);
 PERFORM public.finance_apply_owner_expenses(p_property);
END $$;
REVOKE ALL ON FUNCTION public.finance_sync_owner_booking_month(uuid,date,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finance_owner_expense_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF current_setting('rm.owner_expenses_write',true)='yes' THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' AND OLD.expense_bearer='owner' THEN PERFORM public.finance_apply_owner_expenses(OLD.property_id); END IF;
 IF TG_OP<>'DELETE' AND NEW.expense_bearer='owner' THEN PERFORM public.finance_apply_owner_expenses(NEW.property_id); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER finance_owner_expense_changed AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_owner_expense_changed();
REVOKE ALL ON FUNCTION public.finance_owner_expense_changed() FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.pay_owner_settlement(uuid,numeric,text,date,uuid) RENAME TO finance_pay_owner_settlement_base;
REVOKE ALL ON FUNCTION public.finance_pay_owner_settlement_base(uuid,numeric,text,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.pay_owner_settlement(p_obligation_id uuid,p_amount numeric,p_account text,p_paid_date date,p_request_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE property uuid;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 SELECT property_id INTO property FROM public.finance_obligations WHERE id=p_obligation_id;
 PERFORM public.finance_apply_owner_expenses(property);
 RETURN public.finance_pay_owner_settlement_base(p_obligation_id,p_amount,p_account,p_paid_date,p_request_id);
END $$;
REVOKE ALL ON FUNCTION public.pay_owner_settlement(uuid,numeric,text,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pay_owner_settlement(uuid,numeric,text,date,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

CREATE FUNCTION public.finance_owner_expense_settlement_created() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.finance_apply_owner_expenses(NEW.property_id);
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finance_owner_expense_settlement_created AFTER INSERT ON public.finance_owner_settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finance_owner_expense_settlement_created();
REVOKE ALL ON FUNCTION public.finance_owner_expense_settlement_created() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finance_owner_expense_payout_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prop uuid;
BEGIN
 IF NEW.kind='owner_payout' AND NEW.rental_component IS DISTINCT FROM 'owner_plan' AND (NEW.status='paid' OR (NEW.status='partial' AND coalesce(NEW.paid_amount,0)>0)) THEN
  SELECT property_id INTO prop FROM public.finance_owner_settlements WHERE obligation_id=NEW.obligation_id;
  IF prop IS NOT NULL THEN
   PERFORM public.finance_apply_owner_expenses(prop);
   UPDATE public.finance_owner_expense_allocations a SET locked_amount=a.amount FROM public.finance_owner_settlements st WHERE a.settlement_id=st.id AND st.obligation_id=NEW.obligation_id AND a.locked_amount<>a.amount;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_owner_expense_payout_lock BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_owner_expense_payout_lock();
REVOKE ALL ON FUNCTION public.finance_owner_expense_payout_lock() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.finance_owner_expense_payout_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prop uuid;
BEGIN
 IF OLD.kind='owner_payout' AND OLD.rental_component IS DISTINCT FROM 'owner_plan' THEN
  SELECT property_id INTO prop FROM public.finance_owner_settlements WHERE obligation_id=OLD.obligation_id;
  IF prop IS NOT NULL THEN
   UPDATE public.finance_owner_expense_allocations a SET locked_amount=0 FROM public.finance_owner_settlements st
    WHERE a.settlement_id=st.id AND st.obligation_id=OLD.obligation_id AND a.locked_amount>0 AND NOT EXISTS(SELECT 1 FROM public.payments x WHERE x.obligation_id=st.obligation_id AND x.rental_component IS DISTINCT FROM 'owner_plan' AND public.finance_expense_fact(x)>0);
   PERFORM public.finance_apply_owner_expenses(prop);
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER finance_owner_expense_payout_changed AFTER UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_owner_expense_payout_changed();
REVOKE ALL ON FUNCTION public.finance_owner_expense_payout_changed() FROM PUBLIC,anon,authenticated,service_role;

-- The user identified the Avito payment on 17 October as a company advertising cost.
-- Fix its article's incorrect profit flag without changing dates, amounts or payment kind.
UPDATE public.finance_articles SET affects_profit=true WHERE direction='out' AND lower(btrim(name))='авито' AND affects_profit=false;
UPDATE public.payments p SET expense_bearer='company' FROM public.finance_articles a
 WHERE p.article_id=a.id AND lower(btrim(a.name))='авито' AND p.direction='out'
 AND p.planned_date='2026-10-17' AND p.amount=2000 AND p.expense_bearer IS NULL;
NOTIFY pgrst,'reload schema';
