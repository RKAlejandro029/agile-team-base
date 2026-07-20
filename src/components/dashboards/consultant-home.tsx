import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import {
  Clock,
  Play,
  Square,
  Coffee,
  CalendarDays,
  Ticket,
  TicketCheck,
  CircleDot,
  MessageSquare,
  Users,
  Bell,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const ACTIVITY_LABELS: Record<string, string> = {
  leave_approved: "Your leave was approved",
  leave_rejected: "Your leave was rejected",
  ticket_created: "A ticket was created for you",
};

export function ConsultantHome() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [taskDraft, setTaskDraft] = useState("");

  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profileQ.data?.current_task) setTaskDraft(profileQ.data.current_task);
  }, [profileQ.data?.current_task]);

  const openAttendanceQ = useQuery({
    queryKey: ["open-attendance", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_logs")
        .select("*")
        .eq("user_id", user!.id)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const attendanceLogId = openAttendanceQ.data?.id ?? null;

  // Every break taken during the current open shift — lets us show the
  // currently-open break (if any) plus a running total for the day.
  const breaksQ = useQuery({
    queryKey: ["shift-breaks", attendanceLogId],
    queryFn: async () => {
      if (!attendanceLogId) return [];
      const { data } = await supabase
        .from("attendance_breaks")
        .select("*")
        .eq("attendance_log_id", attendanceLogId)
        .order("break_start", { ascending: true });
      return data ?? [];
    },
    enabled: !!attendanceLogId,
    refetchInterval: 30_000,
  });

  const summaryQ = useQuery({
    queryKey: ["consultant-summary", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [balances, tickets, unread, events] = await Promise.all([
        supabase.from("leave_balances").select("*").eq("user_id", user!.id),
        // Only tickets assigned to (or created by) ME — a ticket handed to a
        // colleague shouldn't show up as "pending" on my dashboard.
        supabase
          .from("tickets")
          .select("id, status")
          .or(`assigned_to.eq.${user!.id},created_by.eq.${user!.id}`),
        supabase.from("messages").select("id").eq("receiver_id", user!.id).is("read_at", null),
        supabase
          .from("calendar_events")
          .select("id, title, start_time")
          .gte("start_time", today)
          .order("start_time")
          .limit(3),
      ]);
      const ticketRows = tickets.data ?? [];
      return {
        balances: balances.data ?? [],
        openTickets: ticketRows.filter((t) => t.status === "open").length,
        ongoingTickets: ticketRows.filter((t) => t.status === "in_progress").length,
        doneTickets: ticketRows.filter((t) => t.status === "done").length,
        unread: unread.data?.length ?? 0,
        events: events.data ?? [],
      };
    },
    enabled: !!user,
  });

  // Who's clocked in right now, company-wide — a small security-definer RPC
  // handles this since normal RLS would only show my own attendance.
  const activeTodayQ = useQuery({
    queryKey: ["active-today"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_today");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // Notifications — anything where I'm the target, most recent first, so I
  // find out my leave got approved without having to go check.
  const notificationsQ = useQuery({
    queryKey: ["my-notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("target_user_id", user!.id)
        .neq("actor_id", user!.id)
        .order("occurred_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const clockMutation = useMutation({
    mutationFn: async () => {
      if (openAttendanceQ.data) {
        if (openBreak) {
          throw new Error("End your break before clocking out.");
        }
        const { error } = await supabase
          .from("attendance_logs")
          .update({ clock_out: new Date().toISOString() })
          .eq("id", openAttendanceQ.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendance_logs").insert({ user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(openAttendanceQ.data ? "Clocked out" : "You're now clocked in");
      qc.invalidateQueries({ queryKey: ["open-attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const breakMutation = useMutation({
    mutationFn: async () => {
      if (!attendanceLogId) throw new Error("Clock in first.");
      if (openBreak) {
        const { error } = await supabase
          .from("attendance_breaks")
          .update({ break_end: new Date().toISOString() })
          .eq("id", openBreak.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendance_breaks")
          .insert({ attendance_log_id: attendanceLogId, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(openBreak ? "Break ended" : "Break started");
      qc.invalidateQueries({ queryKey: ["shift-breaks", attendanceLogId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ current_task: taskDraft })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });

  const isClockedIn = !!openAttendanceQ.data;
  const activeSince = openAttendanceQ.data ? new Date(openAttendanceQ.data.clock_in) : null;
  const firstName = profileQ.data?.full_name?.split(" ")[0] || "there";

  const openBreak = breaksQ.data?.find((b) => !b.break_end) ?? null;
  const closedBreaksSeconds = (breaksQ.data ?? [])
    .filter((b) => b.break_end)
    .reduce(
      (sum, b) =>
        sum + (new Date(b.break_end!).getTime() - new Date(b.break_start).getTime()) / 1000,
      0,
    );

  // Live-ticking elapsed time. React Query only re-renders every 30s (refetchInterval),
  // which read as "no timer" — this forces a re-render every second while clocked in
  // or on break, so the mm:ss actually counts up instead of sitting frozen.
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isClockedIn) {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isClockedIn]);

  const totalBreakSeconds =
    closedBreaksSeconds +
    (openBreak ? (Date.now() - new Date(openBreak.break_start).getTime()) / 1000 : 0);
  const breakDurationLabel = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10 space-y-6">
      <div className="border-b pb-6">
        <p className="font-mono-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium leading-tight text-foreground sm:text-4xl">
          Hi {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {!isClockedIn
            ? "You're currently clocked out."
            : openBreak
              ? `On break — you've been active for ${formatDistanceToNowStrict(activeSince!)} today.`
              : `You've been active for ${formatDistanceToNowStrict(activeSince!)}.`}
        </p>
      </div>

      {/* Shift panel — the day's single most important control */}
      <div className="rounded-md border p-5 sm:p-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 " +
                (openBreak
                  ? "border-warning text-warning"
                  : isClockedIn
                    ? "border-success text-success"
                    : "border-border text-muted-foreground")
              }
            >
              {openBreak ? (
                <Coffee className="h-5 w-5" />
              ) : (
                <Clock className={"h-5 w-5" + (isClockedIn ? " animate-pulse" : "")} />
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {openBreak ? "On break" : "Time tracking"}
              </p>
              <p className="font-mono-data text-lg text-foreground tabular-nums">
                {isClockedIn ? formatDistanceToNowStrict(activeSince!) : "Not clocked in"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {isClockedIn && (
              <Button
                size="lg"
                variant="outline"
                className={
                  "flex-1 sm:flex-none sm:min-w-[140px]" +
                  (openBreak
                    ? " border-warning text-warning hover:bg-warning/10 hover:text-warning"
                    : "")
                }
                onClick={() => breakMutation.mutate()}
                disabled={breakMutation.isPending}
              >
                <Coffee className="mr-2 h-4 w-4" />
                {openBreak ? "End break" : "Start break"}
              </Button>
            )}
            <Button
              size="lg"
              className="flex-1 sm:flex-none sm:min-w-[140px]"
              variant={isClockedIn ? "destructive" : "default"}
              onClick={() => clockMutation.mutate()}
              disabled={clockMutation.isPending || (isClockedIn && !!openBreak)}
              title={isClockedIn && openBreak ? "End your break before clocking out" : undefined}
            >
              {isClockedIn ? (
                <>
                  <Square className="mr-2 h-4 w-4" /> Clock out
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" /> Clock in
                </>
              )}
            </Button>
          </div>
        </div>
        {isClockedIn && totalBreakSeconds > 0 && (
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            Break time today:{" "}
            <span className="font-mono-data text-foreground">
              {breakDurationLabel(totalBreakSeconds)}
            </span>
            {(breaksQ.data?.length ?? 0) > 0 &&
              ` across ${breaksQ.data!.length} break${breaksQ.data!.length > 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      {/* Status line — compact single-row form, no longer a full card block */}
      <div className="flex flex-col gap-2 rounded-md border px-4 py-3 sm:flex-row sm:items-center">
        <label className="shrink-0 text-xs font-medium text-muted-foreground sm:w-36">
          What are you working on?
        </label>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveTask.mutate();
          }}
        >
          <Input
            placeholder="e.g. Client A financial audit"
            value={taskDraft}
            onChange={(e) => setTaskDraft(e.target.value)}
            maxLength={280}
            className="h-8 flex-1 text-sm"
          />
          <Button type="submit" size="sm" disabled={saveTask.isPending}>
            Update
          </Button>
        </form>
      </div>

      {/* Quick figures — ledger strip, matches admin dashboard's stat treatment.
          Ticket counts are just what's assigned to or filed by me. */}
      <div className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-md border sm:grid-cols-3 lg:grid-cols-7 sm:divide-x sm:divide-y-0">
        <QuickCell
          to="/leave"
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          label="Leave balance"
          value={
            summaryQ.data?.balances
              .reduce((a, b) => a + Number(b.total_days) - Number(b.used_days), 0)
              .toFixed(0) ?? "—"
          }
          sub="days remaining"
        />
        <QuickCell
          to="/tickets"
          icon={<CircleDot className="h-3.5 w-3.5" />}
          label="My pending"
          value={summaryQ.data?.openTickets ?? "—"}
          sub="not yet started"
        />
        <QuickCell
          to="/tickets"
          icon={<TicketCheck className="h-3.5 w-3.5" />}
          label="My ongoing"
          value={summaryQ.data?.ongoingTickets ?? "—"}
          sub="in progress"
        />
        <QuickCell
          to="/tickets"
          icon={<Ticket className="h-3.5 w-3.5" />}
          label="My done"
          value={summaryQ.data?.doneTickets ?? "—"}
          sub="completed"
        />
        <QuickCell
          to="/messages"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="Unread"
          value={summaryQ.data?.unread ?? "—"}
          sub="in your inbox"
        />
        <QuickCell
          to="/dashboard"
          icon={<Users className="h-3.5 w-3.5" />}
          label="Active today"
          value={activeTodayQ.data?.length ?? "—"}
          sub="clocked in now"
        />
        <QuickCell
          to="/calendar"
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Next meeting"
          value={
            summaryQ.data?.events[0]
              ? new Date(summaryQ.data.events[0].start_time).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "—"
          }
          sub={summaryQ.data?.events[0]?.title || "Nothing scheduled"}
        />
      </div>

      {/* Who's active + notifications */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-display text-base font-medium">Active today</h2>
          </div>
          <div className="divide-y">
            {activeTodayQ.data?.map((p) => (
              <div
                key={p.user_id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span>{p.full_name}</span>
                <span
                  className={"text-xs " + (p.status === "break" ? "text-warning" : "text-success")}
                >
                  {p.status === "break" ? "On break" : "Active"}
                </span>
              </div>
            ))}
            {activeTodayQ.data?.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No one's clocked in right now.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-md border">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-display text-base font-medium">Notifications</h2>
          </div>
          <div className="divide-y">
            {notificationsQ.data?.map((n) => (
              <div key={n.id} className="px-4 py-2.5 text-sm">
                <p>
                  {ACTIVITY_LABELS[n.action] ?? n.action}
                  {n.detail && <span className="text-muted-foreground"> — {n.detail}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.occurred_at), { addSuffix: true })}
                </p>
              </div>
            ))}
            {notificationsQ.data?.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing new.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickCell({
  to,
  icon,
  label,
  value,
  sub,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <Link to={to} className="block px-4 py-4 transition-colors hover:bg-accent/40 sm:px-5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 font-mono-data text-2xl leading-none text-foreground">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
    </Link>
  );
}
