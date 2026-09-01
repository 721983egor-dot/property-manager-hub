ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';

UPDATE public.properties SET address = 'Сочи, ЖК Кислород' WHERE ref_id = 1023 AND address = '';
UPDATE public.properties SET address = 'Сочи, ЖК Морская Симфония' WHERE ref_id = 1022 AND address = '';
UPDATE public.properties SET address = 'Сочи, посёлок Романово' WHERE ref_id = 1021 AND address = '';
UPDATE public.properties SET address = 'Сочи, Олимпийский' WHERE ref_id = 1020 AND address = '';