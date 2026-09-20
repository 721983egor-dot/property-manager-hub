-- Видеообзор объекта: ссылка (YouTube / VK / Rutube) или путь файла в хранилище.
-- Пустая строка = видео нет, на сайте блок не показывается.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS video_url text NOT NULL DEFAULT '';
