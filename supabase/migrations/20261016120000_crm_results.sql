-- CRM: dated results, private editable loss catalog and atomic contract/booking.
CREATE TABLE public.deal_loss_reasons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pipeline text NOT NULL CHECK(pipeline IN ('rental','intake')),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),position int NOT NULL DEFAULT 0,archived boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX deal_loss_reasons_active_name ON public.deal_loss_reasons(pipeline,lower(trim(name))) WHERE NOT archived;
ALTER TABLE public.deal_loss_reasons ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.deal_loss_reasons TO authenticated;
GRANT ALL ON public.deal_loss_reasons TO service_role;
CREATE POLICY loss_admin ON public.deal_loss_reasons FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin')) WITH CHECK(EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin'));
INSERT INTO public.deal_loss_reasons(pipeline,name,position) SELECT 'rental',name,n FROM unnest(ARRAY['Не подошла стоимость','Не подошёл объект','Снял через других','Отложил переезд','Нет связи']) WITH ORDINALITY t(name,n);
INSERT INTO public.deal_loss_reasons(pipeline,name,position) SELECT 'intake',name,n FROM unnest(ARRAY['Не согласовали условия','Собственник передумал','Сдал самостоятельно','Объект не подходит','Нет связи']) WITH ORDINALITY t(name,n);
ALTER TABLE public.deals ADD COLUMN closed_at timestamptz, ADD COLUMN closing_source text NOT NULL DEFAULT '',ADD COLUMN loss_reason_id uuid REFERENCES public.deal_loss_reasons(id),ADD COLUMN loss_reason_name text,ADD COLUMN loss_comment text NOT NULL DEFAULT '',ADD COLUMN booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,ADD COLUMN income_type text CHECK(income_type IN ('percent','amount')),ADD COLUMN income_value numeric CHECK(income_value>=0),ADD COLUMN income_month numeric CHECK(income_month>=0);
CREATE INDEX deals_closed_idx ON public.deals(pipeline,closed_at);
CREATE UNIQUE INDEX deals_booking_unique ON public.deals(booking_id) WHERE booking_id IS NOT NULL;
-- Recover only a real transition in the audit log, never substitute updated_at.
UPDATE public.deals d SET closed_at=(SELECT max(l.created_at) FROM public.activity_log l WHERE l.table_name='deals' AND l.record_id=d.id AND l.changes->'stage_id'->>'to'=d.stage_id::text AND (l.changes->'stage_id'->>'from') IS DISTINCT FROM d.stage_id::text) WHERE EXISTS(SELECT 1 FROM public.deal_stages s WHERE s.id=d.stage_id AND s.kind IN ('won','lost'));
CREATE FUNCTION public.crm_check_actor(p_actor uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=CASE WHEN auth.role()='service_role' THEN p_actor ELSE auth.uid() END AND role='admin') THEN RAISE EXCEPTION 'Только администратор'; END IF;
END $$;
CREATE FUNCTION public.crm_deal_result_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s public.deal_stages; r public.deal_loss_reasons; changed boolean;
BEGIN
 SELECT * INTO s FROM public.deal_stages WHERE id=NEW.stage_id;
 IF s.pipeline<>NEW.pipeline THEN RAISE EXCEPTION 'Этап из другой воронки'; END IF;
 changed:=TG_OP='INSERT'; IF TG_OP='UPDATE' THEN changed:=NEW.stage_id IS DISTINCT FROM OLD.stage_id; END IF;
 IF NEW.loss_reason_id IS NOT NULL THEN
  SELECT * INTO r FROM public.deal_loss_reasons WHERE id=NEW.loss_reason_id;
  IF r.pipeline<>NEW.pipeline THEN RAISE EXCEPTION 'Причина из другой воронки'; END IF;
  IF changed AND s.kind='lost' AND r.archived THEN RAISE EXCEPTION 'Причина удалена из выбора'; END IF;
  IF TG_OP='INSERT' THEN NEW.loss_reason_name:=r.name;
  ELSIF NEW.loss_reason_id IS DISTINCT FROM OLD.loss_reason_id THEN NEW.loss_reason_name:=r.name; END IF;
 END IF;
 IF changed THEN
  IF s.kind='won' AND NEW.pipeline='rental' AND (NEW.closed_property_id IS NULL OR NEW.start_date IS NULL OR NEW.end_date IS NULL OR NEW.price_month IS NULL OR NEW.income_month IS NULL OR length(trim(NEW.closing_source))=0) THEN RAISE EXCEPTION 'Закройте сделку через форму успешной аренды'; END IF;
  IF s.kind='won' AND NEW.pipeline='intake' AND NEW.property_id IS NULL THEN RAISE EXCEPTION 'Подтвердите приём и связь с объектом'; END IF;
  IF s.kind='lost' AND NEW.loss_reason_id IS NULL THEN RAISE EXCEPTION 'Укажите причину провала'; END IF;
  IF s.kind IN ('won','lost') THEN IF TG_OP='UPDATE' AND NEW.closed_at IS NOT DISTINCT FROM OLD.closed_at THEN NEW.closed_at:=now(); ELSE NEW.closed_at:=coalesce(NEW.closed_at,now()); END IF; ELSE NEW.closed_at:=NULL; END IF;
  IF s.kind<>'lost' THEN NEW.loss_reason_id:=NULL;NEW.loss_reason_name:=NULL;NEW.loss_comment:=''; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_deal_result_guard BEFORE INSERT OR UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.crm_deal_result_guard();
