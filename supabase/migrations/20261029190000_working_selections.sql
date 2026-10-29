-- Internal showing notes are never stored in public selections/selection_items.
CREATE TABLE IF NOT EXISTS public.working_selections (
 selection_id uuid PRIMARY KEY REFERENCES public.selections(id) ON DELETE CASCADE,
 deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
 showing_date date,
 items jsonb NOT NULL DEFAULT '[]',
 version integer NOT NULL DEFAULT 0,
 updated_by uuid REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.property_manager_notes (
 property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
 note text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 0,
 updated_by uuid REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.working_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_manager_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.working_selections,public.property_manager_notes FROM anon,authenticated;
GRANT SELECT ON public.working_selections,public.property_manager_notes TO authenticated;
GRANT ALL ON public.working_selections,public.property_manager_notes TO service_role;
CREATE POLICY working_selections_staff_read ON public.working_selections FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('admin','manager')));
CREATE POLICY manager_notes_staff_read ON public.property_manager_notes FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('admin','manager')));
CREATE OR REPLACE FUNCTION public.save_working_selection(p_id uuid,p_expected integer,p_data jsonb,p_actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v integer; old_state jsonb; created boolean:=false; item jsonb; ids uuid[]; code_value text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_actor AND role::text IN ('admin','manager')) THEN RAISE EXCEPTION 'Только сотрудники'; END IF;
 IF jsonb_typeof(p_data->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'items') NOT BETWEEN 1 AND 100 OR length(p_data->>'name') NOT BETWEEN 1 AND 160 OR octet_length(p_data::text)>1000000 THEN RAISE EXCEPTION 'Проверьте подборку'; END IF;
 SELECT array_agg((x->>'propertyId')::uuid) INTO ids FROM jsonb_array_elements(p_data->'items') x;
 IF (SELECT count(DISTINCT id) FROM unnest(ids) id)<>array_length(ids,1) OR EXISTS(SELECT 1 FROM unnest(ids) id WHERE NOT EXISTS(SELECT 1 FROM properties p WHERE p.id=id AND p.portfolio::text='rm')) THEN RAISE EXCEPTION 'Проверьте объекты подборки'; END IF;
 IF nullif(p_data->>'dealId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM deals WHERE id=(p_data->>'dealId')::uuid AND pipeline='rental') THEN RAISE EXCEPTION 'Сделка не найдена'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_data->'items') LOOP
  IF item->>'outcome' IS NULL OR item->>'outcome' NOT IN ('pending','shown','liked','thinking','rejected') OR length(coalesce(item->>'note',''))>3000 OR length(coalesce(item->>'feedback',''))>3000 THEN RAISE EXCEPTION 'Проверьте результаты показа'; END IF;
 END LOOP;
 -- Serializes both first-time creation and concurrent legacy conversion.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT to_jsonb(w),w.version INTO old_state,v FROM working_selections w WHERE selection_id=p_id FOR UPDATE;
 IF coalesce(v,0)<>p_expected THEN RAISE EXCEPTION 'Подборка уже изменена коллегой. Обновите страницу и повторите'; END IF;
 IF NOT EXISTS(SELECT 1 FROM selections WHERE id=p_id) THEN
  IF p_expected<>0 THEN RAISE EXCEPTION 'Подборка удалена'; END IF;
  code_value:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  INSERT INTO selections(id,code,name,comment,saved) VALUES(p_id,code_value,p_data->>'name',coalesce(p_data->>'publicComment',''),true);
  created:=true;
 ELSE
  UPDATE selections SET name=p_data->>'name',comment=coalesce(p_data->>'publicComment',''),saved=true,updated_at=now() WHERE id=p_id;
 END IF;
 INSERT INTO working_selections(selection_id,deal_id,showing_date,items,version,updated_by)
 VALUES(p_id,nullif(p_data->>'dealId','')::uuid,nullif(p_data->>'showingDate','')::date,p_data->'items',p_expected+1,p_actor)
 ON CONFLICT(selection_id) DO UPDATE SET deal_id=excluded.deal_id,showing_date=excluded.showing_date,items=excluded.items,version=excluded.version,updated_by=p_actor,updated_at=now();
 DELETE FROM selection_items WHERE selection_id=p_id;
 INSERT INTO selection_items(selection_id,property_id,position) SELECT p_id,(x->>'propertyId')::uuid,(n-1)::integer FROM jsonb_array_elements(p_data->'items') WITH ORDINALITY t(x,n);
 INSERT INTO activity_log(table_name,record_id,actor_id,action,summary,changes) VALUES('working_selections',p_id,p_actor,CASE WHEN created THEN 'INSERT' ELSE 'UPDATE' END,'Рабочая подборка: '||(p_data->>'name'),jsonb_build_object('before',old_state,'after',p_data,'version',p_expected+1));
 RETURN p_expected+1;
END $$;
REVOKE ALL ON FUNCTION public.save_working_selection(uuid,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_working_selection(uuid,integer,jsonb,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.save_property_manager_note(p_property uuid,p_expected integer,p_note text,p_actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v integer; old_note text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_actor AND role::text IN ('admin','manager')) THEN RAISE EXCEPTION 'Только сотрудники'; END IF;
 IF length(p_note)>5000 OR NOT EXISTS(SELECT 1 FROM properties WHERE id=p_property AND portfolio::text='rm') THEN RAISE EXCEPTION 'Проверьте объект и информацию'; END IF;
 INSERT INTO property_manager_notes(property_id) VALUES(p_property) ON CONFLICT DO NOTHING;
 SELECT version,note INTO v,old_note FROM property_manager_notes WHERE property_id=p_property FOR UPDATE;
 IF v<>p_expected THEN RAISE EXCEPTION 'Информация уже изменена. Обновите страницу'; END IF;
 UPDATE property_manager_notes SET note=p_note,version=v+1,updated_by=p_actor,updated_at=now() WHERE property_id=p_property;
 INSERT INTO activity_log(table_name,record_id,actor_id,action,summary,changes) VALUES('property_manager_notes',p_property,p_actor,'UPDATE','Информация для менеджеров',jsonb_build_object('before',old_note,'after',p_note));
 RETURN v+1;
END $$;
REVOKE ALL ON FUNCTION public.save_property_manager_note(uuid,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_property_manager_note(uuid,integer,text,uuid) TO service_role;
-- All existing UI and Assistant creation goes through checked server functions.
REVOKE INSERT,UPDATE,DELETE ON public.selections,public.selection_items FROM anon,authenticated;
NOTIFY pgrst,'reload schema';
