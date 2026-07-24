-- Rerunnable full reset, keeping only the CEO account.
-- Safe to run again later — deleting an already-empty set just deletes 0 rows.

-- Logs, notifications, and trackers — cleared entirely, regardless of who
-- created them (including anything the CEO themselves logged).
TRUNCATE TABLE public.activity_log;
TRUNCATE TABLE public.ticket_assignment_history;
TRUNCATE TABLE public.ticket_updates CASCADE;
TRUNCATE TABLE public.tickets CASCADE;
TRUNCATE TABLE public.event_attendees;
TRUNCATE TABLE public.calendar_events CASCADE;
TRUNCATE TABLE public.messages;
TRUNCATE TABLE public.attendance_breaks;
TRUNCATE TABLE public.attendance_logs;
TRUNCATE TABLE public.leave_requests;

-- Every user account except the CEO. Cascades clean up their profile, role,
-- and any remaining per-user rows automatically.
DELETE FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'ceo');
