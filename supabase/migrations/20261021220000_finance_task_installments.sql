-- Contract dates stay on planned_date. Cash installments and one-off expectations are independent.
ALTER TABLE public.payments
 ADD COLUMN cash_receipts jsonb NOT NULL DEFAULT '[]'::jsonb,
 ADD COLUMN task_expected_date date,
 ADD COLUMN owner_task_expected_date date,
 ADD COLUMN requires_confirmation boolean NOT NULL DEFAULT false;
UPDATE public.payments SET requires_confirmation=true
 WHERE booking_id IS NOT NULL AND direction='in' AND
 (rental_component IN ('rent','utilities','deposit') OR kind='deposit_in') AND
 (planned_date>='2026-10-21' OR updated_at>='2026-10-21');
CREATE FUNCTION public.guard_payment_installments() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE total numeric;
BEGIN
 IF NEW.booking_id IS NOT NULL AND NEW.direction='in' AND
 (NEW.rental_component IN ('rent','utilities','deposit') OR NEW.kind='deposit_in') THEN NEW.requires_confirmation:=true; END IF;
 IF jsonb_array_length(NEW.cash_receipts)>0 THEN
  SELECT sum((v->>'amount')::numeric) INTO total FROM jsonb_array_elements(NEW.cash_receipts) v;
  IF total IS DISTINCT FROM NEW.paid_amount OR total>NEW.amount OR
   (total=NEW.amount AND NEW.status<>'paid') OR (total<NEW.amount AND NEW.status<>'partial') THEN
   RAISE EXCEPTION 'Оплата записана частями. Нельзя изменить её итог без корректировки поступлений'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_payment_installments BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_payment_installments();

