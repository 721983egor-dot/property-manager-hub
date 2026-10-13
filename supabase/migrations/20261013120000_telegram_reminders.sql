-- Private administrator reminders. No browser/service-anonymous access.
CREATE TABLE public.telegram_reminders (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.telegram_accounts(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  due_at timestamptz NOT NULL,
  repeat text NOT NULL CHECK (repeat IN ('once','daily','weekly','monthly')),
  anchor_day int NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
  anchor_weekday int NOT NULL CHECK (anchor_weekday BETWEEN 0 AND 6),
  anchor_hour int NOT NULL CHECK (anchor_hour BETWEEN 0 AND 23),
  anchor_minute int NOT NULL CHECK (anchor_minute BETWEEN 0 AND 59),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','notified','completed','cancelled')),
  occurrence int NOT NULL DEFAULT 1,
  lease_token uuid,
  lease_until timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_reminders_due ON public.telegram_reminders(due_at) WHERE state='pending';
ALTER TABLE public.telegram_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_reminders FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.telegram_reminders TO service_role;

-- Durable exclusive claims survive app/poller restarts; retry after a failed send.
CREATE FUNCTION public.claim_telegram_reminders() RETURNS SETOF public.telegram_reminders
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE public.telegram_reminders r SET state='pending',occurrence=CASE WHEN r.state='notified' THEN r.occurrence+1 ELSE r.occurrence END,lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes',attempts=attempts+1
  WHERE r.id IN (
    SELECT x.id FROM public.telegram_reminders x JOIN public.telegram_accounts a ON a.id=x.account_id
    WHERE (x.state='pending' OR (x.state='notified' AND x.repeat<>'once')) AND x.due_at<=now() AND (x.lease_until IS NULL OR x.lease_until<now())
      AND a.active AND a.chat_id=a.telegram_user_id
      AND EXISTS(SELECT 1 FROM public.user_roles u WHERE u.user_id=a.user_id AND u.role='admin')
    ORDER BY x.due_at LIMIT 5 FOR UPDATE OF x SKIP LOCKED
  ) RETURNING r.*
$$;
CREATE FUNCTION public.ack_telegram_reminder(p_id uuid,p_token uuid,p_success boolean,p_next timestamptz DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected int;
BEGIN
  UPDATE public.telegram_reminders SET due_at=CASE WHEN p_success AND repeat<>'once' THEN p_next ELSE due_at END,
    state=CASE WHEN p_success THEN 'notified' ELSE state END,
    delivered_at=CASE WHEN p_success THEN now() ELSE delivered_at END,
    lease_token=NULL,lease_until=CASE WHEN p_success THEN NULL ELSE now()+interval '1 minute' END,
    last_error=CASE WHEN p_success THEN NULL ELSE 'Telegram delivery failed; retry scheduled' END,updated_at=now()
  WHERE id=p_id AND lease_token=p_token AND state='pending' AND (NOT p_success OR repeat='once' OR p_next>now());
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected=1 AND p_success THEN
    INSERT INTO public.activity_log(table_name,action,source,summary,changes)
      VALUES('telegram_reminders','delivered','assistant','Напоминание доставлено',jsonb_build_object('id',p_id));
  END IF;
  RETURN affected=1;
END $$;
CREATE FUNCTION public.manage_telegram_reminder(p_id uuid,p_account uuid,p_occurrence int,p_action text,p_next timestamptz DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.telegram_reminders; affected int;
BEGIN
  IF p_action NOT IN ('done','snooze','cancel') THEN RAISE EXCEPTION 'Invalid reminder action'; END IF;
  SELECT * INTO r FROM public.telegram_reminders WHERE id=p_id AND account_id=p_account FOR UPDATE;
  IF NOT FOUND OR r.occurrence<>p_occurrence OR r.state NOT IN ('pending','notified') THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.telegram_accounts a JOIN public.user_roles u ON u.user_id=a.user_id WHERE a.id=p_account AND a.active AND a.chat_id=a.telegram_user_id AND u.role='admin') THEN RAISE EXCEPTION 'No access'; END IF;
  IF p_action='snooze' THEN p_next:=now()+interval '1 hour'; END IF;
  IF p_action='done' AND r.repeat<>'once' AND (p_next IS NULL OR p_next<=now()) THEN RAISE EXCEPTION 'Next repetition must be in the future'; END IF;
  UPDATE public.telegram_reminders SET
    state=CASE WHEN p_action='cancel' THEN 'cancelled' WHEN p_action='done' AND r.repeat='once' THEN 'completed' ELSE 'pending' END,
    due_at=CASE WHEN p_action='cancel' OR (p_action='done' AND r.repeat='once') THEN due_at ELSE p_next END,
    occurrence=occurrence+1,lease_token=NULL,lease_until=NULL,updated_at=now()
  WHERE id=p_id;
  INSERT INTO public.activity_log(table_name,action,source,summary,changes)
    VALUES('telegram_reminders',p_action,'assistant','Напоминание: '||r.title,jsonb_build_object('id',p_id,'action',p_action));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_telegram_reminders() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ack_telegram_reminder(uuid,uuid,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.manage_telegram_reminder(uuid,uuid,int,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telegram_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_telegram_reminder(uuid,uuid,boolean,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.manage_telegram_reminder(uuid,uuid,int,text,timestamptz) TO service_role;
