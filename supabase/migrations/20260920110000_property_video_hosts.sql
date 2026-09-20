-- Исходный файл видео и результат выгрузки на Rutube / VK / YouTube.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS video_file_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS video_vk_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS video_youtube_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS video_publish_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS video_publish_error text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.video_host_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  rutube_email text NOT NULL DEFAULT '',
  rutube_password text NOT NULL DEFAULT '',
  rutube_token text NOT NULL DEFAULT '',
  rutube_author_id text NOT NULL DEFAULT '',
  rutube_category_id integer NOT NULL DEFAULT 13,
  vk_token text NOT NULL DEFAULT '',
  vk_group_id text NOT NULL DEFAULT '',
  youtube_client_id text NOT NULL DEFAULT '',
  youtube_client_secret text NOT NULL DEFAULT '',
  youtube_refresh_token text NOT NULL DEFAULT '',
  extra_hashtags text NOT NULL DEFAULT '#residencemore #сочи #арендасочи #долгосрочнаяаренда',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.video_host_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.video_host_settings ENABLE ROW LEVEL SECURITY;
