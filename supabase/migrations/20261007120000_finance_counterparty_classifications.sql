-- Пользовательские классификации: удаление группы сохраняет контрагентов и операции.
CREATE TABLE public.finance_counterparty_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  legacy_kind public.finance_counterparty_kind UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX finance_counterparty_classes_name_idx ON public.finance_counterparty_classes(lower(btrim(name)));
ALTER TABLE public.finance_counterparties
  ADD COLUMN classification_id uuid REFERENCES public.finance_counterparty_classes(id) ON DELETE SET NULL,
  ADD COLUMN requisites text NOT NULL DEFAULT '';
CREATE INDEX finance_counterparties_classification_idx ON public.finance_counterparties(classification_id);
INSERT INTO public.finance_counterparty_classes(name, legacy_kind) VALUES
 ('Арендаторы', 'tenant'), ('Собственники', 'owner'), ('Подрядчики', 'contractor'),
 ('Сотрудники', 'employee'), ('Депозиты гостей', 'deposit'), ('Прочее', 'other');
UPDATE public.finance_counterparties p SET classification_id = c.id
FROM public.finance_counterparty_classes c WHERE p.kind = c.legacy_kind;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_counterparty_classes TO authenticated;
GRANT ALL ON public.finance_counterparty_classes TO service_role;
ALTER TABLE public.finance_counterparty_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_counterparty_classes_admin_all ON public.finance_counterparty_classes
FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER finance_counterparty_classes_updated BEFORE UPDATE ON public.finance_counterparty_classes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER log_finance_counterparty_classes AFTER INSERT OR UPDATE OR DELETE ON public.finance_counterparty_classes
FOR EACH ROW EXECUTE FUNCTION public.log_activity();
NOTIFY pgrst, 'reload schema';
