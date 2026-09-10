DROP TRIGGER IF EXISTS log_profiles ON public.profiles;
CREATE TRIGGER log_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS log_user_roles ON public.user_roles;
CREATE TRIGGER log_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS log_selection_items ON public.selection_items;
CREATE TRIGGER log_selection_items AFTER INSERT OR DELETE ON public.selection_items
FOR EACH ROW EXECUTE FUNCTION public.log_activity();