DROP POLICY IF EXISTS "Anyone signed in can view profiles" ON public.profiles;

CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.profiles_directory
WITH (security_invoker = on) AS
  SELECT id, full_name, department, current_task
  FROM public.profiles;

GRANT SELECT ON public.profiles_directory TO authenticated;