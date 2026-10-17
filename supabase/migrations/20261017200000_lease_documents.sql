-- Sensitive payloads are encrypted by the server; no passport fields enter clients/custom/logs.
CREATE TABLE public.lease_identities(client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE RESTRICT,cipher text NOT NULL,last_four text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.lease_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,body text NOT NULL,pets_clause text NOT NULL DEFAULT '',act_body text NOT NULL DEFAULT '',inventory_body text NOT NULL DEFAULT '',approved boolean NOT NULL DEFAULT false,revision int NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.lease_drafts(booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,cipher text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.lease_company_profile(id int PRIMARY KEY CHECK(id=1),cipher text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.lease_passport_drafts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,chat_id bigint,source_key text NOT NULL,cipher text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.lease_documents(id uuid PRIMARY KEY,request_key uuid UNIQUE NOT NULL,booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,version int NOT NULL,template_id uuid NOT NULL REFERENCES public.lease_templates(id),template_revision int NOT NULL,payload_hash text NOT NULL,snapshot_cipher text NOT NULL,status text NOT NULL CHECK(status IN('building','draft','prepared','signed','failed')),files jsonb NOT NULL DEFAULT '{}',created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(booking_id,version));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['lease_identities','lease_templates','lease_drafts','lease_company_profile','lease_passport_drafts','lease_documents'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);EXECUTE format('GRANT ALL ON public.%I TO service_role',t);END LOOP;END $$;
INSERT INTO storage.buckets(id,name,public) VALUES('lease-private','lease-private',false) ON CONFLICT(id) DO UPDATE SET public=false;
-- No storage policies for anonymous/authenticated. Downloads go through the administrator API.
CREATE FUNCTION public.lease_begin_document(p_id uuid,p_request uuid,p_booking uuid,p_deal uuid,p_template uuid,p_revision int,p_hash text,p_snapshot text,p_booking_updated timestamptz,p_identities jsonb,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; d public.lease_documents; v int; x jsonb; stage uuid; candidates uuid[];
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 SELECT * INTO b FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF NOT FOUND OR b.status='cancelled' OR b.stay_kind<>'long_term' THEN RAISE EXCEPTION 'Выберите действующую долгосрочную бронь'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.properties WHERE id=b.property_id AND portfolio='rm') THEN RAISE EXCEPTION 'Объект РМ ОС не найден'; END IF;
 SELECT * INTO d FROM public.lease_documents WHERE request_key=p_request FOR UPDATE;
 IF FOUND THEN
  IF d.created_by<>p_actor OR d.booking_id<>b.id OR d.payload_hash<>p_hash THEN RAISE EXCEPTION 'Запрос уже использован для другого документа'; END IF;
  IF d.status IN('draft','prepared','signed') THEN RETURN jsonb_build_object('id',d.id,'existing',true,'version',d.version); END IF;
  IF d.status='building' AND d.created_at>now()-interval '10 minutes' THEN RAISE EXCEPTION 'Документ уже формируется'; END IF;
  UPDATE public.lease_documents SET status='building',created_at=now() WHERE id=d.id;
  RETURN jsonb_build_object('id',d.id,'existing',false,'version',d.version);
 END IF;
 IF b.updated_at IS DISTINCT FROM p_booking_updated THEN RAISE EXCEPTION 'Условия брони изменились. Обновите форму'; END IF;
 PERFORM 1 FROM public.lease_templates WHERE id=p_template AND revision=p_revision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Шаблон изменился. Обновите форму'; END IF;
 IF p_deal IS NULL THEN
  SELECT id INTO p_deal FROM public.deals WHERE booking_id=b.id;
  IF p_deal IS NULL THEN
   SELECT array_agg(other.id) INTO candidates FROM public.deals other JOIN public.deal_stages s ON s.id=other.stage_id
    WHERE other.pipeline='rental' AND other.client_id=b.client_id AND coalesce(other.closed_property_id,other.property_id)=b.property_id AND s.kind='open';
   IF coalesce(array_length(candidates,1),0)>1 THEN RAISE EXCEPTION 'Найдено несколько сделок: откройте подготовку договора из нужной сделки'; END IF;
   p_deal:=candidates[1];
   IF p_deal IS NULL THEN
    SELECT id INTO stage FROM public.deal_stages WHERE pipeline='rental' AND kind='open' ORDER BY position LIMIT 1;
    IF stage IS NULL THEN RAISE EXCEPTION 'Настройте первый этап воронки арендаторов'; END IF;
    INSERT INTO public.deals(title,pipeline,stage_id,client_id,property_id,booking_id) SELECT 'Аренда · '||coalesce(nullif(internal_name,''),title),'rental',stage,b.client_id,b.property_id,b.id FROM public.properties WHERE id=b.property_id RETURNING id INTO p_deal;
   END IF;
  END IF;
 END IF;
 IF p_deal IS NOT NULL THEN
  PERFORM 1 FROM public.deals WHERE id=p_deal AND pipeline='rental' AND client_id=b.client_id AND coalesce(closed_property_id,property_id)=b.property_id AND (booking_id IS NULL OR booking_id=b.id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Сделка не соответствует клиенту, объекту или брони'; END IF;
  UPDATE public.deals SET booking_id=b.id WHERE id=p_deal;
 END IF;
 SELECT coalesce(max(version),0)+1 INTO v FROM public.lease_documents WHERE booking_id=b.id;
 INSERT INTO public.lease_documents(id,request_key,booking_id,deal_id,property_id,client_id,version,template_id,template_revision,payload_hash,snapshot_cipher,status,created_by) VALUES(p_id,p_request,b.id,p_deal,b.property_id,b.client_id,v,p_template,p_revision,p_hash,p_snapshot,'building',p_actor);
 FOR x IN SELECT value FROM jsonb_array_elements(p_identities) LOOP
  INSERT INTO public.lease_identities(client_id,cipher,last_four) VALUES((x->>'client_id')::uuid,x->>'cipher',x->>'last_four') ON CONFLICT(client_id) DO UPDATE SET cipher=EXCLUDED.cipher,last_four=EXCLUDED.last_four,updated_at=now();
 END LOOP;
 INSERT INTO public.activity_log(table_name,record_id,action,summary,changes) VALUES('lease_documents',p_id,'INSERT','Подготовка договора, версия '||v,jsonb_build_object('booking_id',b.id,'actor_id',p_actor));
 RETURN jsonb_build_object('id',p_id,'existing',false,'version',v);
END $$;
REVOKE ALL ON FUNCTION public.lease_begin_document(uuid,uuid,uuid,uuid,uuid,int,text,text,timestamptz,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lease_begin_document(uuid,uuid,uuid,uuid,uuid,int,text,text,timestamptz,jsonb,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
INSERT INTO public.lease_templates(id,name,body,pets_clause,act_body,inventory_body) VALUES('b0000000-1111-4111-8111-111111111111','Долгосрочная аренда · настройте свой текст',$body$ДОГОВОР АРЕНДЫ № {{number}}
Дата: {{date}}
ПРОЕКТ ШАБЛОНА. Вставьте ваш согласованный текст перед использованием.
Сторона, предоставляющая помещение: {{landlord}}
Арендатор: {{tenant_passport}}
Объект: {{address}} ({{property}}).
Срок: {{start}} — {{end}}.
Аренда: {{rent}}.
Обеспечительный платёж: {{deposit}}.
День оплаты: {{payment_day}}.
Проживающие: {{residents}}.
{{pets}}
{{extra}}
Подписи: __________________ / __________________$body$,'Разрешённые животные: {{pet_kind}}, количество: {{pet_count}}. [Вставьте согласованные условия содержания, уборки и ответственности.]','АКТ ПРИЁМА-ПЕРЕДАЧИ к договору {{number}}
Объект: {{address}}
Стороны: {{landlord}} / {{tenant_name}}
Дата передачи: __________
Состояние, счётчики и ключи: __________________
Подписи: __________________ / __________________','ОПИСЬ ИМУЩЕСТВА к договору {{number}}
Объект: {{address}}
{{inventory}}
Подписи: __________________ / __________________');
CREATE TABLE public.lease_proposals(id uuid PRIMARY KEY,actor_id uuid NOT NULL,cipher text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours');
ALTER TABLE public.lease_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lease_proposals FROM anon,authenticated;
GRANT ALL ON public.lease_proposals TO service_role;

CREATE POLICY lease_private_not_direct ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated USING(bucket_id<>'lease-private') WITH CHECK(bucket_id<>'lease-private');
