-- Exact confirmed actions only. The queue never evaluates a new free-form instruction at execution time.
CREATE TABLE public.assistant_scheduled_actions (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES auth.users(id), run_at timestamptz NOT NULL,
 tool_name text NOT NULL CHECK(tool_name IN ('runAssistantReport','updateProperty','setPublished','createProperty','createSelection','publishPropertyVideo','upsertClient','setLeadStatus','addDealComment','addDealShowing','upsertDeal','createBooking','updateRentalContract','cancelRentalContract','cancelBooking','closeDealWon','closeDealLost','acceptIntake','saveDealLossReason','upsertTask','postponeTask','upsertTaskItem','upsertTaskType','upsertMaintenanceServiceItem','setPropertyMaintenanceServices','createSocialPost','updateSocialPost','publishSocialPost','cancelSocialPost','createSocialStory','updateSocialStory','publishSocialStory','cancelSocialStory','createSiteArticle','updateSiteArticle','publishSiteArticle','unpublishSiteArticle','updateSocialPostHitMeta','sendChatMessage','sendCianMessage','runBnovoSync','assignHotelBookingRoom','createPayment','createCounterparty','createObligation','setBookingCashTerms','setBookingCollectionPlan')), summary text NOT NULL, input jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','cancelled','failed','needs_review')),
 version integer NOT NULL DEFAULT 1, lease_token uuid, started_at timestamptz, finished_at timestamptz,
 result text NOT NULL DEFAULT '', notification_state text NOT NULL DEFAULT 'none' CHECK(notification_state IN ('none','pending','sent','unavailable')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_scheduled_due ON public.assistant_scheduled_actions(run_at,created_at) WHERE state='pending';
ALTER TABLE public.assistant_scheduled_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_scheduled_actions FROM anon,authenticated;
GRANT SELECT ON public.assistant_scheduled_actions TO authenticated;
GRANT ALL ON public.assistant_scheduled_actions TO service_role;
CREATE POLICY scheduled_actions_own_admin ON public.assistant_scheduled_actions FOR SELECT TO authenticated
 USING(actor_id=auth.uid() AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text='admin'));
CREATE FUNCTION public.assistant_queue_audit(p_id uuid,p_actor uuid,p_action text,p_changes jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO activity_log(table_name,record_id,actor_id,action,source,summary,changes)
 VALUES('assistant_scheduled_actions',p_id,p_actor,p_action,'assistant','Отложенное поручение Ассистента',p_changes);
$$;
CREATE FUNCTION public.assistant_enqueue_action(p_id uuid,p_actor uuid,p_run_at timestamptz,p_tool text,p_summary text,p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.assistant_scheduled_actions;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_actor AND role::text='admin') THEN RAISE EXCEPTION 'Только администратор'; END IF;
 SELECT * INTO old FROM assistant_scheduled_actions WHERE id=p_id;
 IF old.id IS NOT NULL THEN
  IF old.actor_id<>p_actor OR old.run_at IS DISTINCT FROM p_run_at OR old.tool_name IS DISTINCT FROM p_tool OR old.summary IS DISTINCT FROM p_summary OR old.input IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'Параметры подтверждения изменились'; END IF;
  RETURN old.id;
 END IF;
 IF p_run_at<=now() OR p_run_at>now()+interval '5 years' OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>100000 OR length(p_summary) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'Проверьте время и параметры поручения'; END IF;
 INSERT INTO assistant_scheduled_actions(id,actor_id,run_at,tool_name,summary,input) VALUES(p_id,p_actor,p_run_at,p_tool,p_summary,p_input)
 ON CONFLICT(id) DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO old FROM assistant_scheduled_actions WHERE id=p_id;
  IF old.actor_id<>p_actor OR old.run_at IS DISTINCT FROM p_run_at OR old.tool_name IS DISTINCT FROM p_tool OR old.summary IS DISTINCT FROM p_summary OR old.input IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'Параметры подтверждения изменились'; END IF;
  RETURN p_id;
 END IF;
 PERFORM assistant_queue_audit(p_id,p_actor,'schedule',jsonb_build_object('run_at',p_run_at,'tool',p_tool,'summary',p_summary));
 RETURN p_id;
END $$;
CREATE FUNCTION public.assistant_manage_action(p_id uuid,p_actor uuid,p_version integer,p_action text,p_run_at timestamptz DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.assistant_scheduled_actions;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_actor AND role::text='admin') THEN RAISE EXCEPTION 'Только администратор'; END IF;
 SELECT * INTO r FROM assistant_scheduled_actions WHERE id=p_id AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Поручение не найдено'; END IF;
 IF r.version<>p_version OR r.state<>'pending' THEN RAISE EXCEPTION 'Поручение уже изменилось или начало выполняться. Обновите список'; END IF;
 IF p_action='cancel' THEN
  UPDATE assistant_scheduled_actions SET state='cancelled',version=version+1,finished_at=now(),updated_at=now(),result='Отменено пользователем' WHERE id=p_id;
 ELSIF p_action='reschedule' AND p_run_at>now() AND p_run_at<=now()+interval '5 years' THEN
  UPDATE assistant_scheduled_actions SET run_at=p_run_at,version=version+1,updated_at=now() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Проверьте действие и будущее время'; END IF;
 PERFORM assistant_queue_audit(p_id,p_actor,p_action,jsonb_build_object('previous_run_at',r.run_at,'run_at',p_run_at));
 RETURN p_id;
END $$;
CREATE FUNCTION public.assistant_claim_action() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.assistant_scheduled_actions;
BEGIN
 -- Serialize the worker, including across concurrent HTTP requests and duplicate cron containers.
 PERFORM pg_advisory_xact_lock(hashtext('rm-assistant-scheduled-claim'));
 FOR r IN UPDATE assistant_scheduled_actions SET state='needs_review',result='Выполнение прервалось. Проверьте результат перед новым поручением',finished_at=now(),updated_at=now(),version=version+1,notification_state='pending'
  WHERE state='running' AND started_at<now()-interval '1 hour' RETURNING * LOOP
  PERFORM assistant_queue_audit(r.id,r.actor_id,'needs_review',jsonb_build_object('reason','worker_interrupted'));
 END LOOP;
 IF EXISTS(SELECT 1 FROM assistant_scheduled_actions WHERE state='running') THEN RETURN NULL; END IF;
 SELECT * INTO r FROM assistant_scheduled_actions WHERE state='pending' AND run_at<=now() ORDER BY run_at,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE assistant_scheduled_actions SET state='running',version=version+1,started_at=now(),updated_at=now(),lease_token=gen_random_uuid() WHERE id=r.id RETURNING * INTO r;
 PERFORM assistant_queue_audit(r.id,r.actor_id,'start',jsonb_build_object('scheduled_for',r.run_at));
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.assistant_finish_action(p_id uuid,p_token uuid,p_state text,p_result text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.assistant_scheduled_actions;
BEGIN
 IF p_state NOT IN ('done','failed','needs_review') THEN RAISE EXCEPTION 'Некорректный результат'; END IF;
 UPDATE assistant_scheduled_actions SET state=p_state,result=left(p_result,8000),finished_at=now(),updated_at=now(),version=version+1,notification_state='pending'
 WHERE id=p_id AND state='running' AND lease_token=p_token RETURNING * INTO r;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM assistant_queue_audit(r.id,r.actor_id,p_state,jsonb_build_object('tool',r.tool_name,'result',left(p_result,8000)));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.assistant_queue_audit(uuid,uuid,text,jsonb),public.assistant_enqueue_action(uuid,uuid,timestamptz,text,text,jsonb),public.assistant_manage_action(uuid,uuid,integer,text,timestamptz),public.assistant_claim_action(),public.assistant_finish_action(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_enqueue_action(uuid,uuid,timestamptz,text,text,jsonb),public.assistant_manage_action(uuid,uuid,integer,text,timestamptz),public.assistant_claim_action(),public.assistant_finish_action(uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
