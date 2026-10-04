-- Блок «Финансы»: календарь платежей (нативный MVP, без Адеска).

DO $$ BEGIN
  CREATE TYPE public.payment_direction AS ENUM ('in', 'out');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('expected', 'partial', 'paid', 'overdue');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_kind AS ENUM (
    'rent_in',
    'deposit_in',
    'deposit_out',
    'owner_payout',
    'contractor',
    'agency_cost',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  direction public.payment_direction NOT NULL DEFAULT 'in',
  status public.payment_status NOT NULL DEFAULT 'expected',
  kind public.payment_kind NOT NULL DEFAULT 'other',
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  counterparty_name text NOT NULL DEFAULT '',
  comment text NOT NULL DEFAULT '',
  paid_at date,
  paid_amount numeric CHECK (paid_amount IS NULL OR paid_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_planned_date_idx ON public.payments (planned_date);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments (status);
CREATE INDEX IF NOT EXISTS payments_property_id_idx ON public.payments (property_id);
CREATE INDEX IF NOT EXISTS payments_client_id_idx ON public.payments (client_id);
CREATE INDEX IF NOT EXISTS payments_direction_idx ON public.payments (direction);

COMMENT ON TABLE public.payments IS
  'Календарь оплат RM OS: план/факт по объектам и контрагентам. Статус overdue можно хранить или вычислять.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'payments_select'
  ) THEN
    CREATE POLICY "payments_select" ON public.payments
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'payments_write'
  ) THEN
    CREATE POLICY "payments_write" ON public.payments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS log_payments ON public.payments;
CREATE TRIGGER log_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

NOTIFY pgrst, 'reload schema';
