GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'properties',
    'complexes',
    'clients',
    'bookings',
    'booking_price_periods',
    'rentals'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      policy_name := 'RM OS staff can read ' || replace(table_name, '_', ' ');
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', table_name);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
        policy_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';