CREATE FUNCTION public.crm_close_lost(p_deal uuid,p_reason uuid,p_comment text DEFAULT '',p_closed_on date DEFAULT NULL,p_actor uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.deals; s uuid; r public.deal_loss_reasons;
BEGIN
 PERFORM public.crm_check_actor(p_actor); SELECT * INTO d FROM public.deals WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Сделка не найдена'; END IF;
 SELECT * INTO r FROM public.deal_loss_reasons WHERE id=p_reason AND pipeline=d.pipeline AND NOT archived;
 IF NOT FOUND THEN RAISE EXCEPTION 'Выберите действующую причину'; END IF;
 SELECT id INTO s FROM public.deal_stages WHERE pipeline=d.pipeline AND kind='lost' ORDER BY position LIMIT 1;
 IF s IS NULL THEN RAISE EXCEPTION 'Нет этапа отказа'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings WHERE id=d.booking_id AND status<>'cancelled') THEN RAISE EXCEPTION 'У сделки есть действующая бронь: сначала проверьте или отмените её'; END IF;
 IF coalesce(p_closed_on,(now() AT TIME ZONE 'Europe/Moscow')::date)>(now() AT TIME ZONE 'Europe/Moscow')::date THEN RAISE EXCEPTION 'Дата закрытия в будущем'; END IF;
 UPDATE public.deals SET stage_id=s,loss_reason_id=r.id,loss_reason_name=r.name,loss_comment=left(p_comment,3000),closed_at=CASE WHEN p_closed_on IS NULL THEN now() ELSE (p_closed_on+time '12:00') AT TIME ZONE 'Europe/Moscow' END WHERE id=d.id;
 RETURN d.id;
