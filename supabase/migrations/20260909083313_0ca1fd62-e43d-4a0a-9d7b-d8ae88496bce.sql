
CREATE TYPE public.app_role AS ENUM ('admin', 'manager');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Roles are readable by signed in users"
ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  birth_date date,
  photo_path text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are readable by signed in users"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users update own profile, admins update any"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert profiles"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete profiles"
ON public.profiles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, email)
SELECT id, coalesce(email, '') FROM auth.users
ON CONFLICT DO NOTHING;

-- Права на основные разделы: менеджер только смотрит объекты/комплексы/клиентов
DROP POLICY "Properties are updatable by app users" ON public.properties;
DROP POLICY "Properties are insertable by app users" ON public.properties;
DROP POLICY "Properties are deletable by app users" ON public.properties;
CREATE POLICY "Properties are insertable by admins" ON public.properties
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Properties are updatable by admins" ON public.properties
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Properties are deletable by admins" ON public.properties
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Complexes are updatable by app users" ON public.complexes;
DROP POLICY "Complexes are insertable by app users" ON public.complexes;
DROP POLICY "Complexes are deletable by app users" ON public.complexes;
CREATE POLICY "Complexes are insertable by admins" ON public.complexes
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Complexes are updatable by admins" ON public.complexes
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Complexes are deletable by admins" ON public.complexes
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Clients are updatable by app users" ON public.clients;
DROP POLICY "Clients are insertable by app users" ON public.clients;
DROP POLICY "Clients are deletable by app users" ON public.clients;
CREATE POLICY "Clients are insertable by signed in users" ON public.clients
FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Clients are updatable by admins" ON public.clients
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Clients are deletable by admins" ON public.clients
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Bookings are insertable by app users" ON public.bookings;
DROP POLICY "Bookings are updatable by app users" ON public.bookings;
DROP POLICY "Bookings are deletable by app users" ON public.bookings;
CREATE POLICY "Bookings are insertable by signed in users" ON public.bookings
FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Bookings are updatable by signed in users" ON public.bookings
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Bookings are deletable by admins" ON public.bookings
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Booking periods are insertable by app users" ON public.booking_price_periods;
DROP POLICY "Booking periods are updatable by app users" ON public.booking_price_periods;
DROP POLICY "Booking periods are deletable by app users" ON public.booking_price_periods;
CREATE POLICY "Booking periods are insertable by signed in users" ON public.booking_price_periods
FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Booking periods are updatable by signed in users" ON public.booking_price_periods
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Booking periods are deletable by signed in users" ON public.booking_price_periods
FOR DELETE TO authenticated USING (true);

DROP POLICY "Rentals are insertable by app users" ON public.rentals;
DROP POLICY "Rentals are updatable by app users" ON public.rentals;
DROP POLICY "Rentals are deletable by app users" ON public.rentals;
CREATE POLICY "Rentals are insertable by signed in users" ON public.rentals
FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Rentals are updatable by signed in users" ON public.rentals
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Rentals are deletable by admins" ON public.rentals
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
