-- All explicit future operations need confirmation. Historical automatic facts retain their meaning.
UPDATE public.payments SET requires_confirmation=true
WHERE rental_component IS DISTINCT FROM 'owner_plan' AND status<>'paid' AND (planned_date>=(now() AT TIME ZONE 'Europe/Moscow')::date OR status='partial');
CREATE FUNCTION public.finance_require_scheduled_confirmation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'paid' THEN NEW.requires_confirmation:=true; END IF;
 ELSIF OLD.status='paid' AND NEW.status<>'paid' THEN NEW.requires_confirmation:=true;
 ELSIF NEW.planned_date>=(now() AT TIME ZONE 'Europe/Moscow')::date AND NEW.status<>'paid' THEN NEW.requires_confirmation:=true;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_require_scheduled_confirmation BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_require_scheduled_confirmation();

CREATE FUNCTION public.finance_record_scheduled_payment(
 p_payment uuid,p_expected_amount numeric,p_expected_paid numeric,p_expected_date date,p_expected_account text,
 p_paid_total numeric,p_paid_date date,p_received_account text,p_request_id uuid,p_actor uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments; actual numeric; events jsonb; previous jsonb;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=(SELECT booking_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 SELECT * INTO p FROM public.payments WHERE id=p_payment FOR UPDATE;
 IF p.id IS NULL OR p.rental_component='owner_plan' OR p.owner_payout_on_request AND p.kind='owner_payout' THEN RAISE EXCEPTION 'Платёж не найден или требует подтверждения через расчёт собственника'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings WHERE id=p.booking_id AND status::text='cancelled') THEN RAISE EXCEPTION 'Бронь отменена. Проверьте платёж в финансах'; END IF;
 SELECT v INTO previous FROM jsonb_array_elements(p.cash_receipts) v WHERE v->>'id'=p_request_id::text;
 IF previous IS NOT NULL THEN
  IF (previous->>'total')::numeric=p_paid_total AND previous->>'date'=p_paid_date::text AND previous->>'account'=p_received_account THEN RETURN; END IF;
  RAISE EXCEPTION 'Повторный запрос содержит другие условия оплаты';
 END IF;
 actual:=CASE WHEN p.status='paid' THEN coalesce(p.paid_amount,p.amount) ELSE coalesce(p.paid_amount,0) END;
 IF p_request_id IS NULL OR p_paid_total IS NULL OR p_paid_total::text IN ('NaN','Infinity','-Infinity') OR round(p_paid_total,2)<=actual OR p_paid_total>p.amount OR p_paid_date IS NULL OR p_paid_date>(now() AT TIME ZONE 'Europe/Moscow')::date THEN RAISE EXCEPTION 'Укажите сумму в пределах остатка и фактическую дату не позже сегодня'; END IF;
 IF p.amount IS DISTINCT FROM p_expected_amount OR actual IS DISTINCT FROM p_expected_paid OR coalesce(p.task_expected_date,p.planned_date) IS DISTINCT FROM p_expected_date OR p.account IS DISTINCT FROM p_expected_account THEN RAISE EXCEPTION 'Платёж изменился. Откройте задачу заново'; END IF;
 PERFORM 1 FROM public.finance_accounts WHERE name=p_received_account AND NOT archived FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Выберите действующий счёт'; END IF;
 events:=p.cash_receipts;
 IF jsonb_array_length(events)=0 AND actual>0 THEN events:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'amount',actual,'total',actual,'date',coalesce(p.paid_at,p.planned_date),'account',p.account)); END IF;
 events:=events||jsonb_build_array(jsonb_build_object('id',p_request_id,'amount',round(p_paid_total-actual,2),'total',round(p_paid_total,2),'date',p_paid_date,'account',p_received_account,'actor',coalesce(p_actor,auth.uid())));
 UPDATE public.payments SET cash_receipts=events,requires_confirmation=true,
 status=CASE WHEN round(p_paid_total,2)=amount THEN 'paid'::public.payment_status ELSE 'partial'::public.payment_status END,
 paid_amount=round(p_paid_total,2),paid_at=(SELECT max((v->>'date')::date) FROM jsonb_array_elements(events) v) WHERE id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.finance_record_scheduled_payment(uuid,numeric,numeric,date,text,numeric,date,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_record_scheduled_payment(uuid,numeric,numeric,date,text,numeric,date,text,uuid,uuid) TO authenticated,service_role;

CREATE FUNCTION public.finance_reschedule_payment(p_payment uuid,p_expected_date date,p_date date,p_actor uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments; previous text;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=(SELECT booking_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 SELECT * INTO p FROM public.payments WHERE id=p_payment FOR UPDATE;
 IF p.id IS NULL OR p.status='paid' OR (p.rental_component='owner_plan' AND p.owner_payout_on_request) OR coalesce(p.task_expected_date,p.planned_date) IS DISTINCT FROM p_expected_date THEN RAISE EXCEPTION 'Задача изменилась. Обновите список'; END IF;
 IF p_date IS NULL OR p_date<'2000-01-01' OR p_date>'2200-01-01' THEN RAISE EXCEPTION 'Проверьте новую дату'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings WHERE id=p.booking_id AND status::text='cancelled') THEN RAISE EXCEPTION 'Бронь отменена'; END IF;
 previous:=current_setting('rm.owner_plan_write',true);
 IF p.rental_component='owner_plan' THEN PERFORM set_config('rm.owner_plan_write','yes',true); END IF;
 UPDATE public.payments SET task_expected_date=p_date,requires_confirmation=true WHERE id=p.id;
 PERFORM set_config('rm.owner_plan_write',coalesce(previous,''),true);
END $$;
REVOKE ALL ON FUNCTION public.finance_reschedule_payment(uuid,date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_reschedule_payment(uuid,date,date,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