END $$;
CREATE FUNCTION public.crm_close_won(p_deal uuid,p_property uuid,p_start date,p_end date,p_rent numeric,p_deposit numeric,p_day int,p_source text,p_income_type text,p_income_value numeric,p_create_booking boolean DEFAULT true,p_actor uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.deals; prop public.properties; s uuid; b uuid; fee numeric; previous_kind text;
BEGIN
 PERFORM public.crm_check_actor(p_actor); SELECT * INTO d FROM public.deals WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR d.pipeline<>'rental' THEN RAISE EXCEPTION 'Сделка аренды не найдена'; END IF;
 SELECT kind INTO previous_kind FROM public.deal_stages WHERE id=d.stage_id;
 -- Lock the property so two concurrent CRM closings cannot allocate the same dates.
 SELECT * INTO prop FROM public.properties WHERE id=p_property AND portfolio='rm' AND status<>'archived' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Выберите действующий объект РМ'; END IF;
 IF d.client_id IS NULL THEN RAISE EXCEPTION 'Выберите клиента'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_rent IS NULL OR p_rent<=0 OR p_deposit IS NULL OR p_deposit<0 OR p_day IS NULL OR p_day NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Проверьте сроки, стоимость, депозит и день оплаты'; END IF;
 IF p_income_type IS NULL OR p_income_type NOT IN ('percent','amount') OR p_income_value IS NULL OR p_income_value<0 OR (p_income_type='percent' AND p_income_value>100) THEN RAISE EXCEPTION 'Укажите доход компании'; END IF;
 fee:=round(CASE WHEN p_income_type='percent' THEN p_rent*p_income_value/100 ELSE p_income_value END,2);
 IF fee>p_rent THEN RAISE EXCEPTION 'Доход компании больше аренды'; END IF;
 IF length(trim(p_source))=0 THEN RAISE EXCEPTION 'Укажите площадку сделки'; END IF;
 IF previous_kind='won' THEN
  IF d.closed_property_id=p_property AND d.start_date=p_start AND d.end_date=p_end AND d.price_month=p_rent AND d.deposit=p_deposit AND d.payment_day=p_day AND d.closing_source=p_source AND d.income_type=p_income_type AND d.income_value=p_income_value AND (d.booking_id IS NOT NULL)=p_create_booking THEN RETURN d.booking_id; END IF;
  RAISE EXCEPTION 'Сделка уже закрыта; изменяйте существующую бронь';
 END IF;
 b:=d.booking_id;
 IF b IS NOT NULL THEN RAISE EXCEPTION 'У сделки уже есть бронь. Проверьте её перед повторным закрытием'; END IF;
 IF p_create_booking THEN
  IF EXISTS(SELECT 1 FROM public.bookings WHERE property_id=p_property AND status<>'cancelled' AND start_date<=p_end AND end_date>=p_start) THEN RAISE EXCEPTION 'Объект уже забронирован на выбранные даты'; END IF;
  INSERT INTO public.bookings(property_id,client_id,start_date,end_date,price_type,price_month,payment_day,deposit,source,status,comment,stay_kind)
   VALUES(p_property,d.client_id,p_start,p_end,'fixed',p_rent,p_day,p_deposit,CASE lower(p_source) WHEN 'авито' THEN 'avito'::public.booking_source WHEN 'циан' THEN 'cian'::public.booking_source WHEN 'сайт' THEN 'website'::public.booking_source WHEN 'сайт рм' THEN 'website'::public.booking_source WHEN 'рекомендация' THEN 'referral'::public.booking_source WHEN 'telegram' THEN 'social'::public.booking_source WHEN 'whatsapp' THEN 'social'::public.booking_source ELSE NULL END,'active','Сделка CRM: '||d.title||'. Источник: '||p_source,'long_term') RETURNING id INTO b;
 END IF;
 SELECT id INTO s FROM public.deal_stages WHERE pipeline='rental' AND kind='won' ORDER BY position LIMIT 1;
 IF s IS NULL THEN RAISE EXCEPTION 'Нет этапа успешного закрытия'; END IF;
 UPDATE public.deals SET stage_id=s,property_id=p_property,closed_property_id=p_property,start_date=p_start,end_date=p_end,price_month=p_rent,deposit=p_deposit,payment_day=p_day,closing_source=trim(p_source),income_type=p_income_type,income_value=p_income_value,income_month=fee,booking_id=b,closed_at=now() WHERE id=d.id;
 UPDATE public.properties SET management_fee_type=p_income_type::public.management_fee_type,management_fee_value=p_income_value,status=CASE WHEN p_start<=(now() AT TIME ZONE 'Europe/Moscow')::date THEN 'rented'::public.property_status WHEN EXISTS(SELECT 1 FROM public.bookings WHERE property_id=prop.id AND status='active' AND start_date<=(now() AT TIME ZONE 'Europe/Moscow')::date AND end_date>(now() AT TIME ZONE 'Europe/Moscow')::date) THEN 'rented'::public.property_status ELSE 'booked'::public.property_status END WHERE id=prop.id;
 RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.crm_check_actor(uuid),public.crm_close_lost(uuid,uuid,text,date,uuid),public.crm_close_won(uuid,uuid,date,date,numeric,numeric,int,text,text,numeric,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_check_actor(uuid),public.crm_close_lost(uuid,uuid,text,date,uuid),public.crm_close_won(uuid,uuid,date,date,numeric,numeric,int,text,text,numeric,boolean,uuid) TO authenticated,service_role;
-- Do not rewrite an established intake board. Only rename the untouched default set.
DO $$ BEGIN
 IF (SELECT count(*) FROM public.deal_stages WHERE pipeline='intake')=6 AND NOT EXISTS(SELECT 1 FROM public.deals WHERE pipeline='intake') THEN
  UPDATE public.deal_stages SET name=CASE position WHEN 0 THEN 'Новая заявка' WHEN 1 THEN 'Связались' WHEN 2 THEN 'Осмотр объекта' WHEN 3 THEN 'Согласование условий' WHEN 4 THEN 'Принят в работу' ELSE name END WHERE pipeline='intake';
  UPDATE public.deal_stages SET position=position+1 WHERE pipeline='intake' AND kind IN ('won','lost');
  INSERT INTO public.deal_stages(name,color,position,kind,pipeline) VALUES('Подготовка объекта','#64748b',4,'open','intake');
 END IF;
END $$;

CREATE TRIGGER deal_loss_reasons_log AFTER INSERT OR UPDATE ON public.deal_loss_reasons FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE FUNCTION public.crm_booking_property_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN PERFORM 1 FROM public.properties WHERE id=NEW.property_id FOR UPDATE; RETURN NEW; END $$;
CREATE TRIGGER a_crm_booking_property_lock BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.crm_booking_property_lock();
CREATE FUNCTION public.crm_accept_intake(p_deal uuid,p_property uuid DEFAULT NULL,p_actor uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.deals; x jsonb; prop uuid; s uuid;
BEGIN
 PERFORM public.crm_check_actor(p_actor);SELECT * INTO d FROM public.deals WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR d.pipeline<>'intake' THEN RAISE EXCEPTION 'Карточка нового объекта не найдена'; END IF;
 IF EXISTS(SELECT 1 FROM public.deal_stages WHERE id=d.stage_id AND kind='won') AND d.property_id IS NOT NULL THEN IF p_property IS NOT NULL AND p_property<>d.property_id THEN RAISE EXCEPTION 'Объект уже принят и связан с другой карточкой'; END IF; RETURN d.property_id; END IF;
 IF d.client_id IS NULL THEN RAISE EXCEPTION 'Укажите собственника'; END IF;
 prop:=p_property;
 IF prop IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.properties WHERE id=prop AND portfolio='rm' AND status<>'archived') THEN RAISE EXCEPTION 'Объект РМ не найден'; END IF;
 ELSE
  x:=d.custom->'intake_draft';
  IF x IS NULL OR length(trim(coalesce(x->>'address','')))=0 OR coalesce(x->>'area','')='' OR coalesce(x->>'rooms','')='' OR coalesce(x->>'price_month','')='' THEN RAISE EXCEPTION 'Заполните адрес, комнаты, площадь и месячную аренду в карточке'; END IF;
  IF (x->>'area')::numeric<=0 OR (x->>'rooms')::int<0 OR (x->>'price_month')::numeric<=0 THEN RAISE EXCEPTION 'Проверьте параметры объекта'; END IF;
  IF EXISTS(SELECT 1 FROM public.properties WHERE portfolio='rm' AND lower(regexp_replace(address,'[^а-яА-Яa-zA-Z0-9]','','g'))=lower(regexp_replace(x->>'address','[^а-яА-Яa-zA-Z0-9]','','g')) AND rooms=(x->>'rooms')::int AND area=(x->>'area')::numeric) THEN RAISE EXCEPTION 'Похожий объект уже есть: выберите существующую карточку'; END IF;
  INSERT INTO public.properties(title,internal_name,address,type,rooms,area,price_month,description,portfolio,published,for_rent,status,floor,total_floors,bathrooms,deposit,commission,service_type,complex_id)
   VALUES(d.title,d.title,x->>'address',coalesce(nullif(x->>'property_type',''),'apartment')::public.property_type,(x->>'rooms')::int,(x->>'area')::numeric,(x->>'price_month')::numeric,coalesce(x->>'description',''),'rm',false,true,'free',nullif(x->>'floor','')::int,nullif(x->>'total_floors','')::int,coalesce(nullif(x->>'bathrooms','')::int,1),nullif(x->>'deposit','')::numeric,nullif(x->>'commission','')::numeric,coalesce(nullif(x->>'service_type',''),'management')::public.property_service_type,nullif(x->>'complex_id','')::uuid) RETURNING id INTO prop;
 END IF;
 SELECT id INTO s FROM public.deal_stages WHERE pipeline='intake' AND kind='won' ORDER BY position LIMIT 1;
 IF s IS NULL THEN RAISE EXCEPTION 'Нет успешного этапа'; END IF;
 UPDATE public.deals SET stage_id=s,property_id=prop,closed_property_id=prop,closed_at=now(),closing_source=source WHERE id=d.id;
 RETURN prop;
END $$;
REVOKE ALL ON FUNCTION public.crm_accept_intake(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_accept_intake(uuid,uuid,uuid) TO authenticated,service_role;
