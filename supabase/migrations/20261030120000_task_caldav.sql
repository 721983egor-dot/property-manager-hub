-- Dedicated, revocable calendar credentials. No Apple ID or RM OS login password stored.
CREATE TABLE public.task_calendar_accounts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 password_hash text NOT NULL CHECK(password_hash ~ '^[a-f0-9]{64}$'),
 scope text NOT NULL DEFAULT 'mine' CHECK(scope IN ('mine','all')),
 enabled boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.task_calendar_links (
 user_id uuid NOT NULL REFERENCES public.task_calendar_accounts(user_id) ON DELETE CASCADE,
 task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
 resource text NOT NULL CHECK(resource ~ '^[A-Za-z0-9._-]{1,180}\.ics$'),
 uid text NOT NULL CHECK(length(uid) BETWEEN 1 AND 255),
 PRIMARY KEY(user_id,task_id), UNIQUE(user_id,resource), UNIQUE(user_id,uid)
);
ALTER TABLE public.task_calendar_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_calendar_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_calendar_accounts,public.task_calendar_links FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.task_calendar_accounts,public.task_calendar_links TO service_role;

CREATE FUNCTION public.task_calendar_configure(p_actor uuid,p_action text,p_hash text DEFAULT NULL,p_scope text DEFAULT 'mine')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(p_actor,'admin') THEN RAISE EXCEPTION 'Только администратор'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,3010));
 IF p_action='enable' THEN
  INSERT INTO task_calendar_accounts(user_id,password_hash,scope) VALUES(p_actor,p_hash,p_scope)
   ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,scope=excluded.scope,enabled=true,version=task_calendar_accounts.version+1,updated_at=now();
 ELSIF p_action='disable' THEN
  UPDATE task_calendar_accounts SET enabled=false,version=version+1,updated_at=now() WHERE user_id=p_actor;
 ELSE RAISE EXCEPTION 'Неизвестное действие'; END IF;
 INSERT INTO activity_log(table_name,actor_id,action,source,summary,changes)
  VALUES('task_calendar_accounts',p_actor,p_action,'apple_calendar',CASE WHEN p_action='enable' THEN 'Подключён календарь задач Apple' ELSE 'Доступ календаря Apple отключён' END,jsonb_build_object('scope',p_scope));
 RETURN jsonb_build_object('enabled',p_action='enable');
END $$;

-- The expected timestamp and credential version are checked under row locks. Changes + audit are atomic.
CREATE FUNCTION public.task_calendar_write(p_actor uuid,p_version integer,p_task uuid,p_expected timestamptz,p_resource text,p_uid text,p_edit jsonb,p_remove boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE account task_calendar_accounts%ROWTYPE; old tasks%ROWTYPE; result uuid; task_title text; task_desc text; task_date date; task_start text; task_end text;
BEGIN
 SELECT * INTO account FROM task_calendar_accounts WHERE user_id=p_actor FOR UPDATE;
 IF NOT FOUND OR NOT account.enabled OR account.version<>p_version OR NOT public.has_role(p_actor,'admin') THEN RAISE EXCEPTION 'Доступ календаря отозван'; END IF;
 IF p_task IS NOT NULL THEN
  SELECT * INTO old FROM tasks WHERE id=p_task FOR UPDATE;
  IF NOT FOUND OR old.status<>'open' OR old.due_date IS NULL OR (account.scope='mine' AND old.assignee_id IS DISTINCT FROM p_actor) THEN RAISE EXCEPTION 'Задача недоступна'; END IF;
  IF p_expected IS DISTINCT FROM old.updated_at THEN RAISE EXCEPTION 'calendar_conflict'; END IF;
  IF p_remove THEN
   UPDATE tasks SET due_date=NULL,due_start='',due_end='' WHERE id=p_task;
   result:=p_task;
  END IF;
 ELSIF p_remove THEN RAISE EXCEPTION 'Задача недоступна'; END IF;
 IF NOT p_remove THEN
  task_title:=btrim(p_edit->>'title');task_desc:=coalesce(p_edit->>'description','');
  task_date:=(p_edit->>'date')::date;task_start:=coalesce(p_edit->>'start','');task_end:=coalesce(p_edit->>'end','');
  IF task_title IS NULL OR length(task_title) NOT BETWEEN 1 AND 500 OR length(task_desc)>10000 OR task_date IS NULL OR
   NOT ((task_start='' AND task_end='') OR (task_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND task_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND task_end>task_start)) THEN RAISE EXCEPTION 'Проверьте срок и название'; END IF;
  IF p_task IS NULL THEN
   -- Link constraints also make retries/duplicate UIDs atomic, without orphan tasks.
   INSERT INTO tasks(title,description,due_date,due_start,due_end,assignee_id,created_by)
    VALUES(task_title,task_desc,task_date,task_start,task_end,p_actor,p_actor) RETURNING id INTO result;
   INSERT INTO task_calendar_links(user_id,task_id,resource,uid) VALUES(p_actor,result,p_resource,p_uid);
  ELSE
   UPDATE tasks SET title=task_title,description=task_desc,due_date=task_date,due_start=task_start,due_end=task_end WHERE id=p_task;
   result:=p_task;
  END IF;
 END IF;
 INSERT INTO activity_log(table_name,actor_id,action,source,summary,changes)
  VALUES('tasks',p_actor,CASE WHEN p_remove THEN 'calendar_unschedule' WHEN p_task IS NULL THEN 'calendar_create' ELSE 'calendar_update' END,'apple_calendar',
  CASE WHEN p_remove THEN 'Срок задачи убран через Apple Календарь' ELSE 'Задача сохранена через Apple Календарь' END,jsonb_build_object('task_id',result,'before',CASE WHEN p_task IS NOT NULL THEN to_jsonb(old) ELSE NULL END,'edit',p_edit));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.task_calendar_configure(uuid,text,text,text),public.task_calendar_write(uuid,integer,uuid,timestamptz,text,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.task_calendar_configure(uuid,text,text,text),public.task_calendar_write(uuid,integer,uuid,timestamptz,text,text,jsonb,boolean) TO service_role;
