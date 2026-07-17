-- Per-person work schedule, admin-editable. Days use JS/date-fns convention:
-- 0=Sunday, 1=Monday, ... 6=Saturday. Default is the standard Mon-Fri week;
-- admins can set any other combination (e.g. Sun-Thu, Thu-Mon, or "weekend is
-- Mon+Fri" style schedules) per consultant. This directly drives which dates
-- are selectable when filing leave and how notice/duration are counted, so a
-- consultant's leave rules always match their actual working days.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_days SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_start_time TIME NOT NULL DEFAULT '09:00:00';

COMMENT ON COLUMN public.profiles.work_days IS 'Working days of the week, 0=Sun..6=Sat. Default Mon-Fri.';
COMMENT ON COLUMN public.profiles.work_start_time IS 'Expected daily start time for this consultant.';
