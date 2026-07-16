-- Lets any signed-in user see who's approved to be on leave within a date
-- range, without widening the leave_requests table's RLS (which keeps reason,
-- pending/rejected requests, and medical-certificate details private to the
-- requester and admins). Mirrors the has_role() SECURITY DEFINER pattern
-- already used in this schema.
CREATE OR REPLACE FUNCTION public.get_team_leave(from_date DATE, to_date DATE)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  leave_type public.leave_type,
  start_date DATE,
  end_date DATE
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT lr.user_id, COALESCE(NULLIF(p.full_name, ''), p.email), lr.leave_type, lr.start_date, lr.end_date
  FROM public.leave_requests lr
  JOIN public.profiles p ON p.id = lr.user_id
  WHERE lr.status = 'approved'
    AND lr.start_date <= to_date
    AND lr.end_date >= from_date;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_leave(DATE, DATE) TO authenticated;
