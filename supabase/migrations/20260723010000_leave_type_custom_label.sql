-- Lets the CEO rename how a discretionary leave type is displayed (e.g.
-- "Lieu" -> "Compensatory Leave") without touching the underlying enum
-- value that's stored on every request — renaming is purely cosmetic and
-- never requires migrating existing data. NULL means "use the built-in
-- default label."
ALTER TABLE public.leave_type_settings ADD COLUMN IF NOT EXISTS custom_label TEXT;
