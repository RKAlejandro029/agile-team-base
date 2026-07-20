-- ================= NO SELF-APPROVAL OF LEAVE =================
-- Admin/CEO can review anyone's leave except their own — someone else with
-- admin or CEO access has to approve/reject it.
DROP POLICY IF EXISTS "Admins review leave" ON public.leave_requests;
CREATE POLICY "Admins review others leave, not their own" ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND user_id <> auth.uid());

-- ================= TICKETS: CLIENT FIELD =================
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS client TEXT;

-- ================= PER-USER TAB ACCESS =================
-- CEO (or an admin, for consultants only) controls which sidebar tabs a
-- given person can see. Stored as an array of route keys. New users get a
-- sensible default for their role at creation time; CEO can customize any
-- individual person's set afterward from the Team page.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_tabs TEXT[] NOT NULL DEFAULT
  '{dashboard,time,leave,messages,email,calendar,tickets}';

COMMENT ON COLUMN public.profiles.allowed_tabs IS
  'Which sidebar tabs this person can see. Keys: dashboard, time, leave, messages, email, calendar, tickets, team, history, reports.';

-- The CEO doesn't clock in, so there's no reason for Time Tracking to be in
-- their tab set by default (this only affects whoever is CEO right now —
-- CEO can always re-add it for themselves later from the Team page).
UPDATE public.profiles SET allowed_tabs = array_remove(allowed_tabs, 'time')
WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'ceo');

-- ================= NOTIFICATIONS: SEE YOUR OWN ACTIVITY =================
-- activity_log is otherwise CEO-only. This adds a narrow, additional policy
-- so anyone can also see log rows where THEY are the actor or the target
-- (e.g. "your leave was approved by X") for their own dashboard notifications
-- — it doesn't widen visibility into anyone else's activity.
CREATE POLICY "Users see their own activity" ON public.activity_log FOR SELECT TO authenticated
  USING (auth.uid() = actor_id OR auth.uid() = target_user_id);

-- ================= WHO'S ACTIVE RIGHT NOW =================
-- A consultant's own RLS on attendance_logs only lets them see their own rows,
-- so "who's active today" needs a narrow, purpose-built function — same
-- pattern as get_team_leave. Only exposes name + active/break status, nothing
-- else about anyone's attendance history.
CREATE OR REPLACE FUNCTION public.get_active_today()
RETURNS TABLE (user_id UUID, full_name TEXT, status TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, COALESCE(NULLIF(p.full_name, ''), p.email),
    CASE WHEN EXISTS (
      SELECT 1 FROM public.attendance_breaks ab WHERE ab.attendance_log_id = al.id AND ab.break_end IS NULL
    ) THEN 'break' ELSE 'active' END
  FROM public.attendance_logs al
  JOIN public.profiles p ON p.id = al.user_id
  WHERE al.clock_out IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_today() TO authenticated;

-- Tickets now feed the admin/CEO KPI panel live too.
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
