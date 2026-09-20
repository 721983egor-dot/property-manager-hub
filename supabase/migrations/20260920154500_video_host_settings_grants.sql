DO $$
BEGIN
  IF to_regclass('public.video_host_settings') IS NOT NULL THEN
    GRANT ALL ON public.video_host_settings TO service_role;
    GRANT SELECT, INSERT, UPDATE ON public.video_host_settings TO authenticated;
  END IF;
END $$;
