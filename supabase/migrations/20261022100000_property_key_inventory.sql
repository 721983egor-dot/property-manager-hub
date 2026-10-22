-- Additive only: no existing objects, rentals or financial records are changed.
CREATE TABLE IF NOT EXISTS public.property_key_inventories (
 property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
 version integer NOT NULL DEFAULT 0,
 inventory jsonb NOT NULL DEFAULT '{"required":[],"bundles":[],"transfers":[],"history":[]}',
 updated_by uuid REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.property_key_inventories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_key_inventories FROM anon,authenticated;
GRANT SELECT ON public.property_key_inventories TO authenticated;
GRANT ALL ON public.property_key_inventories TO service_role;
CREATE POLICY property_keys_staff_read ON public.property_key_inventories FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role::text IN ('admin','manager')));
CREATE OR REPLACE FUNCTION public.save_property_key_inventory(p_property uuid,p_expected integer,p_inventory jsonb,p_actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role::text IN ('admin','manager')) THEN RAISE EXCEPTION 'Только сотрудники'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.properties WHERE id=p_property AND portfolio::text='rm') THEN RAISE EXCEPTION 'Объект РМ не найден'; END IF;
 IF jsonb_typeof(p_inventory->'bundles') IS DISTINCT FROM 'array' OR jsonb_typeof(p_inventory->'required') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_inventory->'history') IS DISTINCT FROM 'array' OR jsonb_typeof(p_inventory->'transfers') IS DISTINCT FROM 'array'
 OR octet_length(p_inventory::text)>1000000 THEN RAISE EXCEPTION 'Проверьте состав ключей'; END IF;
 INSERT INTO public.property_key_inventories(property_id) VALUES(p_property) ON CONFLICT DO NOTHING;
 SELECT version INTO v FROM public.property_key_inventories WHERE property_id=p_property FOR UPDATE;
 IF v<>p_expected THEN RAISE EXCEPTION 'Состав уже изменился. Обновите страницу и повторите действие'; END IF;
 UPDATE public.property_key_inventories SET version=v+1,inventory=p_inventory,updated_by=p_actor,updated_at=now() WHERE property_id=p_property;
 INSERT INTO public.activity_log(table_name,record_id,actor_id,action,summary,changes)
 VALUES('property_key_inventories',p_property,p_actor,'UPDATE','Изменение учёта ключей',jsonb_build_object('actor_id',p_actor,'version',v+1,'event',p_inventory->'history'->-1));
 RETURN v+1;
END $$;
REVOKE ALL ON FUNCTION public.save_property_key_inventory(uuid,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_property_key_inventory(uuid,integer,jsonb,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
