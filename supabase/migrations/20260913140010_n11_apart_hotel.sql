CREATE TYPE public.business_portfolio AS ENUM ('rm', 'n11');
CREATE TYPE public.stay_kind AS ENUM ('long_term', 'short_stay');

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::public.app_role, 'manager'::public.app_role)
  )
$$;

CREATE TABLE public.hotel_room_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  guests integer NOT NULL DEFAULT 2 CHECK (guests > 0),
  area numeric,
  price_night numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_room_categories TO authenticated;
GRANT ALL ON public.hotel_room_categories TO service_role;
ALTER TABLE public.hotel_room_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_categories_staff_select ON public.hotel_room_categories
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY hotel_categories_admin_write ON public.hotel_room_categories
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER hotel_room_categories_set_updated_at
  BEFORE UPDATE ON public.hotel_room_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.hotel_room_categories (code, name, description, guests, sort_order)
VALUES
  ('studio', 'Студия', 'Номера-студии апарт-отеля N-11', 2, 10),
  ('1br', '1-комнатные', 'Однокомнатные апартаменты N-11', 3, 20),
  ('2br', '2-комнатные', 'Двухкомнатные апартаменты N-11', 4, 30);

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS portfolio public.business_portfolio NOT NULL DEFAULT 'rm',
  ADD COLUMN IF NOT EXISTS room_category_id uuid REFERENCES public.hotel_room_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bnovo_room_id text,
  ADD COLUMN IF NOT EXISTS price_night numeric,
  ADD COLUMN IF NOT EXISTS guests_max integer;
CREATE INDEX IF NOT EXISTS properties_portfolio_idx ON public.properties (portfolio, status);
CREATE UNIQUE INDEX IF NOT EXISTS properties_bnovo_room_id_idx
  ON public.properties (bnovo_room_id) WHERE bnovo_room_id IS NOT NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portfolios public.business_portfolio[] NOT NULL DEFAULT ARRAY['rm']::public.business_portfolio[];

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS bnovo_id text,
  ADD COLUMN IF NOT EXISTS price_night numeric,
  ADD COLUMN IF NOT EXISTS adults integer,
  ADD COLUMN IF NOT EXISTS children integer,
  ADD COLUMN IF NOT EXISTS stay_kind public.stay_kind NOT NULL DEFAULT 'long_term';
CREATE UNIQUE INDEX IF NOT EXISTS bookings_bnovo_id_idx
  ON public.bookings (bnovo_id) WHERE bnovo_id IS NOT NULL;

CREATE TABLE public.owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  comment text NOT NULL DEFAULT '',
  user_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owners TO authenticated;
GRANT ALL ON public.owners TO service_role;
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY owners_staff_select ON public.owners
  FOR SELECT TO authenticated USING (
    public.is_staff(auth.uid()) OR user_id = auth.uid()
  );
CREATE POLICY owners_admin_write ON public.owners
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER owners_set_updated_at
  BEFORE UPDATE ON public.owners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.property_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  share_percent numeric CHECK (share_percent IS NULL OR (share_percent > 0 AND share_percent <= 100)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, owner_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_owners TO authenticated;
GRANT ALL ON public.property_owners TO service_role;
ALTER TABLE public.property_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY property_owners_staff_or_self_select ON public.property_owners
  FOR SELECT TO authenticated USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.owners o WHERE o.id = owner_id AND o.user_id = auth.uid())
  );
CREATE POLICY property_owners_admin_write ON public.property_owners
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.owns_property(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.property_owners po
    JOIN public.owners o ON o.id = po.owner_id
    WHERE po.property_id = _property_id AND o.user_id = _user_id
  )
$$;

CREATE TABLE public.bnovo_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  summary text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.bnovo_sync_runs TO authenticated;
GRANT ALL ON public.bnovo_sync_runs TO service_role;
ALTER TABLE public.bnovo_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY bnovo_sync_runs_staff_select ON public.bnovo_sync_runs
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Clients are readable by app users" ON public.clients;
DROP POLICY IF EXISTS "Staff can read clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated staff can read clients" ON public.clients;
CREATE POLICY "Staff can read clients"
  ON public.clients FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Bookings are readable by app users" ON public.bookings;
DROP POLICY IF EXISTS "Staff can read bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated staff can read bookings" ON public.bookings;
CREATE POLICY "Staff or room owners can read bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR public.owns_property(auth.uid(), property_id)
  );

CREATE POLICY hotel_categories_owner_select ON public.hotel_room_categories
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.properties p
      JOIN public.property_owners po ON po.property_id = p.id
      JOIN public.owners o ON o.id = po.owner_id
      WHERE p.room_category_id = hotel_room_categories.id AND o.user_id = auth.uid()
    )
  );

CREATE TRIGGER log_hotel_room_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.hotel_room_categories
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_owners
  AFTER INSERT OR UPDATE OR DELETE ON public.owners
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_property_owners
  AFTER INSERT OR UPDATE OR DELETE ON public.property_owners
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_bnovo_sync_runs
  AFTER INSERT OR UPDATE OR DELETE ON public.bnovo_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
