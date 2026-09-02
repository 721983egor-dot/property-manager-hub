CREATE TYPE public.booking_status AS ENUM ('active', 'cancelled', 'completed');
CREATE TYPE public.booking_source AS ENUM ('avito', 'cian', 'website', 'social', 'referral');
CREATE TYPE public.booking_price_type AS ENUM ('fixed', 'periodic');

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO anon, authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients are readable by app users" ON public.clients FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Clients are insertable by app users" ON public.clients FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Clients are updatable by app users" ON public.clients FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Clients are deletable by app users" ON public.clients FOR DELETE TO anon, authenticated USING (true);
CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  price_type public.booking_price_type NOT NULL DEFAULT 'fixed',
  price_month numeric,
  payment_day integer NOT NULL DEFAULT 1 CHECK (payment_day BETWEEN 1 AND 31),
  deposit numeric,
  source public.booking_source,
  status public.booking_status NOT NULL DEFAULT 'active',
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_property_idx ON public.bookings (property_id, start_date, end_date);
CREATE INDEX bookings_client_idx ON public.bookings (client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO anon, authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bookings are readable by app users" ON public.bookings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Bookings are insertable by app users" ON public.bookings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Bookings are updatable by app users" ON public.bookings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Bookings are deletable by app users" ON public.bookings FOR DELETE TO anon, authenticated USING (true);
CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.booking_price_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  price_month numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_price_periods_booking_idx ON public.booking_price_periods (booking_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_price_periods TO anon, authenticated;
GRANT ALL ON public.booking_price_periods TO service_role;
ALTER TABLE public.booking_price_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Booking periods are readable by app users" ON public.booking_price_periods FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Booking periods are insertable by app users" ON public.booking_price_periods FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Booking periods are updatable by app users" ON public.booking_price_periods FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Booking periods are deletable by app users" ON public.booking_price_periods FOR DELETE TO anon, authenticated USING (true);
CREATE TRIGGER booking_price_periods_set_updated_at BEFORE UPDATE ON public.booking_price_periods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.bookings_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  conflict_row record;
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Дата окончания раньше даты начала';
  END IF;
  IF NEW.status <> 'cancelled' THEN
    SELECT b.start_date, b.end_date INTO conflict_row
    FROM public.bookings b
    WHERE b.property_id = NEW.property_id
      AND b.id <> NEW.id
      AND b.status <> 'cancelled'
      AND b.start_date <= NEW.end_date
      AND b.end_date >= NEW.start_date
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Объект уже забронирован на период % — %', to_char(conflict_row.start_date, 'DD.MM.YYYY'), to_char(conflict_row.end_date, 'DD.MM.YYYY');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_validate_trg BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.bookings_validate();

DELETE FROM public.rentals;