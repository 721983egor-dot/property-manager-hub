ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS beds_count integer,
  ADD COLUMN IF NOT EXISTS repair_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wc_location_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS land_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cian_jk_id integer;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_repair_type_check CHECK (repair_type IN ('', 'cosmetic', 'design', 'euro', 'no')),
  ADD CONSTRAINT properties_wc_location_type_check CHECK (wc_location_type IN ('', 'indoors', 'outdoors')),
  ADD CONSTRAINT properties_land_status_check CHECK (land_status IN ('', 'farm', 'privateFarm', 'gardening', 'individualHousingConstruction', 'industrialLand', 'suburbanNonProfitPartnership'));