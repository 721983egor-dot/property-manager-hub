-- OTA-брони Bnovo часто приходят на категорию без конкретного номера.
-- Раньше sync либо пропускал такие брони, либо молча сажал на свободный юнит.
-- Теперь у каждой категории H11 есть служебная полоса «без номера».

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS is_unassigned_lane boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS properties_unassigned_lane_idx
  ON public.properties (portfolio, room_category_id)
  WHERE is_unassigned_lane = true;

-- ID категорий модуля сайта (onlyrooms): Делюкс / Стандарт плюс.
UPDATE public.hotel_room_categories
SET bnovo_room_type_id = '461845'
WHERE code = 'deluxe';

UPDATE public.hotel_room_categories
SET bnovo_room_type_id = '608431'
WHERE code = 'standard_plus';

INSERT INTO public.properties (
  title, internal_name, type, portfolio, published, service_type,
  address, complex_name, room_category_id, status, rooms, bathrooms,
  for_rent, is_unassigned_lane, sort_order, availability_note
)
SELECT
  'H11 · ' || cat.name || ' · без номера',
  'без номера',
  'aparts'::public.property_type,
  'n11'::public.business_portfolio,
  false,
  'management'::public.property_service_type,
  'Сочи, улица Навагинская',
  'H11 Резиденция',
  cat.id,
  'free'::public.property_status,
  1,
  1,
  true,
  true,
  0,
  'Служебная полоса календаря для броней Bnovo без назначенного номера'
FROM public.hotel_room_categories cat
WHERE cat.code IN ('deluxe', 'standard_plus')
  AND NOT EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.portfolio = 'n11'
      AND p.is_unassigned_lane = true
      AND p.room_category_id = cat.id
  );

-- На полосе «без номера» несколько броней могут пересекаться по датам.
CREATE OR REPLACE FUNCTION public.bookings_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  conflict_row record;
  lane boolean;
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Дата окончания раньше даты начала';
  END IF;
  IF NEW.status <> 'cancelled' THEN
    SELECT COALESCE(p.is_unassigned_lane, false) INTO lane
    FROM public.properties p
    WHERE p.id = NEW.property_id;
    IF COALESCE(lane, false) THEN
      RETURN NEW;
    END IF;
    SELECT b.start_date, b.end_date INTO conflict_row
    FROM public.bookings b
    WHERE b.property_id = NEW.property_id
      AND b.id <> NEW.id
      AND b.status <> 'cancelled'
      AND b.start_date <= NEW.end_date
      AND b.end_date >= NEW.start_date
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Объект уже забронирован на период % — %',
        to_char(conflict_row.start_date, 'DD.MM.YYYY'),
        to_char(conflict_row.end_date, 'DD.MM.YYYY');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
