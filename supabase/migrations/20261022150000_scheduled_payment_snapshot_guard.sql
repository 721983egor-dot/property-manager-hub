-- Reclassification, direction or counterparty edits also invalidate an open payment confirmation.
CREATE FUNCTION public.finance_record_scheduled_payment_checked(
 p_payment uuid,p_expected_amount numeric,p_expected_paid numeric,p_expected_date date,p_expected_account text,
 p_paid_total numeric,p_paid_date date,p_received_account text,p_request_id uuid,p_expected_updated_at timestamptz,p_actor uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=(SELECT booking_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 SELECT * INTO p FROM public.payments WHERE id=p_payment FOR UPDATE;
 -- A completed request may be retried after its own UPDATE changed the timestamp.
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.cash_receipts) e WHERE e->>'id'=p_request_id::text)
 AND (p_expected_updated_at IS NULL OR p.updated_at IS DISTINCT FROM p_expected_updated_at) THEN
  RAISE EXCEPTION 'Платёж изменился. Откройте задачу заново';
 END IF;
 PERFORM public.finance_record_scheduled_payment(p_payment,p_expected_amount,p_expected_paid,p_expected_date,p_expected_account,p_paid_total,p_paid_date,p_received_account,p_request_id,p_actor);
END $$;
REVOKE ALL ON FUNCTION public.finance_record_scheduled_payment(uuid,numeric,numeric,date,text,numeric,date,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finance_record_scheduled_payment_checked(uuid,numeric,numeric,date,text,numeric,date,text,uuid,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_record_scheduled_payment_checked(uuid,numeric,numeric,date,text,numeric,date,text,uuid,timestamptz,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
