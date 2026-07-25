-- Whether a leave type can still be filed going forward. Retiring a type
-- never deletes anything — every past request stays exactly as it was; it
-- just stops appearing as an option for new requests. Statutory types
-- (maternity/paternity/solo_parent) exist because of Philippine law (RA
-- 11210, RA 8187, RA 8972), not company policy, so they're excluded from
-- this table entirely and can't be retired through the app.
CREATE TABLE public.leave_type_settings (
  leave_type public.leave_type PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.leave_type_settings TO authenticated;
GRANT ALL ON public.leave_type_settings TO service_role;
ALTER TABLE public.leave_type_settings ENABLE ROW LEVEL SECURITY;

-- Everyone needs to read this to filter the filing dropdown.
CREATE POLICY "Anyone signed in can view leave type settings" ON public.leave_type_settings
  FOR SELECT TO authenticated USING (true);
-- Only CEO can retire/reactivate a type, and never the statutory ones.
CREATE POLICY "CEO manages leave type settings" ON public.leave_type_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ceo'))
  WITH CHECK (
    public.has_role(auth.uid(), 'ceo')
    AND leave_type NOT IN ('maternity', 'paternity', 'solo_parent')
  );

-- Seed every discretionary type as active by default, so nothing changes
-- visually until the CEO deliberately retires one.
INSERT INTO public.leave_type_settings (leave_type, is_active) VALUES
  ('vacation', true),
  ('sick', true),
  ('birthday', true),
  ('lieu', true),
  ('emergency', true);
