-- Account names are still the key stored on payments. Rename both in one transaction.
CREATE OR REPLACE FUNCTION public.guard_finance_account() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='finance_accounts' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.account IS NOT DISTINCT FROM OLD.account THEN RETURN NEW; END IF;
 END IF;
 -- Lock the account against a concurrent rename while an operation is being saved.
 -- Only a nested rename cascade may retain an archived account on historical operations.
 PERFORM 1 FROM public.finance_accounts a
  WHERE a.name=NEW.account AND (NOT a.archived OR (TG_OP='UPDATE' AND pg_trigger_depth()>1))
  FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Выберите действующий счёт в настройках финансов'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.propagate_finance_account_name() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 UPDATE public.payments SET account=NEW.name WHERE account=OLD.name;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_account_rename_payments
 AFTER UPDATE OF name ON public.finance_accounts
 FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
 EXECUTE FUNCTION public.propagate_finance_account_name();
NOTIFY pgrst,'reload schema';
