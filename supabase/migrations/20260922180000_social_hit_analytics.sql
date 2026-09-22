-- Итерация 4: метки «залетел» и рубрика контент-микса для разбора без жёстких порогов.
-- Заявки к посту напрямую не привязаны — proxy через property_id + ручная пометка manual_hit.

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS content_mix TEXT
    CHECK (content_mix IS NULL OR content_mix IN (
      'life_sochi', 'relocation', 'property', 'company', 'other'
    )),
  ADD COLUMN IF NOT EXISTS manual_hit BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hit_note TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.social_posts.content_mix IS
  'Рубрика микса: жизнь в Сочи / переезд / объект / компания / другое. NULL = вывести эвристикой.';
COMMENT ON COLUMN public.social_posts.manual_hit IS
  'Ручная пометка «залетел» (пока нет прямой связки пост→заявка).';
COMMENT ON COLUMN public.social_posts.hit_note IS
  'Короткий вывод по посту для разбора / Ассистента.';

CREATE INDEX IF NOT EXISTS social_posts_content_mix_idx
  ON public.social_posts (content_mix)
  WHERE content_mix IS NOT NULL;

CREATE INDEX IF NOT EXISTS social_posts_manual_hit_idx
  ON public.social_posts (manual_hit)
  WHERE manual_hit = true;

NOTIFY pgrst, 'reload schema';
