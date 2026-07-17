import type { Database } from "@/integrations/supabase/types";

export type LeaveType = Database["public"]["Enums"]["leave_type"];

export const leaveTypeLabels: Record<LeaveType, string> = {
  vacation: "Vacation",
  sick: "Sick",
  birthday: "Birthday",
  lieu: "Lieu",
  maternity: "Maternity",
  paternity: "Paternity",
  solo_parent: "Solo parent",
  personal: "Personal",
};

// Day-of-week labels, JS/date-fns convention: 0=Sun..6=Sat.
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Same days, ordered starting Monday just for natural-reading display
// ("Mon-Fri" instead of the raw 0-6 storage order).
export const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
