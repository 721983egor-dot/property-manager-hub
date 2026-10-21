CREATE TABLE public.finance_payment_series (
 id uuid PRIMARY KEY,
 first_payment_id uuid NOT NULL,
 creation_payload jsonb NOT NULL,
 template jsonb NOT NULL,
 anchor_date date NOT NULL,
 anchor_index integer NOT NULL DEFAULT 0,
 interval_kind text NOT NULL CHECK(interval_kind IN ('month','week')),
 payment_day integer CHECK(payment_day BETWEEN 1 AND 31),
 end_mode text NOT NULL CHECK(end_mode IN ('count','until','unlimited')),
 operation_count integer CHECK(operation_count BETWEEN 1 AND 36),
 until_date date,
 next_index integer NOT NULL DEFAULT 0,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_payment_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_series_admin_read ON public.finance_payment_series FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.finance_payment_series TO authenticated;
GRANT ALL ON public.finance_payment_series TO service_role;
CREATE TRIGGER log_finance_payment_series AFTER INSERT OR UPDATE ON public.finance_payment_series FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER finance_payment_series_updated BEFORE UPDATE ON public.finance_payment_series FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.payments ADD COLUMN recurring_series_id uuid REFERENCES public.finance_payment_series(id) ON DELETE RESTRICT,
 ADD COLUMN recurring_index integer CHECK(recurring_index>=0);
CREATE UNIQUE INDEX finance_payment_series_occurrence ON public.payments(recurring_series_id,recurring_index) WHERE recurring_series_id IS NOT NULL;

CREATE FUNCTION public.finance_series_date(s public.finance_payment_series,i integer) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE m date;
BEGIN
 IF i=s.anchor_index THEN RETURN s.anchor_date; END IF;
 IF s.interval_kind='week' THEN RETURN s.anchor_date+(i-s.anchor_index)*7; END IF;
 m:=(date_trunc('month',s.anchor_date)+make_interval(months=>i-s.anchor_index))::date;
 RETURN m+least(coalesce(s.payment_day,extract(day FROM s.anchor_date)::integer),extract(day FROM(m+interval '1 month - 1 day'))::integer)-1;
END $$;
REVOKE ALL ON FUNCTION public.finance_series_date(public.finance_payment_series,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finance_series_validate(p jsonb,r jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a numeric; d date; k text; day integer; c integer;
BEGIN
 a:=(p->>'amount')::numeric; d:=(p->>'planned_date')::date; k:=r->>'interval';
 IF a IS NULL OR a<=0 OR a::text IN ('NaN','Infinity','-Infinity') OR d IS NULL OR d<'2000-01-01' OR d>'2200-01-01' OR k IS NULL OR k NOT IN ('month','week') THEN RAISE EXCEPTION 'Проверьте сумму, дату и период серии'; END IF;
 IF coalesce(p->>'direction','') NOT IN ('in','out') OR coalesce(p->>'status','') NOT IN ('expected','partial','paid','overdue') THEN RAISE EXCEPTION 'Проверьте тип и статус операции'; END IF;
 IF nullif(p->>'booking_id','') IS NOT NULL OR nullif(p->>'rental_component','') IS NOT NULL OR nullif(p->>'obligation_id','') IS NOT NULL OR nullif(p->>'deal_id','') IS NOT NULL THEN RAISE EXCEPTION 'Для связанной аренды и выплат используйте график брони'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_accounts WHERE name=p->>'account' AND NOT archived) THEN RAISE EXCEPTION 'Выберите действующий счёт'; END IF;
 IF nullif(p->>'article_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_articles WHERE id=(p->>'article_id')::uuid AND direction::text=p->>'direction') THEN RAISE EXCEPTION 'Выберите статью для этого типа операции'; END IF;
 IF r->>'paymentDay' IS NOT NULL THEN
  day:=(r->>'paymentDay')::integer;
  IF k<>'month' OR day<1 OR day>31 OR (r->>'paymentDay')::numeric<>day THEN RAISE EXCEPTION 'День оплаты — целое число от 1 до 31'; END IF;
 END IF;
 IF coalesce((r->>'unlimited')::boolean,false) AND (r->>'count' IS NOT NULL OR r->>'untilDate' IS NOT NULL) THEN RAISE EXCEPTION 'Для серии без срока не указывайте дату окончания или количество'; END IF;
 IF r->>'count' IS NOT NULL THEN
  c:=(r->>'count')::integer;
  IF c<1 OR c>36 OR (r->>'count')::numeric<>c THEN RAISE EXCEPTION 'Укажите от 1 до 36 операций'; END IF;
 END IF;
 IF r->>'untilDate' IS NOT NULL AND ((r->>'untilDate')::date<d OR (r->>'untilDate')::date>'2200-12-31') THEN RAISE EXCEPTION 'Проверьте дату окончания серии'; END IF;
 IF coalesce((p->>'paid_amount')::numeric,0)<0 OR coalesce((p->>'paid_amount')::numeric,0)>a THEN RAISE EXCEPTION 'Проверьте уже оплаченную сумму'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.finance_series_validate(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finance_extend_payment_series(p_id uuid DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.finance_payment_series; i integer; d date; horizon date; p jsonb; n integer:=0; isfirst boolean; inserted integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('rm.payment-series',0));
 -- Service-only maintenance entry point; public RPCs below check the administrator first.
 FOR s IN SELECT * FROM public.finance_payment_series WHERE p_id IS NULL OR id=p_id ORDER BY id FOR UPDATE LOOP
  horizon:=(date_trunc('month',greatest((now() AT TIME ZONE 'Europe/Moscow')::date,s.anchor_date))+interval '25 months - 1 day')::date;
  i:=s.next_index; p:=s.template;
  FOR batch IN 1..4096 LOOP
   IF s.end_mode IN ('count','until') AND i>=s.operation_count THEN EXIT; END IF;
   d:=public.finance_series_date(s,i);
   IF s.end_mode='until' AND d>s.until_date THEN EXIT; END IF;
   IF s.end_mode='unlimited' AND d>horizon THEN EXIT; END IF;
   isfirst:=i=0;
   INSERT INTO public.payments(id,recurring_series_id,recurring_index,planned_date,amount,direction,status,kind,article_id,property_id,client_id,counterparty_id,counterparty_name,account,comment,paid_at,paid_amount,accrual_date,expense_bearer,expense_owner_id)
   VALUES(CASE WHEN isfirst THEN s.first_payment_id ELSE gen_random_uuid() END,s.id,i,d,(p->>'amount')::numeric,(p->>'direction')::public.payment_direction,
    CASE WHEN isfirst THEN (p->>'status')::public.payment_status ELSE 'expected'::public.payment_status END,(p->>'kind')::public.payment_kind,nullif(p->>'article_id','')::uuid,nullif(p->>'property_id','')::uuid,nullif(p->>'client_id','')::uuid,nullif(p->>'counterparty_id','')::uuid,coalesce(p->>'counterparty_name',''),p->>'account',coalesce(p->>'comment',''),
    CASE WHEN isfirst THEN coalesce(nullif(p->>'paid_at','')::date,CASE WHEN p->>'status'='paid' THEN d END) END,
    CASE WHEN isfirst THEN coalesce((p->>'paid_amount')::numeric,CASE WHEN p->>'status'='paid' THEN (p->>'amount')::numeric END) END,
    CASE WHEN nullif(p->>'accrual_date','') IS NOT NULL THEN CASE WHEN s.interval_kind='week' THEN (p->>'accrual_date')::date+(i-s.anchor_index)*7 ELSE ((p->>'accrual_date')::date+make_interval(months=>i-s.anchor_index))::date END END,
    nullif(p->>'expense_bearer',''),nullif(p->>'expense_owner_id','')::uuid)
   ON CONFLICT(recurring_series_id,recurring_index) WHERE recurring_series_id IS NOT NULL DO NOTHING;
   GET DIAGNOSTICS inserted=ROW_COUNT; n:=n+inserted; i:=i+1;
  END LOOP;
  IF i<>s.next_index THEN UPDATE public.finance_payment_series SET next_index=i WHERE id=s.id; END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.finance_extend_payment_series(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_extend_payment_series(uuid) TO service_role;

CREATE FUNCTION public.finance_create_payment_series(p_id uuid,p_input jsonb,p_repeat jsonb,p_actor uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.finance_payment_series; mode text; firstid uuid:=gen_random_uuid();
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended('rm.payment-series',0));
 IF p_id IS NULL THEN RAISE EXCEPTION 'Откройте форму заново'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO s FROM public.finance_payment_series WHERE id=p_id FOR UPDATE;
 IF s.id IS NOT NULL THEN
  IF s.creation_payload IS DISTINCT FROM jsonb_build_object('input',p_input,'repeat',p_repeat) THEN RAISE EXCEPTION 'Серия уже сохранена с другими условиями'; END IF;
  RETURN s.first_payment_id;
 END IF;
 PERFORM public.finance_series_validate(p_input,p_repeat);
 mode:=CASE WHEN coalesce((p_repeat->>'unlimited')::boolean,false) THEN 'unlimited' WHEN p_repeat->>'untilDate' IS NOT NULL THEN 'until' ELSE 'count' END;
 INSERT INTO public.finance_payment_series(id,first_payment_id,creation_payload,template,anchor_date,interval_kind,payment_day,end_mode,operation_count,until_date)
 VALUES(p_id,firstid,jsonb_build_object('input',p_input,'repeat',p_repeat),p_input,(p_input->>'planned_date')::date,p_repeat->>'interval',CASE WHEN p_repeat->>'interval'='month' THEN coalesce((p_repeat->>'paymentDay')::integer,extract(day FROM(p_input->>'planned_date')::date)::integer) END,mode,CASE WHEN mode='count' THEN coalesce((p_repeat->>'count')::integer,1) WHEN mode='until' THEN 36 END,nullif(p_repeat->>'untilDate','')::date);
 PERFORM public.finance_extend_payment_series(p_id);
 RETURN firstid;
END $$;
REVOKE ALL ON FUNCTION public.finance_create_payment_series(uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_create_payment_series(uuid,jsonb,jsonb,uuid) TO authenticated,service_role;

CREATE FUNCTION public.finance_edit_payment_series(p_payment uuid,p_input jsonb,p_scope text,p_day integer,p_expected jsonb,p_revision integer,p_actor uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments; s public.finance_payment_series; x public.payments; d date; n integer:=0; skipped integer:=0; removed integer:=0; rewind integer; new_anchor date; r jsonb; previous_setting text; today date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended('rm.payment-series',0));
 IF p_scope IS NULL OR p_scope NOT IN ('single','following') THEN RAISE EXCEPTION 'Выберите, какую часть серии изменить'; END IF;
 -- Keep the same property-before-row order used by settlement and expense triggers.
 PERFORM 1 FROM public.properties WHERE id IN (SELECT property_id FROM public.payments WHERE recurring_series_id=(SELECT recurring_series_id FROM public.payments WHERE id=p_payment) UNION SELECT nullif(p_input->>'property_id','')::uuid) ORDER BY id FOR UPDATE;
 SELECT * INTO s FROM public.finance_payment_series WHERE id=(SELECT recurring_series_id FROM public.payments WHERE id=p_payment) FOR UPDATE;
 SELECT * INTO p FROM public.payments WHERE id=p_payment FOR UPDATE;
 IF s.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'Связанная серия не найдена'; END IF;
 IF p_revision IS DISTINCT FROM s.revision OR p_expected IS NULL OR p.updated_at IS DISTINCT FROM(p_expected->>'updated_at')::timestamptz OR p.amount IS DISTINCT FROM(p_expected->>'amount')::numeric OR p.status::text IS DISTINCT FROM p_expected->>'status' OR p.paid_amount IS DISTINCT FROM(p_expected->>'paid_amount')::numeric THEN RAISE EXCEPTION 'Серия или оплата изменились. Откройте операцию заново'; END IF;
 IF p_scope='following' AND p_input->>'direction' IS DISTINCT FROM p.direction::text THEN RAISE EXCEPTION 'Для изменения типа операции создайте новую серию'; END IF;
 r:=jsonb_build_object('interval',s.interval_kind,'paymentDay',CASE WHEN s.interval_kind='month' THEN coalesce(p_day,s.payment_day) END);
 PERFORM public.finance_series_validate(p_input,r);
 IF p_scope='following' THEN
  new_anchor:=(p_input->>'planned_date')::date;
  IF s.interval_kind='month' AND p_day IS DISTINCT FROM s.payment_day AND new_anchor=p.planned_date THEN
   new_anchor:=date_trunc('month',new_anchor)::date+least(p_day,extract(day FROM(date_trunc('month',new_anchor)+interval '1 month - 1 day'))::integer)-1;
  END IF;
  -- New future occurrences use the selected date as an anchor; previous months keep their dates.
  UPDATE public.finance_payment_series SET template=p_input,anchor_date=new_anchor,anchor_index=p.recurring_index,payment_day=CASE WHEN interval_kind='month' THEN coalesce(p_day,payment_day) END,revision=revision+1 WHERE id=s.id RETURNING * INTO s;
 ELSE UPDATE public.finance_payment_series SET revision=revision+1 WHERE id=s.id; END IF;
 FOR x IN SELECT * FROM public.payments WHERE recurring_series_id=s.id AND (CASE WHEN p_scope='single' THEN id=p.id ELSE recurring_index>=p.recurring_index END) ORDER BY recurring_index FOR UPDATE LOOP
  IF p_scope='following' AND (x.status='paid' OR coalesce(x.paid_amount,0)>0 OR (NOT x.requires_confirmation AND x.status<>'partial' AND x.kind<>'owner_payout' AND x.planned_date<=today)) THEN skipped:=skipped+1; CONTINUE; END IF;
  d:=CASE WHEN p_scope='single' THEN(p_input->>'planned_date')::date ELSE public.finance_series_date(s,x.recurring_index) END;
  IF p_scope='following' AND s.end_mode='until' AND d>s.until_date THEN DELETE FROM public.payments WHERE id=x.id; rewind:=least(coalesce(rewind,x.recurring_index),x.recurring_index); removed:=removed+1; CONTINUE; END IF;
  UPDATE public.payments SET planned_date=d,amount=(p_input->>'amount')::numeric,direction=(p_input->>'direction')::public.payment_direction,kind=(p_input->>'kind')::public.payment_kind,article_id=nullif(p_input->>'article_id','')::uuid,
   property_id=nullif(p_input->>'property_id','')::uuid,client_id=nullif(p_input->>'client_id','')::uuid,counterparty_id=nullif(p_input->>'counterparty_id','')::uuid,counterparty_name=coalesce(p_input->>'counterparty_name',''),account=p_input->>'account',comment=coalesce(p_input->>'comment',''),expense_bearer=nullif(p_input->>'expense_bearer',''),expense_owner_id=nullif(p_input->>'expense_owner_id','')::uuid,
   status=CASE WHEN p_scope='single' THEN(p_input->>'status')::public.payment_status ELSE x.status::public.payment_status END,
   paid_amount=CASE WHEN p_scope='single' THEN (p_input->>'paid_amount')::numeric ELSE x.paid_amount END,
   paid_at=CASE WHEN p_scope='single' THEN nullif(p_input->>'paid_at','')::date ELSE x.paid_at END,
   accrual_date=CASE WHEN nullif(p_input->>'accrual_date','') IS NULL THEN NULL WHEN p_scope='single' THEN(p_input->>'accrual_date')::date WHEN s.interval_kind='week' THEN(p_input->>'accrual_date')::date+(x.recurring_index-s.anchor_index)*7 ELSE((p_input->>'accrual_date')::date+make_interval(months=>x.recurring_index-s.anchor_index))::date END
   WHERE id=x.id;
  n:=n+1;
 END LOOP;
 IF rewind IS NOT NULL THEN UPDATE public.finance_payment_series SET next_index=least(next_index,rewind) WHERE id=s.id; END IF;
 PERFORM public.finance_extend_payment_series(s.id);
 RETURN jsonb_build_object('updated',n,'removedAfterEnd',removed,'preservedActual',skipped,'seriesId',s.id);
END $$;
REVOKE ALL ON FUNCTION public.finance_edit_payment_series(uuid,jsonb,text,integer,jsonb,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_edit_payment_series(uuid,jsonb,text,integer,jsonb,integer,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';

-- Renaming/deleting a cash account must also carry the future recurring template.
CREATE FUNCTION public.finance_series_account_renamed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.finance_payment_series SET template=jsonb_set(template,'{account}',to_jsonb(NEW.name)),revision=revision+1 WHERE template->>'account'=OLD.name;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_series_account_renamed AFTER UPDATE OF name ON public.finance_accounts FOR EACH ROW WHEN(OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION public.finance_series_account_renamed();
REVOKE ALL ON FUNCTION public.finance_series_account_renamed() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.finance_account_usage(uuid) RENAME TO finance_account_usage_before_series;
CREATE FUNCTION public.finance_account_usage(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN public.finance_account_usage_before_series(p_id)||jsonb_build_object('series',(SELECT count(*) FROM public.finance_payment_series WHERE template->>'account'=(SELECT name FROM public.finance_accounts WHERE id=p_id))); END $$;
ALTER FUNCTION public.delete_finance_account(uuid,uuid) RENAME TO delete_finance_account_before_series;
CREATE FUNCTION public.delete_finance_account(p_id uuid,p_transfer_to uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source text; target text;
BEGIN
 IF NOT coalesce(auth.role()='service_role' OR public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rm.payment-series',0));
 PERFORM 1 FROM public.finance_accounts WHERE id IN(p_id,p_transfer_to) ORDER BY id FOR UPDATE;
 SELECT name INTO source FROM public.finance_accounts WHERE id=p_id;
 IF EXISTS(SELECT 1 FROM public.finance_payment_series WHERE template->>'account'=source) THEN
  SELECT name INTO target FROM public.finance_accounts WHERE id=p_transfer_to AND NOT archived AND id<>p_id;
  IF target IS NULL THEN RAISE EXCEPTION 'Выберите счёт для переноса регулярных операций'; END IF;
  UPDATE public.finance_payment_series SET template=jsonb_set(template,'{account}',to_jsonb(target)),revision=revision+1 WHERE template->>'account'=source;
 END IF;
 PERFORM public.delete_finance_account_before_series(p_id,p_transfer_to);
END $$;
REVOKE ALL ON FUNCTION public.finance_account_usage_before_series(uuid),public.delete_finance_account_before_series(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finance_account_usage(uuid),public.delete_finance_account(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_account_usage(uuid),public.delete_finance_account(uuid,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
