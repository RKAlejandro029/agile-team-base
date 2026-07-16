-- Part 2 of 2 — run this AFTER part 1 has succeeded.

-- Update the new-user trigger to seed balances matching the Handbook:
-- Vacation 15 days/yr, Sick 15 days/yr, Birthday 1 day/yr. Lieu starts at 0
-- (it's compensatory time, earned as-needed, not a standing entitlement).
-- Maternity/Paternity/Solo Parent are conditional, qualifying-event leave —
-- intentionally not pre-seeded; an admin sets a balance for an employee once
-- eligibility is confirmed (they can still file the request either way).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'consultant');
  INSERT INTO public.leave_balances (user_id, leave_type, total_days, used_days) VALUES
    (NEW.id, 'vacation', 15, 0),
    (NEW.id, 'sick', 15, 0),
    (NEW.id, 'birthday', 1, 0),
    (NEW.id, 'lieu', 0, 0);
  RETURN NEW;
END;
$$;

-- Backfill Birthday and Lieu balances for users who signed up before this change
INSERT INTO public.leave_balances (user_id, leave_type, total_days, used_days)
SELECT p.id, lt.leave_type, CASE lt.leave_type WHEN 'birthday' THEN 1 ELSE 0 END, 0
FROM public.profiles p
CROSS JOIN (VALUES ('birthday'::public.leave_type), ('lieu'::public.leave_type)) AS lt(leave_type)
ON CONFLICT (user_id, leave_type) DO NOTHING;

-- Align existing Vacation/Sick balances with the Handbook's 15/15 days, but only
-- for anyone who hasn't used any yet -- never silently shrinks a balance someone
-- has already drawn down against.
UPDATE public.leave_balances SET total_days = 15 WHERE leave_type = 'vacation' AND total_days = 20 AND used_days = 0;
UPDATE public.leave_balances SET total_days = 15 WHERE leave_type = 'sick' AND total_days = 10 AND used_days = 0;
