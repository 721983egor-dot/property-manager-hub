-- Corrections are audited; real bank transfers are never performed by this function.
CREATE TABLE public.finance_confirmation_reversals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 payment_id uuid NOT NULL,
 receipt_id uuid,
 payout_request_id uuid,
 actor_id uuid NOT NULL,
 previous_payment jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_confirmation_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_reversals_admin_read ON public.finance_confirmation_reversals FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.finance_confirmation_reversals TO authenticated;
GRANT ALL ON public.finance_confirmation_reversals TO service_role;
CREATE TRIGGER log_finance_confirmation_reversals AFTER INSERT ON public.finance_confirmation_reversals FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE FUNCTION public.finance_guard_reversed_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.payout_request_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.finance_confirmation_reversals WHERE payout_request_id=NEW.payout_request_id) THEN
  RAISE EXCEPTION 'Подтверждение этой выплаты отменено. Откройте выплату заново';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.cash_receipts) e JOIN public.finance_confirmation_reversals r ON r.receipt_id=(e->>'id')::uuid WHERE r.payment_id=NEW.id) THEN
  RAISE EXCEPTION 'Подтверждение этого поступления отменено. Откройте платёж заново';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_guard_reversed_confirmation BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_guard_reversed_confirmation();
REVOKE ALL ON FUNCTION public.finance_guard_reversed_confirmation() FROM PUBLIC,anon,authenticated,service_role;

-- Remember the prior actual amount for ordinary (non-installment) one-click confirmations.
CREATE TABLE public.finance_confirmation_snapshots (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 payment_id uuid NOT NULL,
 previous_payment jsonb NOT NULL,
 confirmed_paid numeric NOT NULL,
 confirmed_date date,
 reversed boolean NOT NULL DEFAULT false
);
ALTER TABLE public.finance_confirmation_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_confirmation_snapshots_admin_read ON public.finance_confirmation_snapshots FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.finance_confirmation_snapshots TO authenticated;
GRANT ALL ON public.finance_confirmation_snapshots TO service_role;
CREATE FUNCTION public.finance_capture_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.rental_component IS DISTINCT FROM 'owner_plan' AND jsonb_array_length(NEW.cash_receipts)=0 AND NEW.status='paid' AND
 (OLD.status<>'paid' OR coalesce(NEW.paid_amount,NEW.amount)>coalesce(OLD.paid_amount,0)) THEN
  INSERT INTO public.finance_confirmation_snapshots(payment_id,previous_payment,confirmed_paid,confirmed_date)
  VALUES(NEW.id,to_jsonb(OLD),coalesce(NEW.paid_amount,NEW.amount),NEW.paid_at);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_capture_confirmation BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.finance_capture_confirmation();
