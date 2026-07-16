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
