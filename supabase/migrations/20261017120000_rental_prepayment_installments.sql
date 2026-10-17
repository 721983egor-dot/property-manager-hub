-- Explicit two-stage rent: upfront company fee is allocated once, never a second bank receipt.
CREATE TABLE public.finance_rental_installments (
 id uuid PRIMARY KEY,
 booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
 period date NOT NULL CHECK(extract(day FROM period)=1),
 total_amount numeric NOT NULL CHECK(total_amount>0 AND total_amount::text NOT IN ('NaN','Infinity','-Infinity')),
 total_fee numeric NOT NULL CHECK(total_fee>=0),
 advance_amount numeric NOT NULL CHECK(advance_amount>0 AND advance_amount<total_amount AND total_fee<=advance_amount),
 advance_date date NOT NULL,
 balance_date date NOT NULL CHECK(balance_date>=advance_date),
 account text NOT NULL,
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(booking_id,period)
);
ALTER TABLE public.finance_rental_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_rental_installments_admin ON public.finance_rental_installments FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
REVOKE ALL ON public.finance_rental_installments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.finance_rental_installments TO authenticated;
GRANT ALL ON public.finance_rental_installments TO service_role;
CREATE TRIGGER log_finance_rental_installments AFTER INSERT OR UPDATE OR DELETE ON public.finance_rental_installments FOR EACH ROW EXECUTE FUNCTION public.log_activity();
ALTER TABLE public.payments
 ADD COLUMN rental_installment_id uuid REFERENCES public.finance_rental_installments(id) ON DELETE RESTRICT,
 ADD COLUMN rental_stage text CHECK(rental_stage IN ('prepayment','balance')),
 ADD CONSTRAINT finance_installment_stage_pair CHECK((rental_installment_id IS NULL)=(rental_stage IS NULL));
CREATE UNIQUE INDEX finance_installment_payment_stage ON public.payments(rental_installment_id,rental_stage) WHERE rental_installment_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.finance_rental_payment_terms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; d public.deals; p public.properties; rate numeric; fee numeric; nominal numeric; g public.finance_rental_installments;
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
 nominal:=b.price_month;
 IF b.price_type='periodic' THEN
  SELECT CASE WHEN count(*)=1 THEN min(price_month) ELSE NULL END INTO nominal FROM public.booking_price_periods WHERE booking_id=b.id AND start_date<=NEW.planned_date AND end_date>=NEW.planned_date;
 END IF;
 IF d.id IS NOT NULL THEN rate:=d.income_value; fee:=CASE WHEN d.income_type='percent' THEN NEW.amount*rate/100 ELSE NEW.amount*rate/nullif(nominal,0) END;
 ELSE rate:=p.management_fee_value; fee:=CASE WHEN p.management_fee_type='percent' THEN NEW.amount*rate/100 ELSE NEW.amount*rate/nullif(nominal,0) END; END IF;
 IF rate IS NULL OR fee IS NULL OR fee<0 OR fee>NEW.amount THEN RAISE EXCEPTION 'Укажите корректную комиссию за управление в условиях аренды/объекта'; END IF;
 NEW.company_fee:=round(fee,2); RETURN NEW;
END $$;