CREATE FUNCTION public.finance_record_task_receipt(
 p_payment uuid,p_booking uuid,p_expected_amount numeric,p_expected_paid numeric,p_expected_date date,
 p_expected_account text,p_paid_total numeric,p_paid_date date,p_received_account text,p_request_id uuid,p_actor uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments; actual numeric; events jsonb; previous jsonb; delta numeric;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=p_booking FOR UPDATE;
 SELECT * INTO p FROM public.payments WHERE id=p_payment FOR UPDATE;
 IF p.id IS NULL OR p.booking_id IS DISTINCT FROM p_booking OR p.direction<>'in' OR
 NOT(coalesce(p.rental_component IN ('rent','utilities','deposit'),false) OR p.kind='deposit_in') OR
 NOT EXISTS(SELECT 1 FROM public.bookings b JOIN public.properties prop ON prop.id=b.property_id WHERE b.id=p_booking AND prop.portfolio='rm' AND b.status::text<>'cancelled') THEN
 RAISE EXCEPTION 'Поступление по действующей брони не найдено'; END IF;
 SELECT v INTO previous FROM jsonb_array_elements(p.cash_receipts) v WHERE v->>'id'=p_request_id::text;
 IF previous IS NOT NULL THEN
  IF (previous->>'total')::numeric=p_paid_total AND previous->>'date'=p_paid_date::text AND previous->>'account'=p_received_account THEN RETURN; END IF;
  RAISE EXCEPTION 'Повторный запрос содержит другие условия оплаты';
 END IF;
 actual:=CASE WHEN p.status='paid' THEN coalesce(p.paid_amount,p.amount) ELSE coalesce(p.paid_amount,0) END;
 IF p_request_id IS NULL OR p_paid_total IS NULL OR p_paid_total::text IN ('NaN','Infinity','-Infinity') OR round(p_paid_total,2)<=actual OR p_paid_total>p.amount OR p_paid_date IS NULL OR p_paid_date>(now() AT TIME ZONE 'Europe/Moscow')::date THEN
 RAISE EXCEPTION 'Укажите полученную сумму в пределах остатка и дату не позже сегодня'; END IF;
 IF p.amount IS DISTINCT FROM p_expected_amount OR actual IS DISTINCT FROM p_expected_paid OR coalesce(p.task_expected_date,p.planned_date) IS DISTINCT FROM p_expected_date OR p.account IS DISTINCT FROM p_expected_account THEN
 RAISE EXCEPTION 'Платёж изменился. Обновите задачу и проверьте дату и сумму'; END IF;
 PERFORM 1 FROM public.finance_accounts WHERE name=p_received_account AND NOT archived FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Выберите действующий счёт'; END IF;
 events:=p.cash_receipts;
 -- Preserve the first, previously recorded cumulative receipt when starting installment accounting.
 IF jsonb_array_length(events)=0 AND actual>0 THEN
 events:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'amount',actual,'total',actual,'date',coalesce(p.paid_at,p.planned_date),'account',p.account)); END IF;
 delta:=round(p_paid_total-actual,2);
 events:=events||jsonb_build_array(jsonb_build_object('id',p_request_id,'amount',delta,'total',round(p_paid_total,2),'date',p_paid_date,'account',p_received_account,'actor',coalesce(p_actor,auth.uid())));
 UPDATE public.payments SET cash_receipts=events,requires_confirmation=true,
 status=CASE WHEN round(p_paid_total,2)=amount THEN 'paid'::public.payment_status ELSE 'partial'::public.payment_status END,
 paid_amount=round(p_paid_total,2),paid_at=(SELECT max((v->>'date')::date) FROM jsonb_array_elements(events) v) WHERE id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.finance_record_task_receipt(uuid,uuid,numeric,numeric,date,text,numeric,date,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_record_task_receipt(uuid,uuid,numeric,numeric,date,text,numeric,date,text,uuid,uuid) TO authenticated,service_role;

CREATE FUNCTION public.finance_reschedule_task(p_booking uuid,p_payment uuid,p_period date,p_kind text,p_expected_date date,p_date date,p_actor uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments; bid uuid; expected date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 SELECT property_id INTO bid FROM public.bookings WHERE id=p_booking;
 PERFORM 1 FROM public.properties WHERE id=bid FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=p_booking AND status::text<>'cancelled' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.properties WHERE id=bid AND portfolio='rm') OR p_date IS NULL OR p_date<'2000-01-01' OR p_date>'2200-01-01' THEN RAISE EXCEPTION 'Проверьте бронь и новую дату'; END IF;
 IF p_kind='receipt' THEN
 SELECT * INTO p FROM public.payments WHERE id=p_payment AND booking_id=p_booking AND direction='in' AND (rental_component IN ('rent','utilities','deposit') OR kind='deposit_in') FOR UPDATE;
 IF p.id IS NULL OR p.status='paid' OR coalesce(p.task_expected_date,p.planned_date) IS DISTINCT FROM p_expected_date THEN RAISE EXCEPTION 'Задача изменилась. Обновите список'; END IF;
 UPDATE public.payments SET task_expected_date=p_date WHERE id=p.id;
 ELSIF p_kind='owner_payout' THEN
 SELECT coalesce(min(owner_task_expected_date),
   (SELECT min(x.planned_date) FROM public.payments x WHERE x.rental_component='owner_plan' AND x.rental_period=p_period AND
    (x.booking_id=p_booking OR EXISTS(SELECT 1 FROM public.finance_owner_settlements st WHERE st.booking_id=p_booking AND st.obligation_id=x.obligation_id))),
   p_period+(least(min(owner_payout_day),extract(day FROM (p_period+interval '1 month - 1 day'))::integer)-1))
 INTO expected FROM public.payments WHERE booking_id=p_booking AND rental_period=p_period AND direction='in' AND rental_component IN ('rent','utilities') AND NOT owner_payout_on_request;
 IF expected IS DISTINCT FROM p_expected_date THEN RAISE EXCEPTION 'Задача изменилась. Обновите список'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payments WHERE booking_id=p_booking AND rental_period=p_period AND direction='in' AND rental_component IN ('rent','utilities') AND NOT owner_payout_on_request) THEN RAISE EXCEPTION 'Нет выплаты с фиксированным сроком'; END IF;
 UPDATE public.payments SET owner_task_expected_date=p_date WHERE booking_id=p_booking AND rental_period=p_period AND direction='in' AND rental_component IN ('rent','utilities') AND NOT owner_payout_on_request;
 ELSE RAISE EXCEPTION 'Неизвестная финансовая задача'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.finance_reschedule_task(uuid,uuid,date,text,date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_reschedule_task(uuid,uuid,date,text,date,date,uuid) TO authenticated,service_role;

-- Account history follows an explicit rename/transfer, and counts as usage even after full payment.
CREATE FUNCTION public.rename_receipt_accounts() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 UPDATE public.payments SET cash_receipts=(SELECT jsonb_agg(CASE WHEN v->>'account'=OLD.name THEN jsonb_set(v,'{account}',to_jsonb(NEW.name)) ELSE v END) FROM jsonb_array_elements(cash_receipts) v)
 WHERE cash_receipts @> jsonb_build_array(jsonb_build_object('account',OLD.name));
 RETURN NEW;
END $$;
CREATE TRIGGER rename_receipt_accounts AFTER UPDATE OF name ON public.finance_accounts FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION public.rename_receipt_accounts();
ALTER FUNCTION public.finance_account_usage(uuid) RENAME TO finance_account_usage_before_receipts;
CREATE FUNCTION public.finance_account_usage(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN public.finance_account_usage_before_receipts(p_id)||jsonb_build_object('receipts',(SELECT count(*) FROM public.payments p WHERE p.cash_receipts @> jsonb_build_array(jsonb_build_object('account',(SELECT name FROM public.finance_accounts WHERE id=p_id))))); END $$;
ALTER FUNCTION public.delete_finance_account(uuid,uuid) RENAME TO delete_finance_account_before_receipts;
CREATE FUNCTION public.delete_finance_account(p_id uuid,p_transfer_to uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source text; target text;
BEGIN
 IF NOT COALESCE(auth.role()='service_role' OR public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 PERFORM 1 FROM public.finance_accounts WHERE id IN(p_id,p_transfer_to) ORDER BY id FOR UPDATE;
 SELECT name INTO source FROM public.finance_accounts WHERE id=p_id;
 IF EXISTS(SELECT 1 FROM public.payments WHERE cash_receipts @> jsonb_build_array(jsonb_build_object('account',source))) THEN
 SELECT name INTO target FROM public.finance_accounts WHERE id=p_transfer_to AND NOT archived AND id<>p_id;
 IF target IS NULL THEN RAISE EXCEPTION 'Выберите счёт для переноса поступлений'; END IF;
 UPDATE public.payments SET cash_receipts=(SELECT jsonb_agg(CASE WHEN v->>'account'=source THEN jsonb_set(v,'{account}',to_jsonb(target)) ELSE v END) FROM jsonb_array_elements(cash_receipts) v) WHERE cash_receipts @> jsonb_build_array(jsonb_build_object('account',source)); END IF;
 PERFORM public.delete_finance_account_before_receipts(p_id,p_transfer_to);
END $$;
REVOKE ALL ON FUNCTION public.finance_account_usage_before_receipts(uuid),public.delete_finance_account_before_receipts(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finance_account_usage(uuid),public.delete_finance_account(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_account_usage(uuid),public.delete_finance_account(uuid,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
