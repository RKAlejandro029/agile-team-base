-- ================= ATTENDANCE BREAKS =================
-- One row per break within a shift. A shift (attendance_logs row) can have
-- multiple breaks (lunch, coffee, etc). break_end is null while on break.
CREATE TABLE public.attendance_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_log_id UUID NOT NULL REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  break_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  break_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_breaks TO authenticated;
GRANT ALL ON public.attendance_breaks TO service_role;
ALTER TABLE public.attendance_breaks ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.attendance_breaks (attendance_log_id);
CREATE INDEX ON public.attendance_breaks (user_id, break_start DESC);

CREATE POLICY "Users view own breaks" ON public.attendance_breaks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all breaks" ON public.attendance_breaks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own breaks" ON public.attendance_breaks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own breaks" ON public.attendance_breaks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update any breaks" ON public.attendance_breaks FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ================= WORKSPACE-WIDE TICKET VISIBILITY =================
-- Previously consultants could only SELECT tickets they created or were assigned
-- to. Widen read access so any signed-in consultant can see every ticket (open,
-- pending, in-progress, done) across the team. Write access (insert/update)
-- stays restricted to creator/assignee/admin — this only changes what's visible.
DROP POLICY IF EXISTS "View own or assigned tickets" ON public.tickets;
CREATE POLICY "Anyone signed in can view tickets" ON public.tickets FOR SELECT TO authenticated USING (true);
