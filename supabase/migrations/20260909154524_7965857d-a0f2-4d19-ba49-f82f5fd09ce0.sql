INSERT INTO public.deal_stages (name, color, position, kind)
SELECT seed.name, seed.color, seed.position, seed.kind
FROM (VALUES
  ('Новая', '#0ea5e9', 0, 'open'),
  ('Показ', '#6366f1', 1, 'open'),
  ('Переговоры', '#f59e0b', 2, 'open'),
  ('Договор', '#8b5cf6', 3, 'open'),
  ('Успешно', '#10b981', 4, 'won'),
  ('Отказ', '#ef4444', 5, 'lost')
) AS seed(name, color, position, kind)
WHERE NOT EXISTS (SELECT 1 FROM public.deal_stages);