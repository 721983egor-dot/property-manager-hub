ALTER TABLE public.finance_object_settings
 ADD COLUMN owner_counterparty_id uuid REFERENCES public.finance_counterparties(id) ON DELETE SET NULL,
 ADD COLUMN payout_day integer CHECK(payout_day BETWEEN 1 AND 31);
CREATE TABLE public.finance_owner_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
 period date NOT NULL CHECK(extract(day FROM period)=1),
 obligation_id uuid NOT NULL UNIQUE REFERENCES public.finance_obligations(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(property_id,period)
);
GRANT SELECT ON public.finance_owner_settlements TO authenticated;
GRANT ALL ON public.finance_owner_settlements TO service_role;
ALTER TABLE public.finance_owner_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_owner_settlements_admin ON public.finance_owner_settlements FOR ALL TO authenticated
 USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE TRIGGER log_finance_owner_settlements AFTER INSERT OR UPDATE OR DELETE ON public.finance_owner_settlements FOR EACH ROW EXECUTE FUNCTION public.log_activity();
ALTER TABLE public.payments ADD COLUMN payout_request_id uuid UNIQUE;
-- An owner remittance is settlement of a liability, not a second operating expense.
UPDATE public.finance_articles SET affects_profit=false WHERE code='owner_payout';
CREATE FUNCTION public.create_owner_settlement(p_property_id uuid,p_period date,p_amount numeric,p_legal_entity text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.finance_object_settings; due date; ob uuid; result uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Только администратор'; END IF;
 SELECT * INTO cfg FROM public.finance_object_settings WHERE property_id=p_property_id FOR UPDATE;
 IF cfg.owner_counterparty_id IS NULL OR cfg.payout_day IS NULL THEN RAISE EXCEPTION 'Укажите собственника и день выплаты'; END IF;
 IF p_period IS NULL OR extract(day FROM p_period)<>1 OR p_amount IS NULL OR p_amount<=0 OR p_amount='NaN'::numeric OR p_amount='Infinity'::numeric OR length(btrim(coalesce(p_legal_entity,'')))=0 THEN RAISE EXCEPTION 'Укажите месяц, положительную сумму и юридическое лицо'; END IF;
 SELECT id INTO result FROM public.finance_owner_settlements WHERE property_id=p_property_id AND period=p_period;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Расчёт за этот месяц уже создан'; END IF;
 due := p_period + (least(cfg.payout_day,extract(day FROM (p_period+interval '1 month - 1 day'))::int)-1);
 INSERT INTO public.finance_obligations(counterparty_id,planned_date,amount,direction,description,legal_entity,property_id,status)
 VALUES(cfg.owner_counterparty_id,due,p_amount,'payable','Выплата собственнику за '||to_char(p_period,'MM.YYYY'),btrim(p_legal_entity),p_property_id,'open') RETURNING id INTO ob;
 INSERT INTO public.finance_owner_settlements(property_id,period,obligation_id) VALUES(p_property_id,p_period,ob) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.pay_owner_settlement(p_obligation_id uuid,p_amount numeric,p_account text,p_paid_date date,p_request_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ob public.finance_obligations; paid numeric; result uuid; article uuid; party text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Только администратор'; END IF;
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
REVOKE ALL ON FUNCTION public.create_owner_settlement(uuid,date,numeric,text),public.pay_owner_settlement(uuid,numeric,text,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_owner_settlement(uuid,date,numeric,text),public.pay_owner_settlement(uuid,numeric,text,date,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
