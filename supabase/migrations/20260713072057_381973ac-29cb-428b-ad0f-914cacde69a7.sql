DROP VIEW IF EXISTS public.profiles_directory;

CREATE VIEW public.profiles_directory
WITH (security_invoker = off) AS
  SELECT id, full_name, department, current_task
  FROM public.profiles;

ALTER VIEW public.profiles_directory OWNER TO postgres;
GRANT SELECT ON public.profiles_directory TO authenticated;