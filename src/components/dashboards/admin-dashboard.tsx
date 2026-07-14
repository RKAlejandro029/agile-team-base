import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, type UserStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Users, Calendar, Ticket, PlaneTakeoff } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";

interface ConsultantRow {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  current_task: string | null;
  status: UserStatus;
  activeSince: Date | null;
}

export function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [profilesRes, rolesRes, attendanceRes, leaveRes, ticketsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, department, current_task"),
        supabase.from("user_roles").select("user_id, role").eq("role", "consultant"),
        supabase
          .from("attendance_logs")
          .select("id, user_id, clock_in, clock_out")
          .order("clock_in", { ascending: false })
          .limit(500),
        supabase
          .from("leave_requests")
          .select("id, user_id, status, start_date, end_date")
          .eq("status", "approved")
          .lte("start_date", today)
          .gte("end_date", today),
        supabase.from("tickets").select("id, status").in("status", ["open", "in_progress"]),
      ]);

      const consultantIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
      const profiles = (profilesRes.data ?? []).filter((p) => consultantIds.has(p.id));
      const onLeave = new Set((leaveRes.data ?? []).map((l) => l.user_id));

      const latestByUser = new Map<string, { clock_in: string; clock_out: string | null }>();
      for (const log of attendanceRes.data ?? []) {
        if (!latestByUser.has(log.user_id)) {
          latestByUser.set(log.user_id, { clock_in: log.clock_in, clock_out: log.clock_out });
        }
      }

      const consultants: ConsultantRow[] = profiles.map((p) => {
        const latest = latestByUser.get(p.id);
        let status: UserStatus = "offline";
        let activeSince: Date | null = null;
        if (onLeave.has(p.id)) status = "leave";
        else if (latest && !latest.clock_out) {
          status = "active";
          activeSince = new Date(latest.clock_in);
        }
        return {
          id: p.id,
          full_name: p.full_name || p.email,
          email: p.email,
          department: p.department,
          current_task: p.current_task,
          status,
          activeSince,
        };
      });

      return {
        consultants,
        activeCount: consultants.filter((c) => c.status === "active").length,
        onLeaveCount: consultants.filter((c) => c.status === "leave").length,
        openTickets: ticketsRes.data?.length ?? 0,
      };
    },
    refetchInterval: 30_000,
  });

  const today = new Date();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10 space-y-8">
      <div className="flex flex-col gap-1 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {today.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1 className="mt-1 font-display text-3xl font-medium leading-tight text-foreground sm:text-4xl">
            Team overview
          </h1>
        </div>
        <p className="max-w-xs text-sm text-muted-foreground sm:text-right">
          Who's active, who's out, and what's in flight — updated every 30s.
        </p>
      </div>

      {/* Ledger-style stat strip — one panel, quiet dividers, no icon tiles */}
      <div className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-md border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <StatCell
          icon={<Users className="h-3.5 w-3.5" />}
          label="Active now"
          value={data?.activeCount ?? "—"}
          tone="success"
        />
        <StatCell
          icon={<PlaneTakeoff className="h-3.5 w-3.5" />}
          label="On leave today"
          value={data?.onLeaveCount ?? "—"}
          tone="info"
        />
        <StatCell
          icon={<Ticket className="h-3.5 w-3.5" />}
          label="Open tickets"
          value={data?.openTickets ?? "—"}
          tone="warning"
        />
        <StatCell
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Total consultants"
          value={data?.consultants.length ?? "—"}
          tone="muted"
        />
      </div>

      <div className="rounded-md border">
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
          <h2 className="font-display text-lg font-medium">Consultants</h2>
          <span className="font-mono-data text-xs text-muted-foreground">
            {data ? `${data.consultants.length} total` : ""}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-4 sm:p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : data?.consultants.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No consultants yet. Ask team members to sign up.
          </p>
        ) : (
          <div className="divide-y">
            {data?.consultants.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0 rounded-md">
                    <AvatarFallback className="rounded-md bg-secondary font-mono-data text-xs text-secondary-foreground">
                      {c.full_name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium leading-tight">{c.full_name}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.current_task || <em className="opacity-60 not-italic">No status set</em>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
                  {c.activeSince ? (
                    <span className="font-mono-data text-xs text-muted-foreground">
                      {formatDistanceToNowStrict(c.activeSince)}
                    </span>
                  ) : (
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {c.department || ""}
                    </span>
                  )}
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link to="/messages" search={{ to: c.id } as never}>
                      <MessageSquare className="mr-1 h-3.5 w-3.5" /> Message
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "success" | "info" | "warning" | "muted";
}) {
  const toneText = {
    success: "text-success",
    info: "text-info",
    warning: "text-warning",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="flex flex-col gap-2 px-4 py-4 sm:px-5">
      <div
        className={cn(
          "flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground",
          toneText,
        )}
      >
        {icon}
        <span>{label}</span>
      </div>
      <p className="font-mono-data text-3xl leading-none text-foreground">{value}</p>
    </div>
  );
}
