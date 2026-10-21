-- Financial tasks are a live projection. Only the explicit receipt confirmation writes the ledger.
CREATE FUNCTION public.finance_confirm_task_receipt(
 p_payment uuid,p_booking uuid,p_expected_amount numeric,p_expected_paid numeric,p_expected_date date,
 p_expected_account text,p_paid_total numeric,p_paid_date date,p_actor uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments; actual numeric; today date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=p_booking FOR UPDATE;
 SELECT * INTO p FROM public.payments WHERE id=p_payment FOR UPDATE;
 IF p.id IS NULL OR p.booking_id IS DISTINCT FROM p_booking OR p.direction<>'in' OR
  NOT(coalesce(p.rental_component IN ('rent','utilities','deposit'),false) OR p.kind='deposit_in') OR
  NOT EXISTS(SELECT 1 FROM public.bookings b JOIN public.properties prop ON prop.id=b.property_id WHERE b.id=p_booking AND prop.portfolio='rm' AND b.status::text<>'cancelled')
 THEN RAISE EXCEPTION 'Поступление по действующей брони не найдено'; END IF;
 actual:=CASE WHEN p.status='paid' THEN coalesce(p.paid_amount,p.amount) ELSE coalesce(p.paid_amount,0) END;
 IF p_paid_total IS NULL OR p_paid_total::text IN ('NaN','Infinity','-Infinity') OR p_paid_total<=0 OR p_paid_total>p.amount OR p_paid_date IS NULL OR p_paid_date>today THEN RAISE EXCEPTION 'Укажите полученную сумму и фактическую дату не позже сегодня'; END IF;
 -- A network retry may repeat the same cumulative amount, but may never count it twice.
 IF actual=round(p_paid_total,2) AND p.paid_at=p_paid_date THEN RETURN; END IF;
 IF p.amount IS DISTINCT FROM p_expected_amount OR actual IS DISTINCT FROM p_expected_paid OR
  p.planned_date IS DISTINCT FROM p_expected_date OR p.account IS DISTINCT FROM p_expected_account OR p_paid_total<=actual
 THEN RAISE EXCEPTION 'Платёж изменился. Обновите задачу и проверьте дату и сумму'; END IF;
 UPDATE public.payments SET status=CASE WHEN round(p_paid_total,2)=amount THEN 'paid'::public.payment_status ELSE 'partial'::public.payment_status END,
  paid_amount=round(p_paid_total,2),paid_at=p_paid_date WHERE id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.finance_confirm_task_receipt(uuid,uuid,numeric,numeric,date,text,numeric,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_confirm_task_receipt(uuid,uuid,numeric,numeric,date,text,numeric,date,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
