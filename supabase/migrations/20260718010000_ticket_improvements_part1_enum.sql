-- Part 1 of 2 — run this one FIRST, on its own.
-- "Waiting on client" is a distinct pause state, not just "in progress" — the
-- clock is effectively on the client, not on us. Common gap in basic
-- open/in-progress/done setups per standard IT ticketing practice.
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'waiting_client';
