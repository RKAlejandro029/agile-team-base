import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        supabase.from("tickets").select("id, status").eq("created_by", user!.id).in("status", ["open", "in_progress"]),
        supabase.from("messages").select("id").eq("receiver_id", user!.id).is("read_at", null),
        supabase.from("calendar_events").select("id, title, start_time").gte("start_time", today).order("start_time").limit(3),
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
      const { error } = await supabase.from("profiles").update({ current_task: taskDraft }).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });

  const isClockedIn = !!openAttendanceQ.data;
  const activeSince = openAttendanceQ.data ? new Date(openAttendanceQ.data.clock_in) : null;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi {profileQ.data?.full_name?.split(" ")[0] || "there"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isClockedIn ? `You've been active for ${formatDistanceToNowStrict(activeSince!)}.` : "You're currently clocked out."}
        </p>
      </div>

      <Card>
        <CardContent className="p-6 flex flex-col md:flex-row items-stretch md:items-center gap-4">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Time tracking</p>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <p className="text-lg font-semibold">
                {isClockedIn ? `Active for ${formatDistanceToNowStrict(activeSince!)}` : "Not clocked in"}
              </p>
            </div>
          </div>
          <Button
            size="lg"
            className="min-w-[160px]"
            variant={isClockedIn ? "destructive" : "default"}
            onClick={() => clockMutation.mutate()}
            disabled={clockMutation.isPending}
          >
            {isClockedIn ? <><Square className="h-4 w-4 mr-2" /> Clock out</> : <><Play className="h-4 w-4 mr-2" /> Clock in</>}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What are you working on?</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => { e.preventDefault(); saveTask.mutate(); }}
          >
            <Input
              placeholder="e.g. Client A financial audit — reviewing Q3 statements"
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              maxLength={280}
            />
            <Button type="submit" disabled={saveTask.isPending}>Update</Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">Visible on the admin dashboard in real time.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickCard to="/leave" icon={<CalendarDays className="h-4 w-4" />} label="Leave balance"
          value={summaryQ.data?.balances.reduce((a, b) => a + Number(b.total_days) - Number(b.used_days), 0).toFixed(0) ?? "—"}
          sub="days remaining" />
        <QuickCard to="/tickets" icon={<Ticket className="h-4 w-4" />} label="Open tickets" value={summaryQ.data?.openTickets ?? "—"} sub="assigned to you" />
        <QuickCard to="/messages" icon={<MessageSquare className="h-4 w-4" />} label="Unread messages" value={summaryQ.data?.unread ?? "—"} sub="in your inbox" />
        <QuickCard to="/calendar" icon={<Clock className="h-4 w-4" />} label="Next meeting"
          value={summaryQ.data?.events[0] ? new Date(summaryQ.data.events[0].start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}
          sub={summaryQ.data?.events[0]?.title || "Nothing scheduled"} />
      </div>
    </div>
  );
}

function QuickCard({ to, icon, label, value, sub }: { to: string; icon: React.ReactNode; label: string; value: React.ReactNode; sub: string }) {
  return (
    <Link to={to} className="block">
      <Card className="hover:border-primary/50 transition">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            {icon}
            <span>{label}</span>
          </div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{sub}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
