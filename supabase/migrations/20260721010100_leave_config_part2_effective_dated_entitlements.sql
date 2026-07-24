-- Part 2 of 2 — run this AFTER part 1 has succeeded.

-- ================= LEAVE TYPE CONFIG (CEO-editable, effective-dated) =================
-- Append-only history of entitlement changes per leave type. "Vacation went
-- from 15 to 8 days, effective 2027-01-01" is one new row here, not an edit
-- to an old one — so past years' entitlements stay historically accurate
-- even after a policy changes.
CREATE TABLE public.leave_type_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type public.leave_type NOT NULL,
  total_days NUMERIC NOT NULL,
  effective_from DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.leave_type_config TO authenticated;
GRANT ALL ON public.leave_type_config TO service_role;
ALTER TABLE public.leave_type_config ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.leave_type_config (leave_type, effective_from DESC);

-- Everyone needs to read this to compute their own balance card.
CREATE POLICY "Anyone signed in can view leave config" ON public.leave_type_config
  FOR SELECT TO authenticated USING (true);
-- Only CEO can add a new entitlement change.
CREATE POLICY "CEO adds leave config" ON public.leave_type_config
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'ceo'));

-- Seed today's actual policy as the starting history, so nothing changes
-- visually until the CEO deliberately edits something.
INSERT INTO public.leave_type_config (leave_type, total_days, effective_from) VALUES
  ('vacation', 15, '2026-01-01'),
  ('sick', 15, '2026-01-01'),
  ('birthday', 1, '2026-01-01'),
  ('lieu', 0, '2026-01-01'),
  ('emergency', 3, '2026-01-01');

-- ================= REMOVE THE OLD STATIC BALANCE TABLE =================
-- leave_balances stored one mutable running total per person forever — no
-- year dimension, so it never reset annually and every policy change had to
-- be pushed by hand to every user. It's fully superseded: entitlement now
-- comes from leave_type_config (as of today's date), and "used this year"
-- is computed live from approved leave_requests within the current
-- calendar year — which is also what makes it reset automatically every
-- January with no cron job needed.
DROP TABLE IF EXISTS public.leave_balances;

-- The signup trigger no longer needs to seed balance rows.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'consultant');
  RETURN NEW;
END;
$$;
