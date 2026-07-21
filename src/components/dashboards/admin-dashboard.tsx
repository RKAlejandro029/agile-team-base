import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, type UserStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Users, Calendar, Ticket, PlaneTakeoff, Coffee } from "lucide-react";
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
  const qc = useQueryClient();

  // Live updates: anyone clocking in/out, starting/ending a break, or filing
  // leave shows up here immediately — no need to switch tabs or wait for the
  // 30s poll. Realtime still respects RLS, so this only ever receives rows
  // this admin could already see via a normal query.
  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-dashboard"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_breaks" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-dashboard"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-dashboard"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-dashboard"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [
        profilesRes,
        rolesRes,
        attendanceRes,
        breaksRes,
        leaveRes,
        ticketsRes,
        allTicketsRes,
        pendingLeaveRes,
      ] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, department, current_task"),
        supabase.from("user_roles").select("user_id, role").eq("role", "consultant"),
        supabase
          .from("attendance_logs")
          .select("id, user_id, clock_in, clock_out")
          .order("clock_in", { ascending: false })
          .limit(500),
        supabase
          .from("attendance_breaks")
          .select("attendance_log_id, break_end")
          .is("break_end", null),
        supabase
          .from("leave_requests")
          .select("id, user_id, status, start_date, end_date")
          .eq("status", "approved")
          .lte("start_date", today)
          .gte("end_date", today),
        supabase.from("tickets").select("id, status").in("status", ["open", "in_progress"]),
        supabase.from("tickets").select("status, due_at"),
        supabase
          .from("leave_requests")
          .select("id, user_id, leave_type, start_date, end_date, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      const consultantIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
      const profiles = (profilesRes.data ?? []).filter((p) => consultantIds.has(p.id));
      const onLeave = new Set((leaveRes.data ?? []).map((l) => l.user_id));
      const openBreakLogIds = new Set((breaksRes.data ?? []).map((b) => b.attendance_log_id));

      const latestByUser = new Map<
        string,
        { id: string; clock_in: string; clock_out: string | null }
      >();
      for (const log of attendanceRes.data ?? []) {
        if (!latestByUser.has(log.user_id)) {
          latestByUser.set(log.user_id, {
            id: log.id,
            clock_in: log.clock_in,
            clock_out: log.clock_out,
          });
        }
      }

      const consultants: ConsultantRow[] = profiles.map((p) => {
        const latest = latestByUser.get(p.id);
        let status: UserStatus = "offline";
        let activeSince: Date | null = null;
        if (onLeave.has(p.id)) status = "leave";
        else if (latest && !latest.clock_out) {
          status = openBreakLogIds.has(latest.id) ? "break" : "active";
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

      // Resolve names for pending leave rows the same decoupled way — the FK
      // points to auth.users, not profiles, so PostgREST can't embed it.
      const pendingRows = pendingLeaveRes.data ?? [];
      const pendingUserIds = [...new Set(pendingRows.map((r) => r.user_id))];
      const { data: pendingProfiles } =
        pendingUserIds.length > 0
          ? await supabase.from("profiles").select("id, full_name, email").in("id", pendingUserIds)
          : { data: [] };
      const pendingById = new Map((pendingProfiles ?? []).map((p) => [p.id, p]));
      const pendingLeave = pendingRows.map((r) => ({
        ...r,
        profile: pendingById.get(r.user_id) ?? null,
      }));

      const allTickets = allTicketsRes.data ?? [];
      const doneAllTime = allTickets.filter((t) => t.status === "done").length;
      const now = new Date();
      const overdueCount = allTickets.filter(
        (t) => t.status !== "done" && t.due_at && new Date(t.due_at) < now,
      ).length;

      return {
        consultants,
        activeCount: consultants.filter((c) => c.status === "active").length,
        onBreakCount: consultants.filter((c) => c.status === "break").length,
        onLeaveCount: consultants.filter((c) => c.status === "leave").length,
        openTickets: ticketsRes.data?.length ?? 0,
        pendingLeave,
        kpi: {
          ticketCompletionRate:
            allTickets.length > 0 ? Math.round((doneAllTime / allTickets.length) * 100) : null,
          ticketsDoneAllTime: doneAllTime,
          totalTickets: allTickets.length,
          overdueCount,
        },
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
      <div className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-md border sm:grid-cols-3 lg:grid-cols-5 sm:divide-x sm:divide-y-0">
        <StatCell
          icon={<Users className="h-3.5 w-3.5" />}
          label="Active now"
          value={data?.activeCount ?? "—"}
          tone="success"
        />
        <StatCell
          icon={<Coffee className="h-3.5 w-3.5" />}
          label="On break"
          value={data?.onBreakCount ?? "—"}
          tone="warning"
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
            <h2 className="font-display text-lg font-medium">Needs approval</h2>
            {data?.pendingLeave && data.pendingLeave.length > 0 && (
              <Button asChild size="sm" variant="outline">
                <Link to="/leave">Review all</Link>
              </Button>
            )}
          </div>
          <div className="divide-y">
            {data?.pendingLeave.map((r) => (
              <Link
                key={r.id}
                to="/leave"
                className="flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-accent/40 sm:px-5"
              >
                <span className="truncate">
                  <span className="font-medium">
                    {r.profile?.full_name || r.profile?.email || "Someone"}
                  </span>{" "}
                  <span className="capitalize text-muted-foreground">{r.leave_type}</span>
                </span>
                <span className="shrink-0 font-mono-data text-xs text-muted-foreground">
                  {formatDistanceToNowStrict(new Date(r.created_at))} ago
                </span>
              </Link>
            ))}
            {data?.pendingLeave.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
                Nothing waiting on you.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-md border">
          <div className="border-b px-4 py-3 sm:px-5">
            <h2 className="font-display text-lg font-medium">Workforce KPIs</h2>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3">
            <div className="px-4 py-4 sm:px-5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Attendance rate
              </p>
              <p className="font-mono-data text-2xl text-foreground">
                {data && data.consultants.length > 0
                  ? Math.round(
                      ((data.activeCount + data.onBreakCount) / data.consultants.length) * 100,
                    )
                  : 0}
                %
              </p>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Ticket completion
              </p>
              <p className="font-mono-data text-2xl text-foreground">
                {data?.kpi.ticketCompletionRate ?? 0}%
              </p>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Tickets done (all time)
              </p>
              <p className="font-mono-data text-2xl text-foreground">
                {data?.kpi.ticketsDoneAllTime ?? 0}
              </p>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Total tickets logged
              </p>
              <p className="font-mono-data text-2xl text-foreground">
                {data?.kpi.totalTickets ?? 0}
              </p>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Overdue (past SLA)
              </p>
              <p
                className={
                  "font-mono-data text-2xl " +
                  ((data?.kpi.overdueCount ?? 0) > 0 ? "text-destructive" : "text-foreground")
                }
              >
                {data?.kpi.overdueCount ?? 0}
              </p>
            </div>
          </div>
        </div>
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
