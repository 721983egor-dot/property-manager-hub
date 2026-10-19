-- Owner cards use the same object settings as settlement and calendar forecasts.
CREATE FUNCTION public.finance_save_counterparty(p_id uuid,p_input jsonb,p_properties uuid[] DEFAULT NULL,p_expected uuid[] DEFAULT NULL,p_actor uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid:=coalesce(p_id,gen_random_uuid()); k public.finance_counterparty_kind; c public.finance_counterparty_classes;
 current_ids uuid[]; requested uuid[]; x uuid; conflict_name text;
BEGIN
 PERFORM public.crm_check_actor(p_actor);
 IF length(btrim(coalesce(p_input->>'name','')))=0 THEN RAISE EXCEPTION 'Укажите имя контрагента'; END IF;
 IF nullif(p_input->>'classification_id','') IS NOT NULL THEN
  SELECT * INTO c FROM public.finance_counterparty_classes WHERE id=(p_input->>'classification_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Классификация не найдена'; END IF;
 END IF;
 k:=coalesce(c.legacy_kind,(p_input->>'kind')::public.finance_counterparty_kind,'other');
 IF p_id IS NULL AND c.id IS NULL AND NOT(p_input ? 'classification_id') THEN
  SELECT * INTO c FROM public.finance_counterparty_classes WHERE legacy_kind=k;
 END IF;
 -- Serialize simultaneous edits of one owner's complete object list.
 PERFORM pg_advisory_xact_lock(hashtextextended(result::text,16));
 IF p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_counterparties WHERE id=p_id) THEN RAISE EXCEPTION 'Контрагент не найден'; END IF;
 IF p_properties IS NOT NULL THEN
  IF array_position(p_properties,NULL) IS NOT NULL OR cardinality(p_properties)>500 THEN RAISE EXCEPTION 'Проверьте список объектов'; END IF;
  SELECT coalesce(array_agg(DISTINCT v ORDER BY v),'{}'::uuid[]) INTO requested FROM unnest(p_properties) v;
  -- Property locks also serialize with edits made from the object card.
  PERFORM 1 FROM public.properties WHERE id=ANY(requested) OR id IN (SELECT property_id FROM public.finance_object_settings WHERE owner_counterparty_id=result) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.finance_object_settings WHERE property_id=ANY(requested) OR owner_counterparty_id=result ORDER BY property_id FOR UPDATE;
  SELECT coalesce(array_agg(property_id ORDER BY property_id),'{}'::uuid[]) INTO current_ids FROM public.finance_object_settings WHERE owner_counterparty_id=result;
  IF p_expected IS NOT NULL AND current_ids IS DISTINCT FROM (SELECT coalesce(array_agg(DISTINCT v ORDER BY v),'{}'::uuid[]) FROM unnest(p_expected) v) THEN RAISE EXCEPTION 'Привязки изменились в другой карточке. Обновите данные и повторите'; END IF;
  IF k='owner' AND cardinality(requested)=0 THEN RAISE EXCEPTION 'Выберите хотя бы один объект собственника'; END IF;
  IF k<>'owner' AND cardinality(requested)>0 THEN RAISE EXCEPTION 'Объекты можно прикрепить только собственнику'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(requested) v WHERE NOT EXISTS(SELECT 1 FROM public.properties WHERE id=v AND portfolio='rm')) THEN RAISE EXCEPTION 'Выберите объекты Резиденции Море'; END IF;
  SELECT p.name INTO conflict_name FROM public.finance_object_settings s JOIN public.finance_counterparties p ON p.id=s.owner_counterparty_id
   WHERE s.property_id=ANY(requested) AND s.owner_counterparty_id<>result LIMIT 1;
  IF conflict_name IS NOT NULL THEN RAISE EXCEPTION 'У объекта уже есть собственник: %. Сначала измените привязку в карточке объекта',conflict_name; END IF;
 ELSIF k<>'owner' AND EXISTS(SELECT 1 FROM public.finance_object_settings WHERE owner_counterparty_id=result) THEN
  RAISE EXCEPTION 'Сначала снимите привязки объектов собственника';
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.finance_counterparties(id,name,kind,classification_id,requisites,comment,client_id)
   VALUES(result,btrim(p_input->>'name'),k,c.id,coalesce(p_input->>'requisites',''),coalesce(p_input->>'comment',''),(p_input->>'client_id')::uuid);
 ELSE
  UPDATE public.finance_counterparties SET name=btrim(p_input->>'name'),kind=k,
   classification_id=CASE WHEN p_input ? 'classification_id' THEN c.id ELSE classification_id END,
   requisites=CASE WHEN p_input ? 'requisites' THEN btrim(p_input->>'requisites') ELSE requisites END,
   comment=CASE WHEN p_input ? 'comment' THEN btrim(p_input->>'comment') ELSE comment END,
   client_id=CASE WHEN p_input ? 'client_id' THEN (p_input->>'client_id')::uuid ELSE client_id END WHERE id=result;
 END IF;
 IF p_properties IS NOT NULL THEN
  UPDATE public.finance_object_settings SET owner_counterparty_id=NULL WHERE owner_counterparty_id=result AND NOT(property_id=ANY(requested));
  INSERT INTO public.finance_object_settings(property_id,owner_counterparty_id) SELECT v,result FROM unnest(requested) v
   ON CONFLICT(property_id) DO UPDATE SET owner_counterparty_id=EXCLUDED.owner_counterparty_id
   WHERE finance_object_settings.owner_counterparty_id IS DISTINCT FROM EXCLUDED.owner_counterparty_id;
 END IF;
 -- Existing debts, payments, classification and payout dates stay attached to their original records.
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_save_counterparty(uuid,jsonb,uuid[],uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_save_counterparty(uuid,jsonb,uuid[],uuid[],uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
