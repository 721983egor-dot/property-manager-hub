DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','complexes','clients','bookings','booking_price_periods','rentals','selections','selection_items','deal_stages','deals'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Staff can read properties" ON public.properties;
CREATE POLICY "Staff can read properties" ON public.properties FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can read complexes" ON public.complexes;
CREATE POLICY "Staff can read complexes" ON public.complexes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can read clients" ON public.clients;
CREATE POLICY "Staff can read clients" ON public.clients FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can read bookings" ON public.bookings;
CREATE POLICY "Staff can read bookings" ON public.bookings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can read booking price periods" ON public.booking_price_periods;
CREATE POLICY "Staff can read booking price periods" ON public.booking_price_periods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can read rentals" ON public.rentals;
CREATE POLICY "Staff can read rentals" ON public.rentals FOR SELECT TO authenticated USING (true);