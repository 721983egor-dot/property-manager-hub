-- Deletion never removes financial history. Used accounts require an active replacement.
CREATE FUNCTION public.finance_account_usage(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE acct text; payments_count bigint; deals_count bigint;
BEGIN
 IF NOT COALESCE(auth.role()='service_role' OR public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 SELECT name INTO acct FROM public.finance_accounts WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Счёт не найден'; END IF;
 SELECT count(*) INTO payments_count FROM public.payments WHERE account=acct;
 -- JSON inspection also works on installations without optional CRM financial terms.
 SELECT count(*) INTO deals_count FROM public.deals d WHERE to_jsonb(d)->'finance_terms'->>'account_id'=p_id::text;
 RETURN jsonb_build_object('payments',payments_count,'deals',deals_count);
END $$;

CREATE FUNCTION public.guard_finance_account_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.payments WHERE account=OLD.name)
 OR EXISTS(SELECT 1 FROM public.deals d WHERE to_jsonb(d)->'finance_terms'->>'account_id'=OLD.id::text)
 THEN RAISE EXCEPTION 'Сначала перенесите операции и связанные сделки на другой счёт'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER finance_account_delete_used BEFORE DELETE ON public.finance_accounts
 FOR EACH ROW EXECUTE FUNCTION public.guard_finance_account_delete();

CREATE FUNCTION public.delete_finance_account(p_id uuid, p_transfer_to uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source_name text; target_name text; usage jsonb;
BEGIN
 IF NOT COALESCE(auth.role()='service_role' OR public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Только администратор'; END IF;
 IF p_id=p_transfer_to THEN RAISE EXCEPTION 'Выберите другой счёт для переноса'; END IF;
 -- Same lock order for simultaneous transfers; payment validation locks against deletion.
 PERFORM 1 FROM public.finance_accounts WHERE id IN(p_id,p_transfer_to) ORDER BY id FOR UPDATE;
 SELECT name INTO source_name FROM public.finance_accounts WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Счёт не найден'; END IF;
 IF p_transfer_to IS NOT NULL THEN
  SELECT name INTO target_name FROM public.finance_accounts WHERE id=p_transfer_to AND NOT archived;
  IF NOT FOUND THEN RAISE EXCEPTION 'Для переноса выберите действующий счёт'; END IF;
 END IF;
 usage:=public.finance_account_usage(p_id);
 IF ((usage->>'payments')::bigint>0 OR (usage->>'deals')::bigint>0) AND target_name IS NULL
 THEN RAISE EXCEPTION 'Выберите счёт для переноса операций и связанных сделок'; END IF;
 IF target_name IS NOT NULL THEN
  UPDATE public.payments SET account=target_name WHERE account=source_name;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='deals' AND column_name='finance_terms') THEN
   EXECUTE 'UPDATE public.deals SET finance_terms=jsonb_set(finance_terms,''{account_id}'',to_jsonb($2::text)) WHERE finance_terms->>''account_id''=$1'
    USING p_id::text,p_transfer_to::text;
  END IF;
 END IF;
 DELETE FROM public.finance_accounts WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.finance_account_usage(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_finance_account(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_account_usage(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delete_finance_account(uuid,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
