-- Part 2 of 2 — run this AFTER part 1 has succeeded.

-- ================= PROMOTE THE FIRST ADMIN TO CEO =================
-- Whoever became admin earliest is treated as the founding CEO. Everyone else
-- who becomes admin afterwards (including future promotions) stays "admin".
UPDATE public.user_roles
SET role = 'ceo'
WHERE id = (
  SELECT id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1
);

-- ================= CEO INHERITS EVERYTHING "ADMIN" ALREADY GRANTS =================
-- Every existing RLS policy in this schema checks has_role(uid, 'admin'). Rather
-- than rewrite two dozen policies, redefine has_role() so a CEO automatically
-- satisfies an 'admin' check too. The one place CEO needs to be *more*
-- restrictive than "same as admin" (managing who holds the admin role) is
-- handled by a separate, CEO-only policy below.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR (_role = 'admin' AND role = 'ceo'))
  );
$$;

-- ================= ONLY CEO CAN GRANT/REVOKE THE ADMIN ROLE =================
-- Admins could previously manage user_roles freely (including making other
-- people admin). Replace that with a CEO-only policy — admins keep every other
-- capability (has_role('admin') still passes for them), they just can't touch
-- role assignments anymore.
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "CEO manages roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));

-- ================= ACTIVITY LOG =================
-- One row per notable event, written by triggers so nothing can be missed by
-- forgetting to log it in application code. CEO-only to read.
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  detail TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.activity_log (occurred_at DESC);
CREATE INDEX ON public.activity_log (actor_id);
CREATE INDEX ON public.activity_log (target_user_id);

CREATE POLICY "CEO views activity log" ON public.activity_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ceo'));

-- Clock in
CREATE OR REPLACE FUNCTION public.log_clock_in()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity_log (actor_id, action, target_user_id, occurred_at)
  VALUES (NEW.user_id, 'clock_in', NEW.user_id, NEW.clock_in);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_clock_in AFTER INSERT ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_clock_in();

-- Clock out
CREATE OR REPLACE FUNCTION public.log_clock_out()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.clock_out IS NULL AND NEW.clock_out IS NOT NULL THEN
    INSERT INTO public.activity_log (actor_id, action, target_user_id, occurred_at)
    VALUES (NEW.user_id, 'clock_out', NEW.user_id, NEW.clock_out);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_clock_out AFTER UPDATE ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_clock_out();

-- Ticket created
CREATE OR REPLACE FUNCTION public.log_ticket_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity_log (actor_id, action, target_user_id, detail, occurred_at)
  VALUES (NEW.created_by, 'ticket_created', NEW.assigned_to, NEW.title, NEW.created_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_ticket_created AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_ticket_created();

-- Ticket completed
CREATE OR REPLACE FUNCTION public.log_ticket_done()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'done' AND NEW.status = 'done' THEN
    INSERT INTO public.activity_log (actor_id, action, target_user_id, detail, occurred_at)
    VALUES (auth.uid(), 'ticket_completed', NEW.assigned_to, NEW.title, now());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_ticket_done AFTER UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_ticket_done();

-- Leave filed
CREATE OR REPLACE FUNCTION public.log_leave_filed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity_log (actor_id, action, target_user_id, detail, occurred_at)
  VALUES (NEW.user_id, 'leave_filed', NEW.user_id, NEW.leave_type::text || ' - ' || NEW.start_date::text, NEW.created_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_leave_filed AFTER INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_leave_filed();

-- Leave approved/rejected
CREATE OR REPLACE FUNCTION public.log_leave_reviewed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    INSERT INTO public.activity_log (actor_id, action, target_user_id, detail, occurred_at)
    VALUES (
      NEW.reviewed_by,
      CASE NEW.status WHEN 'approved' THEN 'leave_approved' ELSE 'leave_rejected' END,
      NEW.user_id,
      NEW.leave_type::text || ' - ' || NEW.start_date::text,
      COALESCE(NEW.reviewed_at, now())
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_leave_reviewed AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_leave_reviewed();
