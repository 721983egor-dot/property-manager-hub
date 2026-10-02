-- PMS Bnovo uses different room_type_id than the website module (onlyrooms).
-- Sync must not overwrite website ids; map both. Also lock locally assigned rooms
-- so unassigned OTA bookings (room_id=0) return to «без номера» unless staff assigned.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS manual_room_assignment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.manual_room_assignment IS
  'true = менеджер назначил номер в RM OS; синк Bnovo не сбрасывает на полосу «без номера», пока в Bnovo room_id пустой';

-- Restore / keep website-module room type ids (onlyrooms) as canonical for categories.
UPDATE public.hotel_room_categories
SET bnovo_room_type_id = '461845'
WHERE code = 'deluxe';

UPDATE public.hotel_room_categories
SET bnovo_room_type_id = '608431'
WHERE code = 'standard_plus';
