GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON public.properties TO authenticated;
GRANT SELECT ON public.complexes TO authenticated;
GRANT SELECT ON public.clients TO authenticated;
GRANT SELECT ON public.bookings TO authenticated;
GRANT SELECT ON public.booking_price_periods TO authenticated;
GRANT SELECT ON public.rentals TO authenticated;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_price_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated staff can read properties" ON public.properties;
CREATE POLICY "Authenticated staff can read properties"
  ON public.properties FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated staff can read complexes" ON public.complexes;
CREATE POLICY "Authenticated staff can read complexes"
  ON public.complexes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated staff can read clients" ON public.clients;
CREATE POLICY "Authenticated staff can read clients"
  ON public.clients FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated staff can read bookings" ON public.bookings;
CREATE POLICY "Authenticated staff can read bookings"
  ON public.bookings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated staff can read booking price periods" ON public.booking_price_periods;
CREATE POLICY "Authenticated staff can read booking price periods"
  ON public.booking_price_periods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated staff can read rentals" ON public.rentals;
CREATE POLICY "Authenticated staff can read rentals"
  ON public.rentals FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';