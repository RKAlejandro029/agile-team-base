import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Play, Square, Coffee, Clock as ClockIcon } from "lucide-react";
import { formatDistanceStrict, formatDistanceToNowStrict, format } from "date-fns";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/time")({
  component: TimePage,
});

function TimePage() {
  const { role } = useAuth();

  if (role === "admin") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Time tracking is a consultant-only page — clock-in/out isn't something admins log. To see
          who's active, on break, or on leave right now, head back to the{" "}
          <a href="/dashboard" className="underline underline-offset-2 hover:text-foreground">
            team overview
          </a>
          .
        </p>
      </div>
    );
  }

  return <ConsultantTimePage />;
}

function ConsultantTimePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const logsQ = useQuery({
    queryKey: ["attendance-logs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_logs")
        .select("*")
        .eq("user_id", user!.id)
        .order("clock_in", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const logIds = (logsQ.data ?? []).map((l) => l.id);

  // Every break across the fetched shifts, so the history table can show a
  // per-shift break total instead of only raw clock-in/clock-out.
  const breaksQ = useQuery({
    queryKey: ["attendance-breaks-history", logIds.join(",")],
    queryFn: async () => {
      if (logIds.length === 0) return [];
      const { data, error } = await supabase
        .from("attendance_breaks")
        .select("*")
        .in("attendance_log_id", logIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: logIds.length > 0,
  });

  const openLog = logsQ.data?.find((l) => !l.clock_out);
  const openBreak = breaksQ.data?.find((b) => b.attendance_log_id === openLog?.id && !b.break_end);

  const clock = useMutation({
    mutationFn: async () => {
      if (openLog) {
        if (openBreak) throw new Error("End your break before clocking out.");
        const { error } = await supabase
          .from("attendance_logs")
          .update({ clock_out: new Date().toISOString() })
          .eq("id", openLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendance_logs").insert({ user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(openLog ? "Clocked out" : "You're now clocked in");
      qc.invalidateQueries({ queryKey: ["attendance-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const breakMutation = useMutation({
    mutationFn: async () => {
      if (!openLog) throw new Error("Clock in first.");
      if (openBreak) {
        const { error } = await supabase
          .from("attendance_breaks")
          .update({ break_end: new Date().toISOString() })
          .eq("id", openBreak.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendance_breaks")
          .insert({ attendance_log_id: openLog.id, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(openBreak ? "Break ended" : "Break started");
      qc.invalidateQueries({ queryKey: ["attendance-breaks-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Live-ticking timer — same reasoning as the dashboard widget: without this,
  // the elapsed time only updates when something else triggers a re-render.
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (openLog) {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [openLog]);

  const breaksByLog = (breaksQ.data ?? []).reduce<Record<string, typeof breaksQ.data>>((acc, b) => {
    (acc[b.attendance_log_id] ??= []).push(b);
    return acc;
  }, {});

  const breakSecondsForLog = (logId: string) =>
    (breaksByLog[logId] ?? []).reduce((sum, b) => {
      const end = b.break_end ? new Date(b.break_end).getTime() : Date.now();
      return sum + (end - new Date(b.break_start).getTime()) / 1000;
    }, 0);

  const formatDuration = (seconds: number) => {
    const m = Math.round(seconds / 60);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10 space-y-6">
      <div className="border-b pb-6">
        <p className="font-mono-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Time tracking
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium leading-tight text-foreground sm:text-4xl">
          Your clock history
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every shift, plus time spent on break within each one.
        </p>
      </div>

      {/* Live shift panel — same control as the dashboard, kept in sync via the shared table */}
      <div className="rounded-md border p-5 sm:p-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2",
                openBreak
                  ? "border-warning text-warning"
                  : openLog
                    ? "border-success text-success"
                    : "border-border text-muted-foreground",
              )}
            >
              {openBreak ? (
                <Coffee className="h-5 w-5" />
              ) : (
                <ClockIcon className={cn("h-5 w-5", openLog && "animate-pulse")} />
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {openBreak ? "On break" : openLog ? "Clocked in" : "Not clocked in"}
              </p>
              <p className="font-mono-data text-lg text-foreground tabular-nums">
                {openLog ? formatDistanceToNowStrict(new Date(openLog.clock_in)) : "—"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {openLog && (
              <Button
                size="lg"
                variant="outline"
                className={cn(
                  "flex-1 sm:flex-none sm:min-w-[140px]",
                  openBreak && "border-warning text-warning hover:bg-warning/10 hover:text-warning",
                )}
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
              variant={openLog ? "destructive" : "default"}
              onClick={() => clock.mutate()}
              disabled={clock.isPending || (!!openLog && !!openBreak)}
              title={openLog && openBreak ? "End your break before clocking out" : undefined}
            >
              {openLog ? (
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
      </div>

      <div className="rounded-md border">
        <div className="border-b px-4 py-3 sm:px-5">
          <h2 className="font-display text-lg font-medium">History</h2>
        </div>

        {logsQ.isLoading ? (
          <div className="space-y-3 p-4 sm:p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : logsQ.data?.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No entries yet — clock in to start your history.
          </p>
        ) : (
          <div className="divide-y">
            {logsQ.data?.map((log) => {
              const dur = log.clock_out
                ? formatDistanceStrict(new Date(log.clock_out), new Date(log.clock_in))
                : "In progress";
              const breakSecs = breakSecondsForLog(log.id);
              return (
                <div
                  key={log.id}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {format(new Date(log.clock_in), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(log.clock_in), "h:mm a")} –{" "}
                      {log.clock_out ? format(new Date(log.clock_out), "h:mm a") : "now"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    {breakSecs > 0 && (
                      <span className="font-mono-data text-xs text-warning">
                        {formatDuration(breakSecs)} break
                      </span>
                    )}
                    <span className="font-mono-data text-sm text-foreground">{dur}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
