CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  actor_id uuid,
  actor_email text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'app',
  summary text NOT NULL DEFAULT '',
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_created_at_idx ON public.activity_log (created_at DESC);
CREATE INDEX activity_log_record_idx ON public.activity_log (table_name, record_id);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_log_select" ON public.activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "activity_log_insert" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec_id uuid;
  diff jsonb := '{}'::jsonb;
  old_j jsonb;
  new_j jsonb;
  k text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec_id := (to_jsonb(OLD) ->> 'id')::uuid;
    diff := jsonb_build_object('old', to_jsonb(OLD));
  ELSIF TG_OP = 'INSERT' THEN
    rec_id := (to_jsonb(NEW) ->> 'id')::uuid;
    diff := jsonb_build_object('new', to_jsonb(NEW));
  ELSE
    rec_id := (to_jsonb(NEW) ->> 'id')::uuid;
    old_j := to_jsonb(OLD);
    new_j := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(new_j) LOOP
      IF k NOT IN ('updated_at') AND (old_j -> k) IS DISTINCT FROM (new_j -> k) THEN
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k));
      END IF;
    END LOOP;
    IF diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.activity_log (table_name, record_id, action, actor_id, actor_email, changes)
  VALUES (
    TG_TABLE_NAME,
    rec_id,
    lower(TG_OP),
    auth.uid(),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''),
    diff
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_properties AFTER INSERT OR UPDATE OR DELETE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_complexes AFTER INSERT OR UPDATE OR DELETE ON public.complexes FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_clients AFTER INSERT OR UPDATE OR DELETE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_bookings AFTER INSERT OR UPDATE OR DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_rentals AFTER INSERT OR UPDATE OR DELETE ON public.rentals FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_leads AFTER INSERT OR UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_property_listings AFTER INSERT OR UPDATE OR DELETE ON public.property_listings FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_selections AFTER INSERT OR UPDATE OR DELETE ON public.selections FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE TABLE public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_messages_created_at_idx ON public.assistant_messages (created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_messages TO service_role;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assistant_messages_select" ON public.assistant_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "assistant_messages_insert" ON public.assistant_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "assistant_messages_delete" ON public.assistant_messages FOR DELETE TO authenticated USING (true);

CREATE TABLE public.ai_action_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result text NOT NULL DEFAULT '',
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ai_action_proposals TO authenticated;
GRANT ALL ON public.ai_action_proposals TO service_role;
ALTER TABLE public.ai_action_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_proposals_select" ON public.ai_action_proposals FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_proposals_insert" ON public.ai_action_proposals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_proposals_update" ON public.ai_action_proposals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER ai_action_proposals_updated_at BEFORE UPDATE ON public.ai_action_proposals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();