CREATE FUNCTION public.finance_create_rental_installments(
 p_booking uuid,p_period date,p_total numeric,p_fee numeric,p_advance numeric,
 p_advance_date date,p_balance_date date,p_account text,p_request uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; g public.finance_rental_installments; article uuid; nominal numeric;
BEGIN
 IF NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 IF p_booking IS NULL OR p_request IS NULL OR p_period IS NULL OR extract(day FROM p_period)<>1 OR p_total IS NULL OR p_fee IS NULL OR p_advance IS NULL OR p_total::text IN ('NaN','Infinity','-Infinity') OR p_fee::text IN ('NaN','Infinity','-Infinity') OR p_advance::text IN ('NaN','Infinity','-Infinity') OR p_total<=0 OR p_fee<0 OR p_advance<=0 OR p_advance>=p_total OR p_fee>p_advance OR round(p_total,2)<>p_total OR round(p_fee,2)<>p_fee OR round(p_advance,2)<>p_advance THEN RAISE EXCEPTION 'Проверьте общую сумму, предоплату и комиссию'; END IF;
 IF p_advance_date IS NULL OR p_balance_date IS NULL OR p_balance_date<p_advance_date OR date_trunc('month',p_balance_date)::date<>p_period THEN RAISE EXCEPTION 'Проверьте даты предоплаты, остатка и расчётный месяц'; END IF;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking;
 IF b.id IS NULL OR b.status<>'active' THEN RAISE EXCEPTION 'Действующая бронь не найдена'; END IF;
 -- Same lock order as owner settlement sync: property before any derived rows.
 PERFORM 1 FROM public.properties WHERE id=b.property_id FOR UPDATE;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF b.status<>'active' OR p_balance_date<b.start_date OR p_balance_date>=b.end_date THEN RAISE EXCEPTION 'Дата остатка должна входить в действующий срок аренды'; END IF;
 SELECT * INTO g FROM public.finance_rental_installments WHERE id=p_request OR (booking_id=p_booking AND period=p_period);
 IF FOUND THEN
  IF g.booking_id=p_booking AND g.period=p_period AND g.total_amount=p_total AND g.total_fee=p_fee AND g.advance_amount=p_advance AND g.advance_date=p_advance_date AND g.balance_date=p_balance_date AND g.account=p_account THEN RETURN g.id; END IF;
  RAISE EXCEPTION 'График уже создан с другими условиями. Обновите страницу';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE name=p_account AND NOT archived) THEN RAISE EXCEPTION 'Выберите действующий счёт'; END IF;
 nominal:=b.price_month;
 IF b.price_type='periodic' THEN SELECT CASE WHEN count(*)=1 THEN min(price_month) ELSE NULL END INTO nominal FROM public.booking_price_periods WHERE booking_id=b.id AND start_date<=p_balance_date AND end_date>=p_balance_date; END IF;
 IF nominal IS NULL OR nominal<>p_total THEN RAISE EXCEPTION 'Общая сумма должна совпадать с арендой за период в брони'; END IF;
 IF EXISTS(SELECT 1 FROM public.payments WHERE kind='rent_in' AND direction='in' AND (booking_id=b.id OR (property_id=b.property_id AND client_id=b.client_id)) AND coalesce(rental_period,date_trunc('month',planned_date)::date)=p_period) THEN RAISE EXCEPTION 'За этот месяц уже есть аренда. Сначала проверьте существующие операции, чтобы не задвоить деньги'; END IF;
 INSERT INTO public.finance_rental_installments(id,booking_id,period,total_amount,total_fee,advance_amount,advance_date,balance_date,account) VALUES(p_request,b.id,p_period,p_total,p_fee,p_advance,p_advance_date,p_balance_date,p_account);
 SELECT id INTO article FROM public.finance_articles WHERE code='rent_in' LIMIT 1;
 INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,client_id,booking_id,counterparty_name,account,comment,article_id,rental_component,rental_period,rental_installment_id,rental_stage)
 VALUES
 (p_advance_date,p_advance,'in','expected','rent_in',b.property_id,b.client_id,b.id,(SELECT full_name FROM public.clients WHERE id=b.client_id),p_account,'Предоплата за аренду. Комиссия компании удерживается сначала из предоплаты.',article,'rent',p_period,p_request,'prepayment'),
 (p_balance_date,p_total-p_advance,'in','expected','rent_in',b.property_id,b.client_id,b.id,(SELECT full_name FROM public.clients WHERE id=b.client_id),p_account,'Остаток оплаты при заезде. Комиссия уже удержана из предоплаты.',article,'rent',p_period,p_request,'balance');
 RETURN p_request;
END $$;
REVOKE ALL ON FUNCTION public.finance_create_rental_installments(uuid,date,numeric,numeric,numeric,date,date,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finance_create_rental_installments(uuid,date,numeric,numeric,numeric,date,date,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
