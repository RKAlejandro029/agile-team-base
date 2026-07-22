-- ================= TICKET REASSIGNMENT TRAIL =================
-- One row per assignee change, so a ticket's detail view can show exactly
-- who it's bounced between, not just the current assignee.
CREATE TABLE public.ticket_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  from_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ticket_assignment_history TO authenticated;
GRANT ALL ON public.ticket_assignment_history TO service_role;
ALTER TABLE public.ticket_assignment_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.ticket_assignment_history (ticket_id, changed_at);

-- Same visibility as tickets themselves — anyone signed in can see who a
-- ticket has been reassigned between, not just admins.
CREATE POLICY "Anyone signed in can view assignment history" ON public.ticket_assignment_history
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.log_ticket_reassignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.ticket_assignment_history (ticket_id, from_user, to_user, changed_by)
    VALUES (NEW.id, OLD.assigned_to, NEW.assigned_to, auth.uid());

    INSERT INTO public.activity_log (actor_id, action, target_user_id, detail, occurred_at)
    VALUES (auth.uid(), 'ticket_reassigned', NEW.assigned_to, NEW.title, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_ticket_reassignment AFTER UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_ticket_reassignment();

-- Live updates for the reassignment trail too.
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_assignment_history;
