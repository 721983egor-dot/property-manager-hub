DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','complexes','clients','bookings','booking_price_periods','rentals','selections','selection_items','deal_stages','deals','property_photos','complex_photos','profiles','user_roles','activity_log'] LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      EXECUTE format('DROP POLICY IF EXISTS "Staff can read %s" ON public.%I', t, t);
      EXECUTE format('CREATE POLICY "Staff can read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    END IF;
  END LOOP;
END $$;