DROP VIEW IF EXISTS public.profiles_directory;

CREATE OR REPLACE FUNCTION public.get_profiles_directory()
RETURNS TABLE (id uuid, full_name text, department text, current_task text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.department, p.current_task
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_profiles_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profiles_directory() TO authenticated;