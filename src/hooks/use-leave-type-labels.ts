import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { leaveTypeLabels, type LeaveType } from "@/lib/leave-types";

// Same query key/shape used by the Leave Policy tab's settingsQ, so this
// shares its cache rather than double-fetching.
export function useLeaveTypeSettings() {
  return useQuery({
    queryKey: ["leave-type-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_type_settings").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Merges the built-in default labels with any CEO-renamed ones. Falls back
// to the default label the instant a rename hasn't loaded yet or doesn't
// exist for a type, so this is always safe to use immediately.
export function useLeaveTypeLabels(): Record<LeaveType, string> {
  const settingsQ = useLeaveTypeSettings();
  const overrides = new Map(
    (settingsQ.data ?? [])
      .filter((s) => s.custom_label && s.custom_label.trim().length > 0)
      .map((s) => [s.leave_type, s.custom_label as string]),
  );
  return Object.fromEntries(
    (Object.keys(leaveTypeLabels) as LeaveType[]).map((t) => [
      t,
      overrides.get(t) ?? leaveTypeLabels[t],
    ]),
  ) as Record<LeaveType, string>;
}
