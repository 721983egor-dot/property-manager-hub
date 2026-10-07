-- Finance classification is separate from the real estate catalogue.
CREATE TABLE public.finance_object_classes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX finance_object_classes_name_idx ON public.finance_object_classes(lower(btrim(name)));
CREATE TABLE public.finance_object_settings (
 property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
 classification_id uuid REFERENCES public.finance_object_classes(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_object_settings_classification_idx ON public.finance_object_settings(classification_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.finance_object_classes,public.finance_object_settings TO authenticated;
GRANT ALL ON public.finance_object_classes,public.finance_object_settings TO service_role;
ALTER TABLE public.finance_object_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_object_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_object_classes_admin_all ON public.finance_object_classes FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE POLICY finance_object_settings_admin_all ON public.finance_object_settings FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE TRIGGER finance_object_classes_updated BEFORE UPDATE ON public.finance_object_classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER finance_object_settings_updated BEFORE UPDATE ON public.finance_object_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER log_finance_object_classes AFTER INSERT OR UPDATE OR DELETE ON public.finance_object_classes FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_finance_object_settings AFTER INSERT OR UPDATE OR DELETE ON public.finance_object_settings FOR EACH ROW EXECUTE FUNCTION public.log_activity();
NOTIFY pgrst,'reload schema';
