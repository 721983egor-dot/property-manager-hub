ALTER TABLE public.properties ADD COLUMN source_url text UNIQUE;

COMMENT ON COLUMN public.properties.source_url IS 'URL источника объекта на сайте, используется для избежания дублей при импорте';