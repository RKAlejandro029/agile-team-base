import { cn } from "@/lib/utils";

export type UserStatus = "active" | "break" | "leave" | "offline";

const config: Record<UserStatus, { label: string; dot: string; text: string; bg: string }> = {
  active: { label: "Active", dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  break: { label: "On Break", dot: "bg-warning", text: "text-warning", bg: "bg-warning/10" },
  leave: { label: "On Leave", dot: "bg-info", text: "text-info", bg: "bg-info/10" },
  offline: { label: "Offline", dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted" },
};

export function StatusBadge({ status, className }: { status: UserStatus; className?: string }) {
  const c = config[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", c.bg, c.text, className)}>
      <span className={cn("status-dot", c.dot)} />
      {c.label}
    </span>
  );
}
