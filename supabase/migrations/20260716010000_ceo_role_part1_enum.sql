-- Part 1 of 2 — run this one FIRST, on its own (Postgres won't let a new enum
-- value be used in the same transaction that adds it).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ceo';
