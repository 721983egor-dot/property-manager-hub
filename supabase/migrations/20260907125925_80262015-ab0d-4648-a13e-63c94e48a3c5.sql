UPDATE public.properties
SET commission = ROUND((commission / NULLIF(price_month, 0)) * 10) * 10
WHERE commission IS NOT NULL
  AND commission > 0
  AND price_month IS NOT NULL
  AND price_month > 0;