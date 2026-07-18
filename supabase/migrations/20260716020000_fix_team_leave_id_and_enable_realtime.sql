-- Fix: get_team_leave didn't return a row id, so the calendar had to key its
-- list by user_id+start_date — which collides if the same person has two
-- separate approved leave rows for the same date (e.g. a duplicate filing).
-- Returning the actual leave_requests.id gives a guaranteed-unique key.
DROP FUNCTION IF EXISTS public.get_team_leave(DATE, DATE);
CREATE FUNCTION public.get_team_leave(from_date DATE, to_date DATE)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  full_name TEXT,
  leave_type public.leave_type,
  start_date DATE,
  end_date DATE
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT lr.id, lr.user_id, COALESCE(NULLIF(p.full_name, ''), p.email), lr.leave_type, lr.start_date, lr.end_date
  FROM public.leave_requests lr
  JOIN public.profiles p ON p.id = lr.user_id
  WHERE lr.status = 'approved'
    AND lr.start_date <= to_date
    AND lr.end_date >= from_date;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_leave(DATE, DATE) TO authenticated;

-- Live updates: broadcast changes on these tables so the UI can react
-- immediately (someone clocking in, going on break, or filing/approving
-- leave) without anyone needing to switch tabs or wait for the next poll.
-- Realtime Postgres Changes still respects each table's existing RLS
-- policies, so a consultant only ever receives events for rows they could
-- already SELECT.
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_breaks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