REVOKE ALL ON FUNCTION public.finance_capture_confirmation() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finance_reverse_confirmation(p_payment uuid,p_receipt uuid,p_expected jsonb,p_request_id uuid,p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments; prior public.finance_confirmation_reversals; events jsonb; selected uuid; total numeric; actual numeric; saved public.finance_confirmation_snapshots; previous_date date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 IF p_request_id IS NULL OR p_expected IS NULL THEN RAISE EXCEPTION 'Обновите операцию'; END IF;
 PERFORM 1 FROM public.properties WHERE id=(SELECT property_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 PERFORM 1 FROM public.bookings WHERE id=(SELECT booking_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 PERFORM 1 FROM public.finance_obligations WHERE id=(SELECT obligation_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 -- Lock the retry key as well as the row, including after an owner payout has been removed.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO prior FROM public.finance_confirmation_reversals WHERE request_id=p_request_id;
 IF prior.id IS NOT NULL THEN
  IF prior.payment_id<>p_payment OR prior.previous_payment IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Повторный запрос содержит другую операцию'; END IF;
  RETURN jsonb_build_object('reversed',true,'paymentId',p_payment);
 END IF;
 SELECT * INTO p FROM public.payments WHERE id=p_payment FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Операция уже изменена. Обновите календарь'; END IF;
 IF p.rental_component='owner_plan' THEN RAISE EXCEPTION 'Это план выплаты, подтверждения ещё нет'; END IF;
 IF p.updated_at IS DISTINCT FROM (p_expected->>'updated_at')::timestamptz OR p.status::text IS DISTINCT FROM p_expected->>'status' OR p.amount IS DISTINCT FROM (p_expected->>'amount')::numeric OR p.paid_amount IS DISTINCT FROM (p_expected->>'paid_amount')::numeric OR p.paid_at IS DISTINCT FROM (p_expected->>'paid_at')::date OR p.cash_receipts IS DISTINCT FROM p_expected->'cash_receipts' THEN
  RAISE EXCEPTION 'Операция изменилась. Откройте подтверждение заново';
 END IF;
 actual:=CASE WHEN p.status='paid' THEN coalesce(p.paid_amount,p.amount) WHEN p.status='partial' THEN coalesce(p.paid_amount,0) WHEN NOT p.requires_confirmation AND p.kind<>'owner_payout' AND p.planned_date<=(now() AT TIME ZONE 'Europe/Moscow')::date THEN p.amount ELSE 0 END;
 IF actual<=0 THEN RAISE EXCEPTION 'У операции нет подтверждённой оплаты'; END IF;
 IF jsonb_array_length(p.cash_receipts)>0 THEN
  selected:=coalesce(p_receipt,(p.cash_receipts->-1->>'id')::uuid);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.cash_receipts) e WHERE e->>'id'=selected::text) THEN RAISE EXCEPTION 'Эта часть оплаты уже изменена'; END IF;
  SELECT coalesce(jsonb_agg(e ORDER BY ord),'[]'::jsonb) INTO events FROM jsonb_array_elements(p.cash_receipts) WITH ORDINALITY AS x(e,ord) WHERE e->>'id'<>selected::text;
 ELSE
  IF p_receipt IS NOT NULL THEN RAISE EXCEPTION 'Часть оплаты не найдена'; END IF;
  events:='[]'::jsonb;
 END IF;
 INSERT INTO public.finance_confirmation_reversals(request_id,payment_id,receipt_id,payout_request_id,actor_id,previous_payment)
 VALUES(p_request_id,p.id,selected,p.payout_request_id,coalesce(p_actor,auth.uid()),to_jsonb(p));
 IF p.kind='owner_payout' AND EXISTS(SELECT 1 FROM public.finance_owner_settlements WHERE obligation_id=p.obligation_id) THEN
  -- The generated pending payout is rebuilt by existing settlement triggers.
  DELETE FROM public.payments WHERE id=p.id;
 ELSE
  SELECT coalesce(sum((e->>'amount')::numeric),0) INTO total FROM jsonb_array_elements(events) e;
  SELECT max((e->>'date')::date) INTO previous_date FROM jsonb_array_elements(events) e;
  IF jsonb_array_length(p.cash_receipts)=0 THEN
   SELECT * INTO saved FROM public.finance_confirmation_snapshots WHERE payment_id=p.id AND NOT reversed
    AND confirmed_paid=actual AND confirmed_date IS NOT DISTINCT FROM p.paid_at ORDER BY id DESC LIMIT 1 FOR UPDATE;
   IF saved.id IS NOT NULL THEN
    total:=CASE WHEN saved.previous_payment->>'status'='paid' THEN coalesce((saved.previous_payment->>'paid_amount')::numeric,(saved.previous_payment->>'amount')::numeric) ELSE coalesce((saved.previous_payment->>'paid_amount')::numeric,0) END;
    previous_date:=(saved.previous_payment->>'paid_at')::date;
    UPDATE public.finance_confirmation_snapshots SET reversed=true WHERE id=saved.id;
   END IF;
  END IF;
  UPDATE public.payments SET cash_receipts=events,status='partial',paid_amount=total,
   paid_at=previous_date,requires_confirmation=true WHERE id=p.id;
 END IF;
 RETURN jsonb_build_object('reversed',true,'paymentId',p.id);
END $$;
REVOKE ALL ON FUNCTION public.finance_reverse_confirmation(uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_reverse_confirmation(uuid,uuid,jsonb,uuid,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
