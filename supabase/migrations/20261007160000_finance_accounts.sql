CREATE TABLE public.finance_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) > 0),
 type text NOT NULL CHECK (type IN ('bank','card','cash')),
 archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX finance_accounts_name_idx ON public.finance_accounts(lower(btrim(name)));
INSERT INTO public.finance_accounts(name,type) VALUES ('Основной','bank'),('Касса','cash'),('Карта','card');
INSERT INTO public.finance_accounts(name,type)
 SELECT DISTINCT ON (lower(btrim(account))) account,'bank' FROM public.payments p
 WHERE account IS NOT NULL AND length(btrim(account))>0
 AND NOT EXISTS (SELECT 1 FROM public.finance_accounts a WHERE lower(btrim(a.name))=lower(btrim(p.account)))
 ORDER BY lower(btrim(account)),account;
UPDATE public.payments p SET account=a.name FROM public.finance_accounts a
 WHERE lower(btrim(p.account))=lower(btrim(a.name)) AND p.account IS DISTINCT FROM a.name;
GRANT SELECT,INSERT,UPDATE ON public.finance_accounts TO authenticated;
GRANT ALL ON public.finance_accounts TO service_role;
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_accounts_admin_all ON public.finance_accounts FOR ALL TO authenticated
 USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE TRIGGER finance_accounts_updated BEFORE UPDATE ON public.finance_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER log_finance_accounts AFTER INSERT OR UPDATE OR DELETE ON public.finance_accounts FOR EACH ROW EXECUTE FUNCTION public.log_activity();
-- Names remain stable keys for existing payments and reports; archive preserves history.
CREATE FUNCTION public.guard_finance_account() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='finance_accounts' THEN
  IF NEW.name IS DISTINCT FROM OLD.name THEN RAISE EXCEPTION 'Название существующего счёта менять нельзя'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.account IS NOT DISTINCT FROM OLD.account THEN RETURN NEW; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_accounts a WHERE a.name=NEW.account AND NOT a.archived) THEN
  RAISE EXCEPTION 'Выберите действующий счёт в настройках финансов';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_account_name_stable BEFORE UPDATE ON public.finance_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_finance_account();
CREATE TRIGGER payment_account_valid BEFORE INSERT OR UPDATE OF account ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_finance_account();
NOTIFY pgrst,'reload schema';
