CREATE TYPE public.property_service_type AS ENUM ('management', 'commission_only');
CREATE TYPE public.management_fee_type AS ENUM ('percent', 'amount');

ALTER TABLE public.properties
  ADD COLUMN service_type public.property_service_type NOT NULL DEFAULT 'management',
  ADD COLUMN management_fee_type public.management_fee_type NOT NULL DEFAULT 'percent',
  ADD COLUMN management_fee_value numeric,
  ADD COLUMN availability_note text NOT NULL DEFAULT '';