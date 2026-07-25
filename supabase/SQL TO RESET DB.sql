-- Rerunnable full reset, keeping only the CEO account.
-- Safe to run again later — deleting an already-empty set just deletes 0 rows.

-- Logs, notifications, and trackers — cleared entirely, regardless of who
-- created them (including anything the CEO themselves logged). CASCADE on
-- all of these so foreign-key order never matters.
TRUNCATE TABLE public.activity_log CASCADE;
TRUNCATE TABLE public.ticket_assignment_history CASCADE;
TRUNCATE TABLE public.ticket_updates CASCADE;
TRUNCATE TABLE public.tickets CASCADE;
TRUNCATE TABLE public.event_attendees CASCADE;
TRUNCATE TABLE public.calendar_events CASCADE;
TRUNCATE TABLE public.messages CASCADE;
TRUNCATE TABLE public.attendance_breaks CASCADE;
TRUNCATE TABLE public.attendance_logs CASCADE;
TRUNCATE TABLE public.leave_requests CASCADE;

-- Every user account except the CEO. Cascades clean up their profile, role,
-- and any remaining per-user rows automatically.
DELETE FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'ceo');
