ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS price_month numeric(12,2),
  ADD COLUMN IF NOT EXISTS seasonal_pricing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS summer_price_month numeric(12,2),
  ADD COLUMN IF NOT EXISTS deposit numeric(12,2),
  ADD COLUMN IF NOT EXISTS commission numeric(12,2);

UPDATE public.properties SET price_month = 100000, seasonal_pricing = true, summer_price_month = 150000, deposit = 100000, commission = 50000 WHERE ref_id = 1023;
UPDATE public.properties SET price_month = 80000, seasonal_pricing = false, deposit = 80000, commission = 40000 WHERE ref_id = 1022;
UPDATE public.properties SET price_month = 250000, seasonal_pricing = true, summer_price_month = 400000, deposit = 250000, commission = 125000 WHERE ref_id = 1021;
UPDATE public.properties SET price_month = 120000, seasonal_pricing = false, deposit = 120000, commission = 60000 WHERE ref_id = 1020;