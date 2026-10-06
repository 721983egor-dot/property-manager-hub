-- Карточки контрагентов и обязательства (нативный Финансы, без Адеска).
-- Плюс поля операции: счёт, связь с контрагентом/обязательством, дата начисления.

DO $$ BEGIN
  CREATE TYPE public.finance_counterparty_kind AS ENUM (
    'tenant',
    'owner',
    'contractor',
    'employee',
    'deposit',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.finance_obligation_direction AS ENUM ('receivable', 'payable');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.finance_counterparties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind public.finance_counterparty_kind NOT NULL DEFAULT 'other',
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_counterparties_kind_idx ON public.finance_counterparties (kind);
CREATE INDEX IF NOT EXISTS finance_counterparties_name_idx ON public.finance_counterparties (lower(name));
CREATE INDEX IF NOT EXISTS finance_counterparties_client_id_idx ON public.finance_counterparties (client_id);

CREATE TABLE IF NOT EXISTS public.finance_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_id uuid NOT NULL REFERENCES public.finance_counterparties(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  direction public.finance_obligation_direction NOT NULL DEFAULT 'receivable',
  description text NOT NULL DEFAULT '',
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_obligations_counterparty_idx ON public.finance_obligations (counterparty_id);
CREATE INDEX IF NOT EXISTS finance_obligations_date_idx ON public.finance_obligations (planned_date);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS counterparty_id uuid REFERENCES public.finance_counterparties(id) ON DELETE SET NULL;
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS account text NOT NULL DEFAULT 'Основной';
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS obligation_id uuid REFERENCES public.finance_obligations(id) ON DELETE SET NULL;
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS accrual_date date;

CREATE INDEX IF NOT EXISTS payments_counterparty_id_idx ON public.payments (counterparty_id);

COMMENT ON TABLE public.finance_counterparties IS
  'Контрагенты блока Финансы: арендаторы, собственники, подрядчики, сотрудники, депозиты.';
COMMENT ON TABLE public.finance_obligations IS
  'Обязательства контрагента: receivable = должен нам (мы передали), payable = мы должны.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_counterparties TO authenticated;
GRANT ALL ON public.finance_counterparties TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_obligations TO authenticated;
GRANT ALL ON public.finance_obligations TO service_role;

ALTER TABLE public.finance_counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_obligations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'finance_counterparties' AND policyname = 'finance_counterparties_admin_all'
  ) THEN
    CREATE POLICY "finance_counterparties_admin_all" ON public.finance_counterparties
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'finance_obligations' AND policyname = 'finance_obligations_admin_all'
  ) THEN
    CREATE POLICY "finance_obligations_admin_all" ON public.finance_obligations
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS finance_counterparties_set_updated_at ON public.finance_counterparties;
CREATE TRIGGER finance_counterparties_set_updated_at
  BEFORE UPDATE ON public.finance_counterparties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_finance_counterparties ON public.finance_counterparties;
CREATE TRIGGER log_finance_counterparties
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_counterparties
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS finance_obligations_set_updated_at ON public.finance_obligations;
CREATE TRIGGER finance_obligations_set_updated_at
  BEFORE UPDATE ON public.finance_obligations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_finance_obligations ON public.finance_obligations;
CREATE TRIGGER log_finance_obligations
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_obligations
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

NOTIFY pgrst, 'reload schema';
