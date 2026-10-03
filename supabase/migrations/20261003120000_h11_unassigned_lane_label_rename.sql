-- Rename user-facing titles of H11 unassigned lanes: «без номера» → «новая бронь».
-- Flag is_unassigned_lane stays unchanged.

UPDATE public.properties
SET
  internal_name = 'новая бронь',
  title = regexp_replace(title, 'без номера', 'новая бронь', 'g')
WHERE is_unassigned_lane = true;
