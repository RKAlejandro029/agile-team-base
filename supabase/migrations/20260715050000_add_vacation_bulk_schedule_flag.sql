-- The Handbook splits the 15-day Vacation Leave entitlement into two filing
-- rules, not two balances: 10 days must be scheduled at the start of the year
-- (single block or staggered), the remaining 5 are Service Incentive Leave
-- (SIL) usable anytime for vacation or personal reasons. Both still draw from
-- the same 15-day pool and both still need the standard 5-working-day notice
-- -- this column only records which bucket a given Vacation request counts
-- against, so the balance card and admin view can show the split.
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS is_bulk_schedule BOOLEAN NOT NULL DEFAULT false;
