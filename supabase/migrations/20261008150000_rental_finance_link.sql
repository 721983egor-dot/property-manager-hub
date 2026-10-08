-- Management commission is recurring income, separate from the listing's one-time commission.
ALTER TABLE public.payments ADD COLUMN management_period date
 CHECK(management_period IS NULL OR extract(day FROM management_period)=1);
CREATE UNIQUE INDEX payments_management_booking_period ON public.payments(booking_id,management_period)
 WHERE management_period IS NOT NULL;

INSERT INTO public.finance_article_categories(name,direction)
 SELECT 'Доход компании','in' WHERE NOT EXISTS(SELECT 1 FROM public.finance_article_categories WHERE name='Доход компании' AND direction='in');
INSERT INTO public.finance_articles(name,direction,code,affects_profit,category_id)
 SELECT 'Управление объектами','in','management_fee',true,id FROM public.finance_article_categories WHERE name='Доход компании' AND direction='in' ORDER BY id LIMIT 1
ON CONFLICT(code) WHERE code IS NOT NULL DO NOTHING;

CREATE FUNCTION public.create_management_fee_payment(p_booking_id uuid,p_period date,p_expected_amount numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; rate numeric; fee_type text; rent numeric; fee numeric; due date; result uuid; article uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Только администратор'; END IF;
 IF p_period IS NULL OR extract(day FROM p_period)<>1 THEN RAISE EXCEPTION 'Укажите месяц'; END IF;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF b.id IS NULL OR b.status<>'active' OR b.stay_kind<>'long_term' THEN RAISE EXCEPTION 'Действующая долгосрочная аренда не найдена'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.properties WHERE id=b.property_id AND portfolio='rm' AND status<>'archived') THEN RAISE EXCEPTION 'Объект РМ ОС недоступен'; END IF;
 SELECT id INTO result FROM public.payments WHERE booking_id=b.id AND management_period=p_period;
 IF result IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.payments WHERE id=result AND amount=p_expected_amount) THEN RAISE EXCEPTION 'Запись уже существует с другой суммой. Обновите страницу'; END IF;
  RETURN result;
 END IF;
 SELECT management_fee_value,management_fee_type INTO rate,fee_type FROM public.properties WHERE id=b.property_id FOR SHARE;
 IF rate IS NULL OR rate<=0 THEN RAISE EXCEPTION 'Укажите комиссию за управление больше нуля'; END IF;
 due := p_period + (least(b.payment_day,extract(day FROM (p_period+interval '1 month - 1 day'))::int)-1);
 IF due<b.start_date OR due>=b.end_date THEN RAISE EXCEPTION 'В этом месяце нет планового платежа по договору'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings other WHERE other.property_id=b.property_id AND other.id<>b.id AND other.status='active' AND other.stay_kind='long_term' AND other.start_date<b.end_date AND other.end_date>b.start_date) THEN RAISE EXCEPTION 'Проверьте пересекающиеся договоры аренды'; END IF;
 rent := b.price_month;
 IF b.price_type='periodic' THEN
  IF (SELECT count(*) FROM public.booking_price_periods WHERE booking_id=b.id AND start_date<=due AND end_date>=due)<>1 THEN RAISE EXCEPTION 'Цена для даты платежа не определена однозначно'; END IF;
  SELECT price_month INTO rent FROM public.booking_price_periods WHERE booking_id=b.id AND start_date<=due AND end_date>=due;
 END IF;
 IF rent IS NULL OR rent<=0 THEN RAISE EXCEPTION 'Укажите цену аренды в договоре'; END IF;
 fee := CASE WHEN fee_type='amount' THEN round(rate,2) ELSE round(rent*rate/100,2) END;
 IF fee>rent THEN RAISE EXCEPTION 'Комиссия превышает аренду'; END IF;
 IF p_expected_amount IS NULL OR fee<>p_expected_amount THEN RAISE EXCEPTION 'Условия аренды изменились. Обновите расчёт и подтвердите заново'; END IF;
 IF fee<=0 THEN RAISE EXCEPTION 'Комиссия меньше копейки'; END IF;
 SELECT id INTO article FROM public.finance_articles WHERE code='management_fee' AND direction='in';
 IF article IS NULL THEN RAISE EXCEPTION 'Восстановите статью Управление объектами'; END IF;
 INSERT INTO public.payments(planned_date,amount,direction,status,kind,property_id,client_id,booking_id,article_id,management_period,comment)
 VALUES(due,fee,'in','expected','other',b.property_id,b.client_id,b.id,article,p_period,
 'Комиссия за управление '||rate||CASE WHEN fee_type='amount' THEN ' ₽ от аренды ' ELSE '% от аренды ' END||rent||' ₽ за '||to_char(p_period,'MM.YYYY')) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_management_fee_payment(uuid,date,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_management_fee_payment(uuid,date,numeric) TO authenticated;
NOTIFY pgrst,'reload schema';
