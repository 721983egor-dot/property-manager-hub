CREATE TABLE public.telegram_updates (
  update_id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_updates TO service_role;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL UNIQUE,
  chat_id bigint NOT NULL,
  display_name text NOT NULL DEFAULT '',
  username text NOT NULL DEFAULT '',
  user_id uuid,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.telegram_accounts TO authenticated;
GRANT ALL ON public.telegram_accounts TO service_role;
ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read telegram accounts" ON public.telegram_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff update telegram accounts" ON public.telegram_accounts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "staff delete telegram accounts" ON public.telegram_accounts FOR DELETE TO authenticated USING (true);
CREATE TRIGGER telegram_accounts_set_updated_at BEFORE UPDATE ON public.telegram_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.telegram_link_codes (
  code text PRIMARY KEY,
  user_id uuid,
  created_by_email text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_telegram_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.telegram_link_codes TO authenticated;
GRANT ALL ON public.telegram_link_codes TO service_role;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read link codes" ON public.telegram_link_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff create link codes" ON public.telegram_link_codes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff delete link codes" ON public.telegram_link_codes FOR DELETE TO authenticated USING (true);

CREATE TABLE public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  transcript text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telegram_messages_chat ON public.telegram_messages (chat_id, created_at);
GRANT SELECT ON public.telegram_messages TO authenticated;
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read telegram messages" ON public.telegram_messages FOR SELECT TO authenticated USING (true);