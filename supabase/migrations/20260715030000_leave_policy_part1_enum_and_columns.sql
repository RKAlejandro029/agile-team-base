-- Part 1 of 2 — run this one FIRST, on its own.
-- Postgres won't let a new enum value be used in the same transaction that adds
-- it, so this is deliberately split from the migration that uses these values.

-- Expand leave types to match the Fintreas Employee Handbook
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'birthday';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'maternity';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'paternity';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'lieu';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'solo_parent';

-- Handbook filing rules need to be tracked per request:
-- - is_emergency: an employee can bypass the 5-working-day advance notice rule
--   for Vacation/Birthday/Lieu leave if it's a genuine emergency (per the
--   Leave Benefits Policy's "except in cases of emergency" clause).
-- - medical_certificate_provided: Sick Leave over 3 consecutive days requires a
--   medical certificate (per the Disciplinary Action Policy's "Failure to
--   submit a Medical Certificate" violation).
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS medical_certificate_provided BOOLEAN NOT NULL DEFAULT false;
