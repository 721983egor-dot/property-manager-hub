-- Брони Bnovo приходят на категорию; конкретный номер появляется при заселении.
ALTER TABLE public.hotel_room_categories
  ADD COLUMN IF NOT EXISTS bnovo_room_type_id text;
CREATE UNIQUE INDEX IF NOT EXISTS hotel_room_categories_bnovo_type_idx
  ON public.hotel_room_categories (bnovo_room_type_id)
  WHERE bnovo_room_type_id IS NOT NULL;

INSERT INTO public.hotel_room_categories (code, name, description, guests, sort_order, bnovo_room_type_id)
VALUES
  ('standard_plus', 'Стандарт Плюс', 'Два одинаковых номера: 546 и 567', 2, 10, '720995'),
  ('deluxe', 'Делюкс', 'Два одинаковых номера: 526 и 530', 2, 20, NULL)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  bnovo_room_type_id = COALESCE(public.hotel_room_categories.bnovo_room_type_id, EXCLUDED.bnovo_room_type_id);

INSERT INTO public.properties (
  title, internal_name, type, portfolio, published, service_type,
  address, complex_name, room_category_id, status, rooms, bathrooms
)
SELECT
  'N-11 ' || room.num,
  room.num,
  'aparts'::public.property_type,
  'n11'::public.business_portfolio,
  false,
  'management'::public.property_service_type,
  'Сочи, улица Навагинская',
  'N-11 Residence',
  cat.id,
  'free'::public.property_status,
  1,
  1
FROM (
  VALUES
    ('546', 'standard_plus'),
    ('567', 'standard_plus'),
    ('526', 'deluxe'),
    ('530', 'deluxe')
) AS room(num, code)
JOIN public.hotel_room_categories cat ON cat.code = room.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.properties p
  WHERE p.portfolio = 'n11' AND p.internal_name = room.num
);

UPDATE public.properties p
SET room_category_id = cat.id
FROM public.hotel_room_categories cat
WHERE p.portfolio = 'n11'
  AND p.internal_name IN ('546', '567')
  AND cat.code = 'standard_plus';

UPDATE public.properties p
SET room_category_id = cat.id
FROM public.hotel_room_categories cat
WHERE p.portfolio = 'n11'
  AND p.internal_name IN ('526', '530')
  AND cat.code = 'deluxe';

DELETE FROM public.hotel_room_categories c
WHERE c.code IN ('studio', '1br', '2br')
  AND NOT EXISTS (
    SELECT 1 FROM public.properties p WHERE p.room_category_id = c.id
  );
