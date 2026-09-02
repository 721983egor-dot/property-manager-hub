CREATE TYPE public.rental_status AS ENUM ('booked', 'rented', 'blocked');

CREATE TABLE public.rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.rental_status NOT NULL DEFAULT 'rented',
  tenant_name text NOT NULL DEFAULT '',
  tenant_id uuid,
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rentals_property_id_idx ON public.rentals(property_id);
CREATE INDEX rentals_dates_idx ON public.rentals(start_date, end_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rentals TO anon, authenticated;
GRANT ALL ON public.rentals TO service_role;

ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rentals are readable by app users" ON public.rentals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Rentals are insertable by app users" ON public.rentals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Rentals are updatable by app users" ON public.rentals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Rentals are deletable by app users" ON public.rentals FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER rentals_set_updated_at BEFORE UPDATE ON public.rentals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.rentals_validate_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rentals_validate_dates_trg BEFORE INSERT OR UPDATE ON public.rentals
FOR EACH ROW EXECUTE FUNCTION public.rentals_validate_dates();

INSERT INTO public.rentals (property_id, start_date, end_date, status, tenant_name, comment)
SELECT p.id,
       date_trunc('month', now())::date + ((row_number() over (ORDER BY p.created_at)) * 2)::int,
       date_trunc('month', now())::date + ((row_number() over (ORDER BY p.created_at)) * 2 + 12)::int,
       'rented'::public.rental_status,
       (ARRAY['Сафонов Юрий','Тарасова Сима','Потапов Олег','Ольга','Константин Б'])[((row_number() over (ORDER BY p.created_at)) % 5) + 1],
       ''
FROM public.properties p
WHERE p.status <> 'archived'
LIMIT 6;