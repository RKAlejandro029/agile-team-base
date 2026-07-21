-- Part 2 of 2 — run this AFTER part 1 has succeeded.

-- ================= CATEGORY (separate from priority) =================
-- Standard IT ticketing practice keeps "what kind of issue" (category) and
-- "how urgently" (priority) as two separate decisions — conflating them makes
-- reporting on recurring problem areas meaningless.
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS category TEXT;

-- ================= SLA: DUE-BY TARGET, TIERED BY PRIORITY =================
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_ticket_due_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.due_at IS NULL THEN
    NEW.due_at := NEW.created_at + CASE NEW.priority
      WHEN 'urgent' THEN INTERVAL '4 hours'
      WHEN 'high' THEN INTERVAL '1 day'
      WHEN 'medium' THEN INTERVAL '3 days'
      ELSE INTERVAL '7 days'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_ticket_due_at BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_due_at();

-- ================= FIRST RESPONSE TIME (separate from resolution time) =================
-- Standard practice treats "someone acknowledged it" and "it's actually
-- fixed" as two different metrics with two different targets.
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_first_response_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ticket_creator UUID;
BEGIN
  SELECT created_by INTO ticket_creator FROM public.tickets WHERE id = NEW.ticket_id;
  IF NEW.user_id IS DISTINCT FROM ticket_creator THEN
    UPDATE public.tickets
    SET first_response_at = NEW.created_at
    WHERE id = NEW.ticket_id AND first_response_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_first_response_at AFTER INSERT ON public.ticket_updates
  FOR EACH ROW EXECUTE FUNCTION public.set_first_response_at();
