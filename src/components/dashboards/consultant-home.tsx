import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { Clock, Play, Square, CalendarDays, Ticket, MessageSquare } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

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

  const summaryQ = useQuery({
    queryKey: ["consultant-summary", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [balances, tickets, unread, events] = await Promise.all([
        supabase.from("leave_balances").select("*").eq("user_id", user!.id),
        supabase
          .from("tickets")
          .select("id, status")
          .eq("created_by", user!.id)
          .in("status", ["open", "in_progress"]),
        supabase.from("messages").select("id").eq("receiver_id", user!.id).is("read_at", null),
        supabase
          .from("calendar_events")
          .select("id, title, start_time")
          .gte("start_time", today)
          .order("start_time")
          .limit(3),
      ]);
      return {
        balances: balances.data ?? [],
        openTickets: tickets.data?.length ?? 0,
        unread: unread.data?.length ?? 0,
        events: events.data ?? [],
      };
    },
    enabled: !!user,
  });

  const clockMutation = useMutation({
    mutationFn: async () => {
      if (openAttendanceQ.data) {
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
      toast.success(openAttendanceQ.data ? "Clocked out" : "Clocked in");
      qc.invalidateQueries({ queryKey: ["open-attendance"] });
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10 space-y-8">
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
          {isClockedIn
            ? `You've been active for ${formatDistanceToNowStrict(activeSince!)}.`
            : "You're currently clocked out."}
        </p>
      </div>

      {/* Shift panel — the day's single most important control */}
      <div className="flex flex-col items-stretch gap-4 rounded-md border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3">
          <div
            className={
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 " +
              (isClockedIn ? "border-success text-success" : "border-border text-muted-foreground")
            }
          >
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Time tracking
            </p>
            <p className="font-mono-data text-lg text-foreground">
              {isClockedIn ? formatDistanceToNowStrict(activeSince!) : "Not clocked in"}
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="w-full sm:w-auto sm:min-w-[160px]"
          variant={isClockedIn ? "destructive" : "default"}
          onClick={() => clockMutation.mutate()}
          disabled={clockMutation.isPending}
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

      {/* Status line */}
      <div className="rounded-md border p-5 sm:p-6">
        <h2 className="font-display text-base font-medium">What are you working on?</h2>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            saveTask.mutate();
          }}
        >
          <Input
            placeholder="e.g. Client A financial audit — reviewing Q3 statements"
            value={taskDraft}
            onChange={(e) => setTaskDraft(e.target.value)}
            maxLength={280}
            className="flex-1"
          />
          <Button type="submit" disabled={saveTask.isPending} className="sm:w-auto">
            Update
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Visible on the admin dashboard in real time.
        </p>
      </div>

      {/* Quick figures — ledger strip, matches admin dashboard's stat treatment */}
      <div className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-md border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
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
          icon={<Ticket className="h-3.5 w-3.5" />}
          label="Open tickets"
          value={summaryQ.data?.openTickets ?? "—"}
          sub="assigned to you"
        />
        <QuickCell
          to="/messages"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="Unread"
          value={summaryQ.data?.unread ?? "—"}
          sub="in your inbox"
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
